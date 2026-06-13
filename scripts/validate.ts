#!/usr/bin/env bun
/**
 * Arky umbrella validation: runs every local check and fails if any fails.
 *
 *   1. JSON syntax across schemas/registries/policies/vectors/examples
 *   2. Conformance verifier (cids, signatures, witnesses, algorithmic vectors)
 *   3. Kernel vectors vs schema
 *   4. Relative link checker
 *
 * Schema (AJV) validation runs in CI (validate-schemas.yaml); it needs the
 * ajv-cli dev dep and is not duplicated here. Run this before proposing changes:
 *
 *   bun run validate
 */

import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const rootDir = join(import.meta.dir, '..');

function run(label: string, cmd: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n=== ${label} ===`);
    const p = spawn(cmd[0], cmd.slice(1), { cwd: rootDir, stdio: 'inherit' });
    p.on('close', (code) => resolve(code === 0));
  });
}

async function listJson(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listJson(full)));
    else if (e.name.endsWith('.json')) out.push(full);
  }
  return out;
}

async function checkJsonSyntax(): Promise<boolean> {
  console.log('\n=== JSON syntax ===');
  const roots = ['schemas', 'registries', 'policies', 'vectors', 'examples'];
  let files: string[] = [];
  for (const r of roots) files = files.concat(await listJson(join(rootDir, r)));
  const bad: string[] = [];
  for (const f of files) {
    try { JSON.parse(await readFile(f, 'utf-8')); }
    catch (e) { bad.push(`${f}: ${(e as Error).message}`); }
  }
  if (bad.length) { console.log('Invalid JSON:\n' + bad.map((b) => '  - ' + b).join('\n')); return false; }
  console.log(`Validated ${files.length} JSON files.`);
  return true;
}

async function main() {
  const results: [string, boolean][] = [];
  results.push(['JSON syntax', await checkJsonSyntax()]);
  results.push(['Conformance verifier', await run('Conformance verifier', ['bun', 'run', 'scripts/verify-artifacts.ts'])]);
  results.push(['Kernel vectors vs schema', await run('Kernel vectors vs schema', ['bun', 'run', 'scripts/validate-kernel-vectors.ts'])]);
  results.push(['Link checker', await run('Link checker', ['bun', 'run', 'scripts/check-links.ts'])]);

  console.log('\n========== SUMMARY ==========');
  let allOk = true;
  for (const [label, ok] of results) {
    console.log(`  ${ok ? '[PASS]' : '[FAIL]'} ${label}`);
    if (!ok) allOk = false;
  }
  console.log(allOk ? '\nAll checks passed.' : '\nSome checks FAILED.');
  process.exit(allOk ? 0 : 1);
}

main();
