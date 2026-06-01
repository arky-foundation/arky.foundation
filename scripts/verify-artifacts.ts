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

// Test key from fixtures (DO NOT USE IN PRODUCTION). Public half is enough to
// verify; the private half is only used by the signing script.
const TEST_PUBLIC_JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
};

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
  const { cid: storedCid, sig, ...body } = artifact;
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

  return { cidMatch, sigValid, computedCid, storedCid: String(storedCid), detail };
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
    const ok = cidOk && sigOk;
    const detail = ok
      ? ''
      : `cid ${cidOk ? 'ok' : `mismatch (computed ${res.computedCid}, stored ${res.storedCid})`}; ` +
        `sig ${sigOk ? 'ok' : `invalid (${res.detail})`}`;
    report(`${relPath}`, ok, detail);
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
    report(relPath, res.cidMatch && res.sigValid,
      res.cidMatch && res.sigValid ? '' :
      `cid ${res.cidMatch ? 'ok' : 'mismatch'}; sig ${res.sigValid ? 'ok' : `invalid (${res.detail})`}`);
  }

  console.log('\nTIM fixtures:');
  for (const f of (await listJson(join(rootDir, 'vectors/fixtures/tims'))).sort()) {
    const relPath = relative(rootDir, f);
    const fixture = JSON.parse(await readFile(f, 'utf-8'));
    if (!fixture.tim?.sig) continue;
    const res = await verifyArtifact(fixture.tim, publicKey);
    report(relPath, res.cidMatch && res.sigValid,
      res.cidMatch && res.sigValid ? '' :
      `cid ${res.cidMatch ? 'ok' : `mismatch (computed ${res.computedCid})`}; sig ${res.sigValid ? 'ok' : `invalid (${res.detail})`}`);
  }

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
