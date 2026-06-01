#!/usr/bin/env bun
/**
 * Relative markdown link checker.
 *
 * Walks all *.md files and verifies that relative links and inline references
 * to repo files (paths ending in .md / .json) resolve to an existing file.
 * External links (http/https), anchors (#...), and mailto are ignored.
 *
 * Catches the class of breakage where docs reference a spec by a stale path
 * (e.g. specs/ARKY-TIM-v1.md instead of specs/core/ARKY-TIM-v1.md).
 *
 * Usage: bun run scripts/check-links.ts
 */

import { readFile } from 'fs/promises';
import { glob } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

const rootDir = join(import.meta.dir, '..');

// Top-level repo directories. A path that begins with one of these is treated
// as repo-root-relative (the convention used in prose and backtick references),
// regardless of where the referencing file lives.
const TOP_DIRS = ['specs', 'schemas', 'registries', 'policies', 'vectors', 'examples', 'governance', 'rfcs', 'guides', 'translations'];
const topDirAlt = TOP_DIRS.join('|');

// Markdown links: [text](target)
const mdLink = /\[[^\]]*\]\(([^)]+)\)/g;
// Bare repo path references in prose/backticks: specs/.../X-v1.md or schemas/.../Y.json
const barePath = new RegExp(`(?<![\\w./-])((?:${topDirAlt})/[A-Za-z0-9._/-]+\\.(?:md|json))`, 'g');

let broken = 0;
let checked = 0;

function resolveTarget(fileDir: string, target: string): string | null {
  let t = target.trim().split('#')[0].split('?')[0];
  if (!t) return null; // pure anchor
  if (/^(https?:|mailto:|tel:)/.test(t)) return null; // external
  if (t.startsWith('/')) return join(rootDir, t.slice(1)); // explicit root-relative
  // Paths starting with a known top-level dir are repo-root-relative by convention.
  if (new RegExp(`^(?:${topDirAlt})/`).test(t)) return join(rootDir, t);
  return resolve(fileDir, t); // otherwise file-relative (./, ../, sibling)
}

for await (const f of glob('**/*.md')) {
  if (f.includes('node_modules')) continue;
  const abs = resolve(rootDir, f);
  const dir = dirname(abs);
  const text = await readFile(abs, 'utf-8');

  const targets = new Set<string>();
  for (const m of text.matchAll(mdLink)) targets.add(m[1]);
  for (const m of text.matchAll(barePath)) targets.add(m[1]);

  for (const target of targets) {
    // Skip obvious placeholder/instructional link text in templates.
    if (/^(link to |XXXX-|<|\.\.\/XXXX)/i.test(target.trim())) continue;
    const resolved = resolveTarget(dir, target);
    if (resolved === null) continue;
    checked++;
    if (!existsSync(resolved)) {
      broken++;
      console.log(`  [BROKEN] ${f} -> ${target}`);
    }
  }
}

console.log(`\nChecked ${checked} relative references; ${broken} broken.`);
if (broken > 0) process.exit(1);
