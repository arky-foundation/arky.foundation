#!/usr/bin/env bun
/**
 * Arky Conformance Verifier
 *
 * Turns "vectors over vibes" into an automated check. For every signed
 * artifact and test vector this script:
 *   1. Recomputes the content id (cid) via JCS (RFC 8785) + multihash(sha2-256)
 *      and base58btc multibase encoding.
 *   2. Verifies the detached JWS (RFC 7797, b64:false) over the canonical body.
 *   3. Compares the observed result against each vector's `expect` block.
 *
 * Exits non-zero if any artifact fails, so CI fails on a broken vector.
 *
 * Usage: bun run scripts/verify-artifacts.ts
 */

import * as jose from 'jose';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58btc } from 'multiformats/bases/base58';
import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

const rootDir = join(import.meta.dir, '..');

// Test keys from fixtures (DO NOT USE IN PRODUCTION). Public halves are enough
// to verify; the private halves are only used by the signing script. The issuer
// signs with key-01; witnesses are co-signed with key-02 (see
// vectors/fixtures/keys/*). Keys are indexed by their JWS `kid` so witness
// signatures can be resolved independently of the issuer key.
const TEST_PUBLIC_JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
};

const TEST_PUBLIC_KEYS_BY_KID: Record<string, jose.JWK> = {
  'test-key-2025-01': { kty: 'OKP', crv: 'Ed25519', x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo' },
  'test-key-2025-02': { kty: 'OKP', crv: 'Ed25519', x: 'e_vAtyLIHAXMh1TRvhFUNrvifhH5ZzXKGwGKk9zgB9I' },
};

/** Resolve a witness public key from the JWS protected header `kid`. */
async function resolveWitnessKey(sig: string): Promise<jose.KeyLike | undefined> {
  try {
    const { kid } = jose.decodeProtectedHeader(sig);
    if (typeof kid !== 'string') return undefined;
    const jwk = TEST_PUBLIC_KEYS_BY_KID[kid];
    if (!jwk) return undefined;
    return (await jose.importJWK(jwk, 'EdDSA')) as jose.KeyLike;
  } catch {
    return undefined;
  }
}

/**
 * Verify all detached-payload witness JWS in `time.witnesses[]` over the SAME
 * canonical bytes as the issuer signature (TIM §6, Notary §3). Returns the
 * number verified and a list of failures. An empty/absent witness list is OK.
 */
async function verifyWitnesses(
  artifact: Record<string, unknown>,
  canonical: string,
): Promise<{ count: number; failures: string[] }> {
  const time = artifact.time as Record<string, unknown> | undefined;
  const witnesses = time?.witnesses;
  const failures: string[] = [];
  if (!Array.isArray(witnesses)) return { count: 0, failures };

  const payload = new TextEncoder().encode(canonical);
  for (let i = 0; i < witnesses.length; i++) {
    const w = witnesses[i];
    if (typeof w !== 'string' || w.split('.').length !== 3) {
      failures.push(`witness[${i}]: not a compact JWS`);
      continue;
    }
    const [header, mid, signature] = w.split('.');
    if (mid.length !== 0) {
      failures.push(`witness[${i}]: payload segment must be empty (detached, RFC 7797)`);
      continue;
    }
    const key = await resolveWitnessKey(w);
    if (!key) {
      failures.push(`witness[${i}]: unresolvable kid`);
      continue;
    }
    try {
      await jose.flattenedVerify({ protected: header, signature, payload }, key, { crit: { b64: true } });
    } catch (err) {
      failures.push(`witness[${i}]: ${(err as Error).message}`);
    }
  }
  return { count: witnesses.length, failures };
}

/** JCS (RFC 8785): lexicographically sorted keys, no whitespace. */
function jcsCanonical(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(jcsCanonical).join(',') + ']';
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    if (val === undefined) return null;
    return JSON.stringify(key) + ':' + jcsCanonical(val);
  }).filter(Boolean);
  return '{' + pairs.join(',') + '}';
}

/**
 * Remove `time.witnesses` from a TIM body (Canonicalization §2). Witnesses are
 * appended after signing, so they are not part of the canonical body. If `time`
 * becomes empty, drop it entirely (no empty `time:{}` placeholder).
 */
function stripWitnesses(rest: Record<string, unknown>): Record<string, unknown> {
  const time = rest.time as Record<string, unknown> | undefined;
  if (!time || !('witnesses' in time)) return rest;
  const { witnesses: _w, ...timeRest } = time;
  if (Object.keys(timeRest).length === 0) {
    const { time: _t, ...noTime } = rest;
    return noTime;
  }
  return { ...rest, time: timeRest };
}

/** cid = base58btc(multihash(sha2-256, canonical_bytes)). */
function computeCid(canonicalJson: string): string {
  const bytes = new TextEncoder().encode(canonicalJson);
  const hash = sha256(bytes);
  const multihash = new Uint8Array([0x12, 0x20, ...hash]);
  return base58btc.encode(multihash);
}

interface CheckResult {
  cidMatch: boolean;
  sigValid: boolean;
  witnessesValid: boolean;
  witnessCount: number;
  computedCid: string;
  storedCid: string;
  detail: string;
}

/**
 * Verify one signed artifact (TIM, kernel commitment, receipt, etc.).
 * The canonical body is the object minus `cid` and `sig`.
 */
