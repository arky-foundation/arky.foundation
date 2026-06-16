#!/usr/bin/env bun
/**
 * Arky Conformance Verifier
 *
 * Turns "vectors over vibes" into an automated check. For every signed
 * artifact and test vector this script:
 *   1. Recomputes the content id (cid) via JCS (RFC 8785) + multihash(sha2-256)
 *      and base58btc multibase encoding (artifacts without a cid are sig-only).
 *   2. Verifies the detached JWS (RFC 7797, b64:false) over the canonical body
 *      (which excludes cid, sig, and time.witnesses).
 *   3. Verifies each detached-payload witness JWS in time.witnesses[] against
 *      its kid-resolved key, over the same canonical bytes.
 *   4. Compares the observed result against each vector's `expect` block.
 *
 * It also executes algorithmic vectors by recomputing the result from inputs:
 *   - Canonicalization JCS bytes (C1, RFC 8785) vs expect.canonical_json/_hex
 *   - Notary Merkle roots and inclusion proofs (N2, §5.1/§5.2)
 *   - Settler idempotency-key derivation (S2, §6.1), failure cascade (S2, §4.1),
 *     compensation mapping (S3, §7.2), and XR state transitions (S3, §5.2)
 *   - Notary finality depth max(), policy-floor violations, and reorg
 *     remediation (reorged vs finality_violated) (N3, §4.4)
 * via the shared reference module in scripts/lib/merkle.ts.
 *
 * Coverage: TIM + Kernel + Canonicalization vectors and fixtures; discovery
 * vectors/fixtures; Notary + Settler vectors; the end-to-end reference path
 * (chain-linkage walk); and standalone signed artifacts — registries, policy
 * packs, service descriptors, revocation lists, execution receipts, and
 * discovery indexes. Pure schema/structural vectors (no cid/signature/algorithm
 * expectation) are validated by the AJV step in CI, not here.
 *
 * Exits non-zero if any artifact fails, so CI fails on a broken vector.
 *
 * Usage: bun run scripts/verify-artifacts.ts
 */

import * as jose from 'jose';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58btc } from 'multiformats/bases/base58';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, relative } from 'path';
import { execSync } from 'node:child_process';
import { merkleRoot, verifyInclusion, deriveIdempotencyKey, jcsCanonical as jcsLib, multihash, finalityDepth, canTransition, reorgOutcome } from './lib/merkle.ts';

const rootDir = join(import.meta.dir, '..');

/** Settler §7.2 compensation map: irreversible verb -> compensating verb. */
const COMPENSATION_MAP: Record<string, string> = {
  pay: 'refund',
  slash: 'pay',
  upgrade: 'revoke',
  revoke: 'upgrade',
  signal: 'signal',
  control: 'control',
};

/** Settler §4.1 STOP_ON_FAILURE cascade: simulate XR statuses from outcomes. */
function failureCascade(verbs: { outcome: string }[]): string[] {
  const out: string[] = [];
  let stopped = false;
  for (const v of verbs) {
    if (stopped) { out.push('skipped'); continue; }
    out.push(v.outcome);
    if (v.outcome === 'failed') stopped = true;
  }
  return out;
}

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
  'notary-key-2025-01': { kty: 'OKP', crv: 'Ed25519', x: 'HDl_cQgT9vSiYMsH8q1dOdyb5prCuQYuRVBRhTTk1P8' },
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
  hasCid: boolean;
  cidMatch: boolean;
  sigValid: boolean;
  witnessesValid: boolean;
  witnessCount: number;
  computedCid: string;
  storedCid: string;
  detail: string;
}

/**
 * Verify one signed artifact (TIM, kernel commitment, receipt, registry,
 * policy pack, service descriptor, revocation list, discovery index, ...).
 * The canonical body is the object minus `cid`, `sig`, and `time.witnesses`.
 *
 * Some artifacts (registries, policy packs, revocation lists) are signed but
 * NOT content-addressed — they carry `sig` without `cid`. For those, the cid
 * check is reported as n/a (hasCid=false) rather than a failure.
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
  const hasCid = storedCid !== undefined;
  const cidMatch = hasCid ? storedCid === computedCid : true;

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

  return { hasCid, cidMatch, sigValid, witnessesValid, witnessCount, computedCid, storedCid: String(storedCid), detail };
}

let passCount = 0;
let failCount = 0;

// Per-case records for the optional results artifact (--results <path>).
const cases: Array<{ id: string; status: 'pass' | 'fail'; reason?: string }> = [];

function report(label: string, ok: boolean, detail = '') {
  cases.push({ id: label, status: ok ? 'pass' : 'fail', ...(ok ? {} : { reason: detail }) });
  if (ok) {
    passCount++;
    console.log(`  [PASS] ${label}`);
  } else {
    failCount++;
    console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Report a CheckResult against a labelled artifact, with consistent detail. */
