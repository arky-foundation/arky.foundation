#!/usr/bin/env bun
// Emit "<STATUS>|<authorized verbs>" for a K1 kernel vector, so CI can compare
// @arky/core (TS) kernel decisions against arky-core (Rust).
// Usage: bun run scripts/decide.ts <path-to-k1-vector.json> <repo-root>
import { readFileSync } from 'node:fs';
import { evaluateKernel } from '../src/index.ts';

const path = process.argv[2];
const root = process.argv[3] ?? `${import.meta.dir}/../../..`;
const v = JSON.parse(readFileSync(path, 'utf-8'));
const c = v.inputs?.commitment;
if (!c) {
  process.stdout.write('NONE');
} else {
  const tims = [];
  if (v.context?.fixtures?.tim)
    tims.push(JSON.parse(readFileSync(`${root}/vectors/${v.context.fixtures.tim}`, 'utf-8')).tim);
  // Inline evidence (K2 vectors embed their TIMs directly so they are
  // self-contained); each entry is a full TIM object.
  if (Array.isArray(v.context?.evidence)) tims.push(...v.context.evidence);
  const d = evaluateKernel(c, tims, { time: v.context?.time });
  process.stdout.write(
    `${d.status}|${d.authorized.map((x: { name: string }) => x.name).join(',')}`,
  );
}
