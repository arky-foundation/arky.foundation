#!/usr/bin/env bun
// Emit "<STATUS>|<xr cid>" for an S1 settler vector, so CI can compare
// @arky/core (TS) execution receipts against arky-core (Rust).
// Usage: bun run scripts/xr.ts <path-to-s1-vector.json>
import { readFileSync } from 'node:fs';
import { execute } from '../src/index.ts';

const v = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
if (v.level !== 'S1') {
  process.stdout.write('SKIP');
} else {
  const i = v.inputs;
  const seed = new Uint8Array(32).fill(9);
  const r = execute(
    { verb: i.verb, params: i.params, rail: i.rail, idempotency_key: i.idempotency_key },
    { privateKey: seed, kid: 'test-settler', ts: v.context?.time ?? '2025-10-15T12:00:01Z', store: new Map() },
  );
  process.stdout.write(`${r.status}|${r.receipt ? r.receipt.cid : ''}`);
}