function reportArtifact(label: string, res: CheckResult) {
  const cidOk = !res.hasCid || res.cidMatch;
  const ok = cidOk && res.sigValid && res.witnessesValid;
  const witLabel = res.witnessCount > 0 ? ` (+${res.witnessCount} witness)` : '';
  const cidPart = res.hasCid ? (res.cidMatch ? 'ok' : `mismatch (computed ${res.computedCid})`) : 'n/a';
  const detail = ok ? '' :
    `cid ${cidPart}; sig ${res.sigValid ? 'ok' : 'invalid'}; ` +
    `witnesses ${res.witnessesValid ? 'ok' : 'invalid'}${res.detail ? ` — ${res.detail}` : ''}`;
  report(`${label}${witLabel}`, ok, detail);
}

/**
 * Verify every standalone signed artifact in a directory (registries, policies,
 * service descriptors, revocation lists, execution receipts, ...). Files
 * without a `sig` are skipped. Returns nothing; reports per file.
 */
async function verifyArtifactDir(dir: string, publicKey: jose.KeyLike, label: string) {
  const files = (await listJson(dir)).sort();
  const signed: string[] = [];
  for (const f of files) {
    const artifact = JSON.parse(await readFile(f, 'utf-8'));
    if (typeof artifact?.sig !== 'string') continue; // unsigned (e.g. schema, index template)
    signed.push(f);
    const res = await verifyArtifact(artifact, publicKey);
    reportArtifact(relative(rootDir, f), res);
  }
  if (signed.length === 0) console.log(`  (no signed ${label})`);
}

