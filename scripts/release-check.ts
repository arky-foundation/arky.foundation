#!/usr/bin/env bun
/**
 * Release consistency check (governance §9.1.4 / §9.1 gate 6).
 *
 * Recounts the vector files on disk (each vector's own `level` field is the
 * source of truth) and compares against every place counts are published:
 *
 *   1. vectors/manifests/<suite>.json — per-level `vectors` lists, `coverage`,
 *      and `total_vectors`
 *   2. vectors/RELEASES.json — per-suite `levels` counts and `total_vectors`
 *   3. vectors/README.md — the suite table's per-level and total columns
 *   4. Prose tables carrying `LEVEL (n)` tokens: vectors/testing-guide.md,
 *      CONFORMANCE.md, governance/ARKY-COMPAT-MATRIX-v1.md
 *   5. The site's conformance metric (site/src/pages/index.astro, "N/N
 *      published vectors") and, when vectors/RESULTS.json exists, the
 *      CONFORMANCE.md "runs report N passing" claim against its totals
 *
 * Default mode reports every disagreement and exits non-zero (CI gate).
 * `--write` regenerates 1 and 2 from disk; prose (3-5) is hand-written and
 * drift there is always reported, never auto-edited.
 *
 * Usage:
 *   bun run release-check            # check (CI)
 *   bun run release-check --write    # recompute manifests + RELEASES.json
 *
 * Negative-test protocol (run after changing this script): corrupt one count
 * in each surface — a manifest `coverage`, a phantom entry in a manifest
 * `vectors` list, a RELEASES level count, a README row, a testing-guide
 * `LEVEL (n)` token, the site metric — and confirm the check FAILS naming it;
 * then restore and confirm `--write` repairs a corrupted manifest.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const rootDir = join(import.meta.dir, '..');
const write = process.argv.includes('--write');

/** suite key in RELEASES.json -> { dir, manifest } (level-indexed suites only;
 * the integration suite uses the flat-list manifest shape and has no levels). */
const SUITES: Record<string, { dir: string; manifest: string }> = {
  tim: { dir: 'tim', manifest: 'tim.json' },
  canonicalization: { dir: 'canonicalization', manifest: 'canonicalization.json' },
  kernel: { dir: 'kernel', manifest: 'kernel.json' },
  notary: { dir: 'notary', manifest: 'notary.json' },
  settlers: { dir: 'settlers', manifest: 'settlers.json' },
  discovery: { dir: 'discovery', manifest: 'discovery.json' },
  attestations: { dir: 'attest', manifest: 'attestations.json' },
  policy_packs: { dir: 'policy-packs', manifest: 'policy-packs.json' },
  registries: { dir: 'registries', manifest: 'registries.json' },
  errors: { dir: 'errors', manifest: 'errors.json' },
};

