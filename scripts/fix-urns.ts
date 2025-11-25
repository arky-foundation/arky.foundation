#!/usr/bin/env bun
/**
 * Fix URN format inconsistencies
 *
 * Standardizes on the format defined in ARKY-REGISTRIES-v1:
 * - arky:verb/pay@v1 (not urn:arky:verb:pay@v1)
 * - arky:unit/temp.C (not urn:arky:unit:temp.C)
 * - arky:rail/ach:us@v1 (not urn:arky:rail:ach:us@v1)
 *
 * Usage: bun run scripts/fix-urns.ts
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, relative } from 'path';

// URN transformation patterns
const TRANSFORMS: [RegExp, string][] = [
  // Verbs: urn:arky:verb:pay@v1 -> arky:verb/pay@v1
  [/urn:arky:verb:([a-z_.]+)@(v\d+)/g, 'arky:verb/$1@$2'],
  // Rails: urn:arky:rail:ach:us@v1 -> arky:rail/ach:us@v1
  [/urn:arky:rail:([a-z0-9:._-]+)@(v\d+)/g, 'arky:rail/$1@$2'],
  // Units: urn:arky:unit:temp.C -> arky:unit/temp.C
  [/urn:arky:unit:([a-zA-Z0-9._-]+)/g, 'arky:unit/$1'],
  // Notary: urn:arky:notary:xxx@v1 -> arky:notary/xxx@v1
  [/urn:arky:notary:([a-z0-9._-]+)@(v\d+)/g, 'arky:notary/$1@$2'],
  // Schema: urn:arky:schema:xxx@v1 -> arky:schema/xxx@v1
  [/urn:arky:schema:([a-z0-9._-]+)@(v\d+)/g, 'arky:schema/$1@$2'],
  // Attest: urn:arky:attest:xxx@v1 -> arky:attest/xxx@v1
  [/urn:arky:attest:([a-z0-9._-]+)@(v\d+)/gi, 'arky:attest/$1@$2'],
  // Policy: urn:arky:policy:xxx@v1 -> arky:policy/xxx@v1
  [/urn:arky:policy:([a-z0-9._-]+)@(v\d+)/g, 'arky:policy/$1@$2'],
  // Generic catch-all for remaining patterns
  [/urn:arky:([a-z]+):([a-zA-Z0-9._-]+)/g, 'arky:$1/$2'],
];

async function processFile(filePath: string): Promise<boolean> {
  const content = await readFile(filePath, 'utf-8');
  let modified = content;

  for (const [pattern, replacement] of TRANSFORMS) {
    modified = modified.replace(pattern, replacement);
  }

  if (modified !== content) {
    await writeFile(filePath, modified);
    return true;
  }
  return false;
}

async function processDirectory(dir: string, rootDir: string): Promise<number> {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and .git
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      count += await processDirectory(fullPath, rootDir);
    } else if (entry.name.endsWith('.json') || entry.name.endsWith('.md')) {
      const relPath = relative(rootDir, fullPath);
      if (await processFile(fullPath)) {
        console.log(`  ${relPath}`);
        count++;
      }
    }
  }

  return count;
}

async function main() {
  console.log('Arky URN Standardization Script');
  console.log('================================\n');
  console.log('Transforming urn:arky:<ns>:<name> -> arky:<ns>/<name>\n');

  const rootDir = join(import.meta.dir, '..');

  const count = await processDirectory(rootDir, rootDir);

  console.log(`\nDone! Modified ${count} files.`);
}

main().catch(console.error);