/** Compare arrays elementwise for equality. */
function arrayEq(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Execute an algorithmic vector (Notary Merkle/inclusion, Settler idempotency/
 * cascade/compensation) by recomputing the result from inputs and comparing to
 * `expect`. Returns null if this vector is not an algorithmic one we handle.
 */
function verifyAlgorithmicVector(vector: any): { ok: boolean; detail: string } | null {
  const { inputs = {}, expect = {} } = vector;

  // Notary Merkle root (N2): expect.merkle_root over inputs.cids.
  if (Array.isArray(inputs.cids) && typeof expect.merkle_root === 'string') {
    const root = merkleRoot(inputs.cids);
    const ok = root === expect.merkle_root;
    let detail = ok ? '' : `merkle_root mismatch: computed ${root}, expected ${expect.merkle_root}`;
    // Optionally check the documented sorted order.
    if (ok && Array.isArray(expect.sorted_order)) {
      const sorted = [...inputs.cids].sort((a: string, b: string) =>
        Buffer.compare(Buffer.from(base58btc.decode(a)), Buffer.from(base58btc.decode(b))));
      if (!arrayEq(sorted, expect.sorted_order)) detail = 'sorted_order mismatch';
      return { ok: detail === '', detail };
    }
    return { ok, detail };
  }

  // Notary inclusion proof (N2): expect.inclusion_valid for leaf/path/root.
  if (typeof inputs.leaf === 'string' && Array.isArray(inputs.path) && typeof expect.inclusion_valid === 'boolean') {
    const valid = verifyInclusion(inputs.leaf, inputs.path, inputs.root);
    const ok = valid === expect.inclusion_valid;
    return { ok, detail: ok ? '' : `inclusion_valid: computed ${valid}, expected ${expect.inclusion_valid}` };
  }

  // Settler idempotency key (S2): expect.idempotency_key (+ optional args_hash).
  if (inputs.args !== undefined && typeof inputs.verb_index === 'number' && typeof expect.idempotency_key === 'string') {
    const key = deriveIdempotencyKey({
      commitment_cid: inputs.commitment_cid,
      verb: inputs.verb,
      rail: inputs.rail,
      args: inputs.args,
      verb_index: inputs.verb_index,
    });
    let detail = key === expect.idempotency_key ? '' : `idempotency_key mismatch: computed ${key}`;
    if (detail === '' && typeof expect.args_hash === 'string') {
      const argsHash = multihash(new TextEncoder().encode(jcsLib(inputs.args)));
      if (argsHash !== expect.args_hash) detail = `args_hash mismatch: computed ${argsHash}`;
    }
    return { ok: detail === '', detail };
  }

  // Settler failure cascade (S2): expect.xr_statuses from inputs.verbs[].outcome.
  if (Array.isArray(inputs.verbs) && Array.isArray(expect.xr_statuses)) {
    const statuses = failureCascade(inputs.verbs);
    const ok = arrayEq(statuses, expect.xr_statuses);
    return { ok, detail: ok ? '' : `xr_statuses: computed [${statuses}], expected [${expect.xr_statuses}]` };
  }

  // Settler compensation map (S3): expect.all_mappings_correct over inputs.compensations.
  if (Array.isArray(inputs.compensations) && typeof expect.all_mappings_correct === 'boolean') {
    const wrong = inputs.compensations.filter(
      (c: any) => COMPENSATION_MAP[c.verb] !== c.expect_compensation);
    const ok = (wrong.length === 0) === expect.all_mappings_correct;
    return { ok, detail: ok ? '' : `compensation mismatch for: ${wrong.map((w: any) => w.verb).join(', ')}` };
  }

  // Notary finality depth, multiple cases (N3): expect.all_depths_correct.
  if (Array.isArray(inputs.cases) && typeof expect.all_depths_correct === 'boolean') {
    const wrong = inputs.cases.filter((c: any) => {
      const { depth, violation } = finalityDepth(c);
      return violation || depth !== c.expect_depth;
    });
    const ok = (wrong.length === 0) === expect.all_depths_correct;
    return { ok, detail: ok ? '' : `depth mismatch in ${wrong.length} case(s)` };
  }

  // Notary reorg remediation (N3): expect.all_reorg_outcomes_correct.
  if (Array.isArray(inputs.cases) && typeof expect.all_reorg_outcomes_correct === 'boolean') {
    const wrong = inputs.cases.filter((c: any) => {
      const o = reorgOutcome(c.reorg_depth, c.finality_depth);
      return o.status !== c.expect_status || o.reanchor !== c.expect_reanchor || o.alert !== c.expect_alert;
    });
    const ok = (wrong.length === 0) === expect.all_reorg_outcomes_correct;
    const names = wrong.map((w: any) => `d${w.reorg_depth}/f${w.finality_depth}`).join(', ');
    return { ok, detail: ok ? '' : `reorg outcome mismatch: ${names}` };
  }

  // Notary finality policy violation (N3): override below the pack floor.
  if (inputs.request_override !== undefined && typeof expect.policy_violation === 'boolean'
      && inputs.cases === undefined) {
    const { violation } = finalityDepth(inputs);
    const ok = violation === expect.policy_violation;
    return { ok, detail: ok ? '' : `policy_violation: computed ${violation}, expected ${expect.policy_violation}` };
  }

  // Settler XR state transitions (S3): expect.all_transitions_correct.
  if (Array.isArray(inputs.transitions) && typeof expect.all_transitions_correct === 'boolean') {
    const wrong = inputs.transitions.filter(
      (t: any) => canTransition(t.from, t.to, t.context ?? {}) !== t.expect_allowed);
    const ok = (wrong.length === 0) === expect.all_transitions_correct;
    const names = wrong.map((w: any) => `${w.from}->${w.to}`).join(', ');
    return { ok, detail: ok ? '' : `transition mismatch: ${names}` };
  }

  return null;
}

/**
 * Execute a canonicalization (C1) vector: recompute JCS canonical bytes from
 * the input and compare to expect.canonical_json (and canonical_bytes_hex when
 * present). Input is either inputs.original (an object) or inputs.original_
 * formatted (a JSON string to parse first).
 */
function verifyCanonVector(vector: any): { ok: boolean; detail: string } | null {
  const { inputs = {}, expect = {} } = vector;
  if (typeof expect.canonical_json !== 'string') return null;

  let input: unknown;
  if (inputs.original !== undefined) input = inputs.original;
  else if (typeof inputs.original_formatted === 'string') {
    try { input = JSON.parse(inputs.original_formatted); }
    catch (e) { return { ok: false, detail: `bad original_formatted: ${(e as Error).message}` }; }
  } else return { ok: false, detail: 'no canonicalization input (original / original_formatted)' };

  const canonical = jcsLib(input);
  if (canonical !== expect.canonical_json) {
    return { ok: false, detail: `canonical_json mismatch:\n   got: ${canonical}\n   exp: ${expect.canonical_json}` };
  }
  if (typeof expect.canonical_bytes_hex === 'string') {
    const hex = Buffer.from(new TextEncoder().encode(canonical)).toString('hex');
    if (hex !== expect.canonical_bytes_hex) {
      return { ok: false, detail: `canonical_bytes_hex mismatch: computed ${hex}` };
    }
  }
  return { ok: true, detail: '' };
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

  // Vectors that intentionally describe invalid/unsigned inputs (expect.valid
  // === false) are validated structurally by the schema step, not here.
  if (expect.valid === false) {
    report(`${relPath} (negative vector, schema-checked elsewhere)`, true);
    return;
  }

  // Canonicalization (C1) vectors: recompute JCS bytes and compare.
  const canon = verifyCanonVector(vector);
  if (canon) {
    report(relPath, canon.ok, canon.detail);
    return;
  }

  // Algorithmic vectors (Notary Merkle/inclusion, Settler idempotency/cascade/
  // compensation) are executed by recomputing from inputs and comparing.
  const algo = verifyAlgorithmicVector(vector);
  if (algo) {
    report(relPath, algo.ok, algo.detail);
    return;
  }

  // Only vectors that assert a crypto property are verified here. Pure
  // schema/structural vectors (e.g. JWKS shape, service-list counts) carry no
  // cid/signature expectation and are validated by the AJV step in CI.
  const hasCryptoExpectation =
    expect.cid_valid === true || expect.signature_valid === true || expect.has_signature === true;
  if (!hasCryptoExpectation) {
    report(`${relPath} (schema-only, checked elsewhere)`, true);
    return;
  }

  // Locate the embedded signed artifact: TIM vectors use inputs.tim, kernel
  // vectors use inputs.commitment, discovery vectors use inputs.well_known_index.
  const artifact = vector.inputs?.tim ?? vector.inputs?.commitment ?? vector.inputs?.well_known_index;
  if (!artifact || typeof artifact !== 'object' || !('sig' in artifact)) {
    report(`${relPath}`, false, 'crypto expectation set but no signed artifact in inputs');
    return;
  }

  reportArtifact(relPath, await verifyArtifact(artifact as Record<string, unknown>, publicKey));
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

/** Read a dotted/indexed path like "assertions[0].inputs[0]" from an object. */
function readPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc: any, seg: string) => {
    if (acc == null) return undefined;
    const m = seg.match(/^([^[]+)((\[\d+\])*)$/);
    if (!m) return undefined;
    let cur = acc[m[1]];
    for (const idx of m[2].match(/\d+/g) ?? []) cur = cur?.[Number(idx)];
    return cur;
  }, obj);
}