/** README table row label per suite key (must match vectors/README.md). */
const README_NAMES: Record<string, string> = {
  tim: 'TIM',
  canonicalization: 'Canonicalization',
  kernel: 'Kernel',
  notary: 'Notary',
  settlers: 'Settlers',
  discovery: 'Discovery',
  attestations: 'Attestations',
  policy_packs: 'Policy Packs',
  registries: 'Registries',
  errors: 'Errors',
};

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  [DRIFT] ${msg}`);
}

/** Count vector files per level in a suite dir (top level only; fixtures and
 * files without an `id`+`level` of their own are not vectors). */
async function countSuite(dir: string): Promise<Map<string, string[]>> {
  const byLevel = new Map<string, string[]>();
  const entries = await readdir(join(rootDir, 'vectors', dir), { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const v = JSON.parse(await readFile(join(rootDir, 'vectors', dir, e.name), 'utf-8'));
    if (typeof v.id !== 'string' || typeof v.level !== 'string') continue;
    byLevel.set(v.level, [...(byLevel.get(v.level) ?? []), e.name].sort());
  }
  return byLevel;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  console.log(`Release consistency check${write ? ' (--write)' : ''}`);
  console.log('=========================\n');

  const releasesPath = join(rootDir, 'vectors/RELEASES.json');
  const releases = JSON.parse(await readFile(releasesPath, 'utf-8'));
  const readme = await readFile(join(rootDir, 'vectors/README.md'), 'utf-8');
  const counts: Record<string, Map<string, string[]>> = {};

  for (const [suite, { dir, manifest }] of Object.entries(SUITES)) {
    const byLevel = (counts[suite] = await countSuite(dir));
    const total = [...byLevel.values()].reduce((n, v) => n + v.length, 0);
    const manifestPath = join(rootDir, 'vectors/manifests', manifest);
    const m = JSON.parse(await readFile(manifestPath, 'utf-8'));
    let manifestDirty = false;

    // 1. Manifest: per-level vectors/coverage + total. Levels present on disk
    //    must exist in the manifest; declared-but-empty levels are future work.
    for (const [level, filesOnDisk] of byLevel) {
      const lm = m.levels?.[level];
      if (!lm) {
        fail(`${manifest}: level ${level} has ${filesOnDisk.length} vector(s) on disk but is not declared`);
        continue;
      }
      const listed = [...(lm.vectors ?? [])].sort();
      if (!eq(listed, filesOnDisk)) {
        fail(`${manifest}: ${level} vectors list != disk (listed ${listed.length}, on disk ${filesOnDisk.length})`);
        if (write) { lm.vectors = filesOnDisk; manifestDirty = true; }
      }
      if (lm.coverage !== filesOnDisk.length) {
        fail(`${manifest}: ${level} coverage ${lm.coverage} != ${filesOnDisk.length}`);
        if (write) { lm.coverage = filesOnDisk.length; manifestDirty = true; }
      }
    }
    for (const [level, lm] of Object.entries(m.levels ?? {}) as [string, any][]) {
      if (!byLevel.has(level) && (lm.vectors?.length ?? 0) > 0) {
        fail(`${manifest}: level ${level} lists ${lm.vectors.length} vector(s) that do not exist on disk`);
        if (write) { lm.vectors = []; lm.coverage = 0; manifestDirty = true; }
      }
    }
    if (m.total_vectors !== total) {
      fail(`${manifest}: total_vectors ${m.total_vectors} != ${total}`);
      if (write) { m.total_vectors = total; manifestDirty = true; }
    }
    if (write && manifestDirty) {
      m.status = { ...m.status, last_updated: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
      await writeFile(manifestPath, JSON.stringify(m, null, 2) + '\n');
      console.log(`  [WROTE] vectors/manifests/${manifest}`);
    }

    // 2. RELEASES.json per-suite counts.
    const rs = releases.suites?.[suite];
    if (!rs) {
      fail(`RELEASES.json: suite '${suite}' missing`);
    } else {
      const releaseLevels: Record<string, number> = {};
      for (const level of Object.keys(rs.levels ?? {})) releaseLevels[level] = 0;
      for (const [level, files] of byLevel) releaseLevels[level] = files.length;
      if (!eq(rs.levels, releaseLevels)) {
        fail(`RELEASES.json: ${suite}.levels ${JSON.stringify(rs.levels)} != ${JSON.stringify(releaseLevels)}`);
        if (write) rs.levels = releaseLevels;
      }
      if (rs.total_vectors !== total) {
        fail(`RELEASES.json: ${suite}.total_vectors ${rs.total_vectors} != ${total}`);
        if (write) rs.total_vectors = total;
      }
    }

    // 3. README table row: level columns in manifest declaration order, then
    //    the row total. (README is prose — reported, never auto-written.)
    const row = readme.split('\n').find((l) => l.startsWith(`| ${README_NAMES[suite]} |`));
    if (!row) {
      fail(`vectors/README.md: no table row for '${README_NAMES[suite]}'`);
    } else {
      const cells = row.split('|').map((c) => c.trim());
      // | name | spec | L1 | L2 | L3 | total | status | -> cells[3..5], cells[6]
      const levelOrder = Object.keys(m.levels ?? {});
      levelOrder.forEach((level, i) => {
        const cell = cells[3 + i];
        const n = byLevel.get(level)?.length ?? 0;
        if (cell !== undefined && cell !== '—' && Number(cell) !== n) {
          fail(`vectors/README.md: ${README_NAMES[suite]} ${level} column says ${cell}, disk has ${n}`);
        }
      });
      if (Number(cells[6]) !== total) {
        fail(`vectors/README.md: ${README_NAMES[suite]} total says ${cells[6]}, disk has ${total}`);
      }
    }
  }

  // Grand total row in the README.
  const grand = Object.values(counts).reduce(
    (n, byLevel) => n + [...byLevel.values()].reduce((m, v) => m + v.length, 0), 0);
  const totalRow = readme.split('\n').find((l) => l.startsWith('| **Total**'));
  const totalCell = totalRow?.split('|').map((c) => c.trim())[6]?.replace(/\*/g, '');
  if (totalCell !== undefined && Number(totalCell) !== grand) {
    fail(`vectors/README.md: grand total says ${totalCell}, disk has ${grand}`);
  }

  // 4. Prose tables carrying `LEVEL (n)` tokens: match rows by suite display
  //    name, then every parenthesized level count on the row must match disk.
  const DOC_ALIASES: Record<string, string[]> = {
    tim: ['TIM'],
    canonicalization: ['Canonicalization', 'TIM Canonicalization'],
    kernel: ['Kernel'],
    notary: ['Notary'],
    settlers: ['Settlers'],
    discovery: ['Discovery'],
    attestations: ['Attestations'],
    policy_packs: ['Policy Packs'],
    registries: ['Registries'],
    errors: ['Errors'],
  };
  const docs: Record<string, string> = {};
  for (const doc of ['vectors/testing-guide.md', 'CONFORMANCE.md', 'governance/ARKY-COMPAT-MATRIX-v1.md']) {
    docs[doc] = await readFile(join(rootDir, doc), 'utf-8');
    for (const line of docs[doc].replace(/\*\*/g, '').split('\n')) {
      if (!line.startsWith('| ')) continue;
      const name = line.split('|')[1]?.trim();
      const suite = Object.entries(DOC_ALIASES).find(([, names]) => names.includes(name))?.[0];
      if (!suite) continue;
      for (const m of line.matchAll(/([A-Z]{1,3}\d+)\s*\((\d+)\)/g)) {
        const n = counts[suite].get(m[1])?.length ?? 0;
        if (Number(m[2]) !== n) fail(`${doc}: ${name} ${m[1]} says ${m[2]}, disk has ${n}`);
      }
    }
  }

  // 5a. Site conformance metric ("N/N published vectors passing").
  const site = await readFile(join(rootDir, 'site/src/pages/index.astro'), 'utf-8').catch(() => '');
  const metric = site.match(/class="num">(\d+)<em>\/<\/em>(\d+)</);
  if (metric && (Number(metric[1]) !== grand || Number(metric[2]) !== grand)) {
    fail(`site/src/pages/index.astro: metric says ${metric[1]}/${metric[2]}, disk has ${grand}`);
  }

  // 5b. CONFORMANCE.md "runs report N passing" vs the last results artifact
  //     (vectors/RESULTS.json is generated by `bun run verify --results`,
  //     which `bun run validate` and CI both do; skipped when absent).
  const resultsRaw = await readFile(join(rootDir, 'vectors/RESULTS.json'), 'utf-8').catch(() => null);
  const claim = docs['CONFORMANCE.md'].match(/runs report (\d+) passing/);
  if (resultsRaw && claim) {
    const total = JSON.parse(resultsRaw).totals?.total;
    if (typeof total === 'number' && Number(claim[1]) !== total) {
      fail(`CONFORMANCE.md: "runs report ${claim[1]} passing" but the results artifact has ${total} checks`);
    }
  }

  if (write) {
    await writeFile(releasesPath, JSON.stringify(releases, null, 2) + '\n');
    console.log('  [WROTE] vectors/RELEASES.json');
  }

  console.log(failures === 0
    ? `\nAll counts consistent (${grand} vectors across ${Object.keys(SUITES).length} suites).`
    : `\n${failures} inconsistenc${failures === 1 ? 'y' : 'ies'} found${write ? ' (manifests/RELEASES rewritten; fix README by hand)' : ''}.`);
  if (failures > 0 && !write) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