async function verifyArtifact(
  artifact: Record<string, unknown>,
  publicKey: jose.KeyLike,
): Promise<CheckResult> {
  const { cid: storedCid, sig, ...rest } = artifact;
  // Canonical body excludes cid, sig, and time.witnesses (Canonicalization §2):
  // witnesses co-sign these same bytes and are appended afterwards.
  const body = stripWitnesses(rest);
  const canonical = jcsCanonical(body);
  const computedCid = computeCid(canonical);
  const cidMatch = storedCid === computedCid;

  let sigValid = false;
  let detail = '';
  if (typeof sig === 'string' && sig.split('.').length === 3) {
    const [header, , signature] = sig.split('.');
    const payload = new TextEncoder().encode(canonical);
    try {
      await jose.flattenedVerify(
        { protected: header, signature, payload },
        publicKey,
        { crit: { b64: true } },
      );
      sigValid = true;
    } catch (err) {
      detail = `sig verify failed: ${(err as Error).message}`;
    }
  } else {
    detail = 'sig missing or not detached-compact form';
  }

  // Witnesses (if any) co-sign the SAME canonical bytes (TIM §6 / Notary §3).
  // Read the witness list from the original artifact (body has it stripped).
  const { count: witnessCount, failures } = await verifyWitnesses(artifact, canonical);
  const witnessesValid = failures.length === 0;
  if (!witnessesValid) {
    detail = detail ? `${detail}; ${failures.join('; ')}` : failures.join('; ');
  }

  return { cidMatch, sigValid, witnessesValid, witnessCount, computedCid, storedCid: String(storedCid), detail };
}

let passCount = 0;
let failCount = 0;

function report(label: string, ok: boolean, detail = '') {
  if (ok) {
    passCount++;
    console.log(`  [PASS] ${label}`);
  } else {
    failCount++;
    console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Verify a single vector file. Vectors carry an `expect` block; we honor the
 * fields relevant to T1/K1 conformance (cid_valid, signature_valid,
 * schema_valid is left to the AJV step in CI).
 */
async function verifyVector(path: string, publicKey: jose.KeyLike) {
  const relPath = relative(rootDir, path);
  const vector = JSON.parse(await readFile(path, 'utf-8'));
  const expect = vector.expect ?? {};

  // Locate the embedded signed artifact: TIM vectors use inputs.tim,
  // kernel vectors use inputs.commitment.
  const artifact = vector.inputs?.tim ?? vector.inputs?.commitment;

  // Vectors that intentionally describe invalid/unsigned inputs (expect.valid
  // === false) are validated structurally by the schema step, not here.
  if (expect.valid === false) {
    report(`${relPath} (negative vector, schema-checked elsewhere)`, true);
    return;
  }

  if (!artifact || typeof artifact !== 'object' || !('sig' in artifact)) {
    report(`${relPath}`, false, 'no signed artifact found in inputs');
    return;
  }

  const res = await verifyArtifact(artifact as Record<string, unknown>, publicKey);

  // expect.cid_valid (TIM) — recompute and compare.
  if (expect.cid_valid === true || expect.signature_valid === true || expect.valid === true) {
    const cidOk = res.cidMatch;
    const sigOk = res.sigValid;
    const witOk = res.witnessesValid;
    const ok = cidOk && sigOk && witOk;
    const witLabel = res.witnessCount > 0 ? ` (+${res.witnessCount} witness)` : '';
    const detail = ok
      ? ''
      : `cid ${cidOk ? 'ok' : `mismatch (computed ${res.computedCid}, stored ${res.storedCid})`}; ` +
        `sig ${sigOk ? 'ok' : 'invalid'}; ` +
        `witnesses ${witOk ? 'ok' : 'invalid'} — ${res.detail}`;
    report(`${relPath}${witLabel}`, ok, detail);
  } else {
    report(`${relPath} (no crypto expectations)`, true);
  }
}

async function listJson(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...await listJson(full));
    else if (e.name.endsWith('.json')) out.push(full);
  }
  return out;
}

async function main() {
  console.log('Arky Conformance Verifier');
  console.log('=========================\n');

  const publicKey = await jose.importJWK(TEST_PUBLIC_JWK, 'EdDSA');

  console.log('TIM vectors:');
  for (const f of (await listJson(join(rootDir, 'vectors/tim'))).sort()) {
    await verifyVector(f, publicKey);
  }

  console.log('\nKernel vectors:');
  for (const f of (await listJson(join(rootDir, 'vectors/kernel'))).sort()) {
    await verifyVector(f, publicKey);
  }

  console.log('\nCore examples:');
  for (const name of ['tim.json', 'kernel.json']) {
    const path = join(rootDir, 'examples/core', name);
    const relPath = relative(rootDir, path);
    const artifact = JSON.parse(await readFile(path, 'utf-8'));
    const res = await verifyArtifact(artifact, publicKey);
    const ok = res.cidMatch && res.sigValid && res.witnessesValid;
    report(relPath, ok, ok ? '' :
      `cid ${res.cidMatch ? 'ok' : 'mismatch'}; sig ${res.sigValid ? 'ok' : 'invalid'}; witnesses ${res.witnessesValid ? 'ok' : 'invalid'} — ${res.detail}`);
  }

  console.log('\nTIM fixtures:');
  for (const f of (await listJson(join(rootDir, 'vectors/fixtures/tims'))).sort()) {
    const relPath = relative(rootDir, f);
    const fixture = JSON.parse(await readFile(f, 'utf-8'));
    if (!fixture.tim?.sig) continue;
    const res = await verifyArtifact(fixture.tim, publicKey);
    const ok = res.cidMatch && res.sigValid && res.witnessesValid;
    const witLabel = res.witnessCount > 0 ? ` (+${res.witnessCount} witness)` : '';
    report(`${relPath}${witLabel}`, ok, ok ? '' :
      `cid ${res.cidMatch ? 'ok' : `mismatch (computed ${res.computedCid})`}; sig ${res.sigValid ? 'ok' : 'invalid'}; witnesses ${res.witnessesValid ? 'ok' : 'invalid'} — ${res.detail}`);
  }

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