/**
 * Verify the end-to-end reference path: each artifact's cid + sig (and TIM
 * witness) verify against their kid-resolved keys, AND every cross-link in
 * chain.json resolves to the referenced artifact's real cid. This proves the
 * loop holds together as one chain, not five disconnected artifacts.
 */
async function verifyReferencePath() {
  const dir = join(rootDir, 'vectors/integration/reference-path');
  const chainPath = join(dir, 'chain.json');
  let chain: any;
  try { chain = JSON.parse(await readFile(chainPath, 'utf-8')); }
  catch { console.log('  (no reference path generated)'); return; }

  // 1. Each artifact verifies against its own signing key (resolved by kid).
  const loaded: Record<string, any> = {};
  for (const [role, file] of Object.entries(chain.artifacts as Record<string, string>)) {
    const artifact = JSON.parse(await readFile(join(dir, file), 'utf-8'));
    loaded[role] = artifact;
    const key = await resolveWitnessKey(artifact.sig as string); // resolves any kid in our test map
    if (!key) { report(`reference-path/${file}`, false, 'unresolvable signing kid'); continue; }
    const res = await verifyArtifact(artifact, key);
    reportArtifact(`reference-path/${file}`, res);
  }

  // 2. Every declared cross-link matches the referenced artifact's real cid.
  let linkFailures = 0;
  for (const link of chain.links as Array<{ from: string; to: string; value: string }>) {
    const fromRole = link.from.split('.')[0];
    const actual = readPath(loaded[fromRole], link.from.slice(fromRole.length + 1));
    const toRole = link.to.split('.')[0];
    const target = loaded[toRole]?.cid;
    const ok = actual === link.value && target === link.value;
    if (!ok) {
      linkFailures++;
      report(`reference-path link ${link.from} -> ${link.to}`, false,
        `got ${actual}; target cid ${target}; expected ${link.value}`);
    }
  }
  report(`reference-path chain linkage (${(chain.links as unknown[]).length} links)`, linkFailures === 0);
}

