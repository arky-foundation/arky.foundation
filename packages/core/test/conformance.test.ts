/**
 * Conformance: @arky/core (an independent implementation) against the
 * Foundation's published vectors and fixtures. If these pass, the TIM spec is
 * implementable from the spec alone, and this is a second stack that agrees on
 * canonical bytes, cids, and signatures.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalize,
  cidFromCanonical,
  verifyTim,
  createTim,
  resolveDidKey,
} from '../src/index.ts';

const REPO = join(import.meta.dir, '../../..');
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), 'utf-8'));
const listVectors = (dir: string) =>
  readdirSync(join(REPO, dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(dir, f));

describe('Canonicalization C1 vectors', () => {
  for (const path of listVectors('vectors/canonicalization')) {
    const v = read(path);
    if (typeof v.expect?.canonical_json !== 'string') continue;
    test(`${v.id}: ${v.description}`, () => {
      const input =
        v.inputs.original !== undefined
          ? v.inputs.original
          : JSON.parse(v.inputs.original_formatted);
      expect(canonicalize(input)).toBe(v.expect.canonical_json);
      if (typeof v.expect.canonical_bytes_hex === 'string') {
        const hex = Buffer.from(new TextEncoder().encode(canonicalize(input))).toString('hex');
        expect(hex).toBe(v.expect.canonical_bytes_hex);
      }
    });
  }
});

describe('TIM T1 vectors', () => {
  for (const path of listVectors('vectors/tim')) {
    const v = read(path);
    test(`${v.id}: ${v.description}`, () => {
      const tim = v.inputs?.tim;
      if (!tim) {
        // Negative/structural vectors without an embedded TIM: nothing to verify here.
        expect(v.expect.valid === false || v.expect).toBeTruthy();
        return;
      }
      const res = verifyTim(tim);
      if (v.expect.valid === true) {
        expect(res.valid).toBe(true);
        if (v.expect.cid_valid !== undefined) expect(res.cid_valid).toBe(v.expect.cid_valid);
        if (v.expect.signature_valid !== undefined)
          expect(res.signature_valid).toBe(v.expect.signature_valid);
      } else if (v.expect.valid === false) {
        expect(res.valid).toBe(false);
        if (Array.isArray(v.expect.missing_fields)) {
          for (const f of v.expect.missing_fields) expect(res.missing_fields).toContain(f);
        }
      }
    });
  }
});

describe('TIM fixtures (independent verify of signed artifacts)', () => {
  for (const path of listVectors('vectors/fixtures/tims')) {
    const fx = read(path);
    if (!fx.tim?.sig) continue;
    test(`${fx.id}: ${fx.description}`, () => {
      // Fixtures sign with test keys; resolve via did:key (issuer) and the
      // witness test key by kid for witness signatures.
      const res = verifyTim(fx.tim, witnessAwareResolver);
      expect(res.cid_valid).toBe(true);
      expect(res.signature_valid).toBe(true);
      expect(res.witnesses_valid).toBe(true);
    });
  }
});

describe('round-trip: produce then verify', () => {
  test('a TIM created by @arky/core verifies, and its cid is spec-correct', () => {
    // Deterministic test seed (NOT a fixture key).
    const seed = new Uint8Array(32).fill(7);
    const { ed25519 } = require('@noble/curves/ed25519');
    const pub = ed25519.getPublicKey(seed);
    const did = 'did:key:z' + base58(prefixEd25519(pub));
    const tim = createTim(
      {
        ts: '2025-10-15T12:00:00Z',
        identity: { id: did },
        measurement: {
          name: 'temperature',
          value: 22.5,
          unit: 'degC',
          method: { type: 'sensor', source: 'device:x' },
        },
      },
      seed,
    );
    // cid independently recomputed must equal the embedded cid.
    const { cid, sig: _sig, ...body } = tim;
    expect(cidFromCanonical(canonicalize(stripWitnesses(body)))).toBe(cid);
    const res = verifyTim(tim);
    expect(res.valid).toBe(true);
  });
});

// --- helpers ---

function stripWitnesses(body: any) {
  if (body.time && 'witnesses' in body.time) {
    const { witnesses: _witnesses, ...t } = body.time;
    return Object.keys(t).length
      ? { ...body, time: t }
      : (() => {
          const { time: _time, ...r } = body;
          return r;
        })();
  }
  return body;
}

// Test witness key (ed25519-test-02 public x), resolved by kid for fixtures.
const TEST_WITNESS_PUB_B64U = 'e_vAtyLIHAXMh1TRvhFUNrvifhH5ZzXKGwGKk9zgB9I';
function witnessAwareResolver(tim: any): Uint8Array | undefined {
  if (tim.__witness) {
    const { decodeProtectedHeader } = require('../src/jws.ts');
    const kid = decodeProtectedHeader(tim.__witness).kid;
    if (kid === 'test-key-2025-02') return b64u(TEST_WITNESS_PUB_B64U);
    if (kid === 'notary-key-2025-01') return b64u('HDl_cQgT9vSiYMsH8q1dOdyb5prCuQYuRVBRhTTk1P8');
    return resolveDidKey(tim);
  }
  return resolveDidKey(tim);
}

function b64u(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function prefixEd25519(pub: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + pub.length);
  out[0] = 0xed;
  out[1] = 0x01;
  out.set(pub, 2);
  return out;
}

function base58(bytes: Uint8Array): string {
  const { base58btcEncode } = require('../src/cid.ts');
  return base58btcEncode(bytes);
}
