/**
 * Adversarial / security regression tests. Each case is an attack that MUST be
 * rejected (verification fails) or handled (no crash) — never forged or fatal.
 */

import { test, expect, describe } from 'bun:test';
import { generateKeyPair, createTim, verifyTim, signDetached, canonicalize, canonicalBody, cidFromCanonical, resolveDidKey, execute, evaluateKernel } from '../src/index.ts';

const issuer = generateKeyPair();
const attacker = generateKeyPair();
const base = {
  ts: '2025-10-15T12:00:00Z',
  identity: { id: issuer.did },
  measurement: { name: 'temp', value: 22.5, unit: 'degC', method: { type: 'sensor', source: 's' } },
};
const tim = createTim(base, issuer.privateKey);

describe('forgery is rejected', () => {
  test('mutated value with original cid/sig', () => {
    const r = verifyTim({ ...tim, measurement: { ...tim.measurement, value: 999 } });
    expect(r.valid).toBe(false);
  });

  test('mutated value + recomputed cid, stale sig', () => {
    const t = { ...tim, measurement: { ...tim.measurement, value: 999 } };
    const { cid, sig, ...body } = t;
    const forged = { ...body, cid: cidFromCanonical(canonicalize(canonicalBody(t))), sig: tim.sig };
    expect(verifyTim(forged).valid).toBe(false);
  });

  test('attacker re-signs with own key but claims victim DID', () => {
    const forged = createTim(base, attacker.privateKey); // identity.id = issuer.did
    expect(verifyTim(forged).valid).toBe(false); // did:key resolves to issuer, not attacker
  });

  test('swap identity.id to attacker, keep victim signature', () => {
    expect(verifyTim({ ...tim, identity: { id: attacker.did } }).valid).toBe(false);
  });

  test('alg:none downgrade is rejected', () => {
    const noneHdr = btoa(JSON.stringify({ alg: 'none', b64: false, crit: ['b64'] })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(verifyTim({ ...tim, sig: `${noneHdr}..${tim.sig.split('.')[2]}` }).valid).toBe(false);
  });

  test('empty signature is rejected', () => {
    expect(verifyTim({ ...tim, sig: tim.sig.split('.')[0] + '..' }).valid).toBe(false);
  });

  test('forged witness (resolver only knows issuer) is rejected', () => {
    const canon = new TextEncoder().encode(canonicalize(canonicalBody(tim)));
    const wsig = signDetached(canon, attacker.privateKey);
    const r = verifyTim({ ...tim, time: { ...tim.time, witnesses: [wsig] } }, () => issuer.publicKey);
    expect(r.valid).toBe(false);
    expect(r.witnesses_valid).toBe(false);
  });
});

describe('malformed input is handled (no DoS / no throw)', () => {
  const bad = [
    ['malformed base58 did:key', { ...tim, identity: { id: 'did:key:z6Mk0OIl' } }],
    ['truncated did:key', { ...tim, identity: { id: 'did:key:z6Mk' } }],
    ['wrong-length did:key', { ...tim, identity: { id: 'did:key:z6MkAAAA' } }],
    ['malformed witness JWS', { ...tim, time: { ...tim.time, witnesses: ['!!!not.a.jws'] } }],
    ['garbage signature', { ...tim, sig: '$$$garbage$$$' }],
    ['null measurement', { time: { ts: 'x' }, identity: { id: 'did:web:x' }, measurement: null, cid: 'z', sig: 'a..b' }],
  ] as const;

  for (const [name, t] of bad) {
    test(name, () => {
      expect(() => verifyTim(t as any)).not.toThrow();
      expect(verifyTim(t as any).valid).toBe(false);
    });
  }

  test('resolveDidKey never throws on hostile input', () => {
    for (const id of ['did:key:z6Mk0OIl', 'did:key:z', 'did:key:z6Mk', 'did:key:zNOPE']) {
      expect(() => resolveDidKey({ identity: { id } })).not.toThrow();
      expect(resolveDidKey({ identity: { id } })).toBeUndefined();
    }
  });
});

describe('freshness (opt-in via options.at)', () => {
  const expired = createTim({ ...base, exp: '2020-01-02T00:00:00Z' }, issuer.privateKey);
  const future = createTim({ ...base, exp: '2099-01-01T00:00:00Z' }, issuer.privateKey);

  test('expired TIM stays valid when no reference time given (pure crypto check)', () => {
    expect(verifyTim(expired).valid).toBe(true);
    expect(verifyTim(expired).fresh).toBe(true);
  });

  test('expired TIM fails with options.at', () => {
    const r = verifyTim(expired, undefined, { at: '2026-01-01T00:00:00Z' });
    expect(r.valid).toBe(false);
    expect(r.fresh).toBe(false);
    expect(r.errors).toContain('tim.expired');
  });

  test('unexpired TIM passes with options.at', () => {
    expect(verifyTim(future, undefined, { at: '2026-01-01T00:00:00Z' }).valid).toBe(true);
  });

  test('TIM without exp is always fresh', () => {
    expect(verifyTim(tim, undefined, { at: '2099-01-01T00:00:00Z' }).fresh).toBe(true);
  });
});

describe('settler rejects invalid amounts (authorization safety)', () => {
  const key = new Uint8Array(32).fill(1);
  const pay = (amount: unknown) =>
    execute({ verb: 'arky:verb/pay@v1', params: { to: 'x', amount }, rail: 'ach:us' }, { privateKey: key, ts: '2025-01-01T00:00:00Z' });

  test('negative amount is rejected', () => expect(pay({ value: -1000, unit: 'USD' }).status).toBe('FAILED'));
  test('zero amount is rejected', () => expect(pay({ value: 0, unit: 'USD' }).status).toBe('FAILED'));
  test('amount missing unit is rejected', () => expect(pay({ value: 100 }).status).toBe('FAILED'));
  test('NaN amount is rejected', () => expect(pay({ value: NaN, unit: 'USD' }).status).toBe('FAILED'));
  test('non-object amount is rejected', () => expect(pay('100').status).toBe('FAILED'));
  test('valid amount succeeds', () => expect(pay({ value: 100, unit: 'USD' }).status).toBe('SUCCESS'));
});

describe('kernel does not authorize on missing/indeterminate evidence', () => {
  const commitment = {
    scope: 's', actor: 'a', intent: { do: 'arky:verb/pay@v1' },
    measure: [{ name: 'temp', assert: 'temp > 20' }],
    consequence: [{ if: 'PASS', then: [{ name: 'arky:verb/pay@v1', args: { to: 'x', amount: { value: 1, unit: 'USD' } } }] }],
  };
  test('no evidence -> INDETERMINATE, not APPROVED', () => {
    expect(evaluateKernel(commitment, [], {}).status).toBe('INDETERMINATE');
  });
  test('unregistered verb -> REJECTED', () => {
    const bad = { ...commitment, consequence: [{ if: 'PASS', then: [{ name: 'arky:verb/evil@v1', args: {} }] }] };
    const d = evaluateKernel(bad, [], {});
    expect(d.status).toBe('REJECTED');
    expect(d.errors).toContain('kernel.unknown_verb');
  });
});