async function main() {
  console.log('Arky Conformance Verifier');
  console.log('=========================\n');

  const publicKey = await jose.importJWK(TEST_PUBLIC_JWK, 'EdDSA');

  console.log('TIM vectors:');
  for (const f of (await listJson(join(rootDir, 'vectors/tim'))).sort()) {
    await verifyVector(f, publicKey);
  }

  console.log('\nCanonicalization vectors:');
  for (const f of (await listJson(join(rootDir, 'vectors/canonicalization'))).sort()) {
    await verifyVector(f, publicKey);
  }

  console.log('\nKernel vectors:');
  for (const f of (await listJson(join(rootDir, 'vectors/kernel'))).sort()) {
    await verifyVector(f, publicKey);
  }

  console.log('\nDiscovery vectors:');
  for (const f of (await listJson(join(rootDir, 'vectors/discovery'))).sort()) {
    // fixtures/ holds standalone signed artifacts (not vectors); verified below.
    if (f.includes(`${join('discovery', 'fixtures')}`)) continue;
    await verifyVector(f, publicKey);
  }

  console.log('\nDiscovery fixtures:');
  await verifyArtifactDir(join(rootDir, 'vectors/discovery/fixtures'), publicKey, 'discovery fixtures');

  console.log('\nNotary vectors:');
  for (const f of (await listJson(join(rootDir, 'vectors/notary'))).sort()) {
    await verifyVector(f, publicKey);
  }

  console.log('\nSettler vectors:');
  for (const f of (await listJson(join(rootDir, 'vectors/settlers'))).sort()) {
    await verifyVector(f, publicKey);
  }

  console.log('\nEnd-to-end reference path:');
  await verifyReferencePath();

  console.log('\nCore examples:');
  for (const name of ['tim.json', 'kernel.json', 'execution-receipt.json']) {
    const path = join(rootDir, 'examples/core', name);
    const artifact = JSON.parse(await readFile(path, 'utf-8'));
    reportArtifact(relative(rootDir, path), await verifyArtifact(artifact, publicKey));
  }

  console.log('\nRegistries:');
  await verifyArtifactDir(join(rootDir, 'registries'), publicKey, 'registries');

  console.log('\nPolicy packs:');
  await verifyArtifactDir(join(rootDir, 'policies'), publicKey, 'policy packs');

  console.log('\nService descriptors:');
  await verifyArtifactDir(join(rootDir, 'examples/service-descriptors'), publicKey, 'service descriptors');

  console.log('\nRevocation lists:');
  await verifyArtifactDir(join(rootDir, 'examples/security/revocations'), publicKey, 'revocation lists');

  console.log('\nTIM fixtures:');
  for (const f of (await listJson(join(rootDir, 'vectors/fixtures/tims'))).sort()) {
    const fixture = JSON.parse(await readFile(f, 'utf-8'));
    if (!fixture.tim?.sig) continue;
    reportArtifact(relative(rootDir, f), await verifyArtifact(fixture.tim, publicKey));
  }

  console.log(`\n${passCount} passed, ${failCount} failed.`);

  // Optional results artifact (conforms to schemas/testing/results-schema.json).
  const resultsArg = process.argv.indexOf('--results');
  if (resultsArg !== -1) {
    const out = process.argv[resultsArg + 1] || join(rootDir, 'vectors/RESULTS.json');
    let commit = 'unknown';
    try { commit = execSync('git rev-parse HEAD', { cwd: rootDir }).toString().trim(); } catch { /* not a repo */ }
    const results = {
      impl: { name: 'arky-foundation-verifier', version: '0.1.0', language: 'typescript', commit },
      environment: {
        os: process.platform,
        arch: process.arch,
        runtime: `bun ${process.versions.bun ?? ''}`.trim(),
        timestamp: new Date().toISOString(),
      },
      suite: { spec_id: 'ARKY-VECTORS-v1', level: 'all', manifest_hash: multihash(new TextEncoder().encode(jcsLib(cases.map((c) => c.id)))) },
      cases: cases.map((c) => ({ id: c.id, status: c.status, ...(c.reason ? { reason: c.reason } : {}), duration_ms: 0 })),
      totals: { passed: passCount, failed: failCount, skipped: 0, total: passCount + failCount },
    };
    await writeFile(out, JSON.stringify(results, null, 2) + '\n');
    console.log(`Results written to ${relative(rootDir, out)}`);
  }

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
