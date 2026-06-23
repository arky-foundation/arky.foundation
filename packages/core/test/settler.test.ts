/**
 * Settler conformance: @arky/core's execute() against the S1 vectors. Validates
 * execution requests (verb/args/rail), produces signed XRs, and dedupes by
 * idempotency key — independently of the repo tooling.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  execute,
  deriveIdempotencyKey,
  argsHash,
  verifyDetached,
  canonicalize,
  cidFromCanonical,
  type IdempotencyStore,
} from '../src/index.ts';
import { ed25519 } from '@noble/curves/ed25519';

const REPO = join(import.meta.dir, '../../..');
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), 'utf-8'));

// Deterministic test settler key (NOT a fixture key).
const SEED = new Uint8Array(32).fill(9);
const PUB = ed25519.getPublicKey(SEED);

describe('Settler S1 vectors', () => {
  const dir = 'vectors/settlers';
  // Shared store so the idempotency vector (s1-005 reuses s1-001's key) hits cache.
  const store: IdempotencyStore = new Map();

  for (const f of readdirSync(join(REPO, dir))
    .filter((x) => x.endsWith('.json'))
    .sort()) {
    const v = read(join(dir, f));
    test(`${v.id}: ${v.description}`, () => {
      const exp = v.expect ?? {};
      const req = {
        verb: v.inputs.verb,
        params: v.inputs.params,
        rail: v.inputs.rail ?? v.inputs.params?.rail,
        idempotency_key: v.inputs.idempotency_key,
        commitment_cid: v.inputs.commitment_cid,
      };
      // s1-005 tests idempotency by reusing s1-001's key; pre-seed the cache so
      // this test does not depend on test execution order (CI may reorder).
      if (v.id === 's1-005') {
        const first = read(join(dir, 's1-001.json'));
        execute(
          {
            verb: first.inputs.verb,
            params: first.inputs.params,
            rail: first.inputs.rail,
            idempotency_key: first.inputs.idempotency_key,
          },
          { privateKey: SEED, ts: '2025-10-15T12:00:01Z', store },
        );
      }
      const res = execute(req, {
        privateKey: SEED,
        kid: 'test-settler',
        ts: v.context?.time ?? '2025-10-15T12:00:01Z',
        store,
      });

      if (exp.status) expect(res.status).toBe(exp.status);
      if (Array.isArray(exp.errors) && exp.errors.length) {
        for (const e of exp.errors) expect(res.errors).toContain(e);
      }
      if (Array.isArray(exp.missing_fields)) expect(res.missing_fields).toEqual(exp.missing_fields);

      if (exp.execution_receipt) {
        expect(res.receipt).toBeDefined();
        const xr = res.receipt!;
        if (exp.execution_receipt.verb) expect(xr.verb).toBe(exp.execution_receipt.verb);
        if (exp.execution_receipt.has_anchor) expect(xr.anchors?.length ?? 0).toBeGreaterThan(0);
        // The XR is a real signed, content-addressed artifact.
        const { cid, sig, ...bodyXr } = xr;
        expect(cidFromCanonical(canonicalize(bodyXr))).toBe(cid);
        expect(verifyDetached(sig, new TextEncoder().encode(canonicalize(bodyXr)), PUB)).toBe(true);
      }
    });
  }
});

describe('Idempotency (§6.1)', () => {
  test('same key returns the identical receipt (cid stable)', () => {
    const store: IdempotencyStore = new Map();
    const req = {
      verb: 'arky:verb/pay@v1',
      params: { to: 'acct:x', amount: { value: 1, unit: 'USD' }, rail: 'ach:us' },
      idempotency_key: 'k-1',
    };
    const a = execute(req, { privateKey: SEED, ts: '2025-10-15T12:00:01Z', store });
    const b = execute(req, { privateKey: SEED, ts: '2025-10-15T12:05:00Z', store }); // later ts, same key
    expect(a.receipt!.cid).toBe(b.receipt!.cid); // cached, not re-signed
  });

  test('derived key is deterministic and JCS-based', () => {
    const args = { to: 'acct:x', amount: { value: 1, unit: 'USD' } };
    const k1 = deriveIdempotencyKey({
      commitment_cid: 'zC',
      verb: 'arky:verb/pay@v1',
      rail: 'ach:us',
      args,
    });
    const k2 = deriveIdempotencyKey({
      commitment_cid: 'zC',
      verb: 'arky:verb/pay@v1',
      rail: 'ach:us',
      args,
    });
    expect(k1).toBe(k2);
    expect(k1[0]).toBe('z'); // multibase
    expect(argsHash(args)[0]).toBe('z');
  });
});
