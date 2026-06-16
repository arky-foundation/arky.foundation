#!/usr/bin/env bun
/**
 * Arky Artifact Signing Script
 *
 * Generates real Ed25519 signatures for test vectors, registries, and examples.
 * Uses JCS (RFC 8785) canonicalization and JWS compact serialization.
 *
 * Usage: bun run scripts/sign-artifacts.ts
 */

import * as jose from 'jose';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58btc } from 'multiformats/bases/base58';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, relative } from 'path';

// Test key from fixtures (DO NOT USE IN PRODUCTION) — issuer key (key-01).
const TEST_KEY = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
  d: 'nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A',
  kid: 'test-key-2025-01'
};

// Second test key (key-02) used to co-sign witness signatures. DO NOT USE IN
// PRODUCTION. See vectors/fixtures/keys/ed25519-test-02.json.
const TEST_WITNESS_KEY = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'e_vAtyLIHAXMh1TRvhFUNrvifhH5ZzXKGwGKk9zgB9I',
  d: '4CpanBIFLh0UVaNmLdKxW5eeYLG3hPXMWU6O4qlKjnA',
  kid: 'test-key-2025-02'
};

/**
 * JCS (RFC 8785) canonicalization
 * Sorts keys lexicographically and serializes without whitespace
 */
function jcsCanonical(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(jcsCanonical).join(',') + ']';
  }

  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(key => {
    const val = (obj as Record<string, unknown>)[key];
    if (val === undefined) return null;
    return JSON.stringify(key) + ':' + jcsCanonical(val);
  }).filter(Boolean);

  return '{' + pairs.join(',') + '}';
}

/**
 * Compute CID: base58btc(multihash(sha256, canonical_bytes))
 */
function computeCid(canonicalJson: string): string {
  const bytes = new TextEncoder().encode(canonicalJson);
  const hash = sha256(bytes);
  // Multihash: 0x12 = sha256, 0x20 = 32 bytes length
  const multihash = new Uint8Array([0x12, 0x20, ...hash]);
  return base58btc.encode(multihash);
}

/**
 * Sign canonical bytes with Ed25519 using JWS compact serialization with a
 * DETACHED payload (RFC 7797, b64:false). The payload segment is left empty so
 * the canonical body is not re-embedded inside the signature. Verifiers
 * reconstruct the signing input from the artifact's own canonical bytes.
 *
 * Output shape: "<protected_header>..<signature>" (empty middle segment).
 */
async function signJws(canonicalBytes: Uint8Array, privateKey: jose.KeyLike, kid: string = TEST_KEY.kid): Promise<string> {
  const jws = await new jose.CompactSign(canonicalBytes)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWS', kid, b64: false, crit: ['b64'] })
    .sign(privateKey);
  // CompactSign returns "header.payload.signature"; strip the payload segment
  // to produce the detached form "header..signature".
  const [header, , signature] = jws.split('.');
  return `${header}..${signature}`;
}

/**
 * Build the canonical body of a TIM: the object minus `cid`, `sig`, and
 * `time.witnesses` (see ARKY-TIM-Canonicalization-v1 §2). Witnesses are
 * co-signed over these same bytes and appended afterwards. If `time` is left
 * empty, it is omitted entirely.
 */
function timCanonicalBody(tim: Record<string, unknown>): Record<string, unknown> {
  const { cid: _c, sig: _s, ...rest } = tim;
  const time = rest.time as Record<string, unknown> | undefined;
  if (time && 'witnesses' in time) {
    const { witnesses: _w, ...timeRest } = time;
    if (Object.keys(timeRest).length === 0) {
      const { time: _t, ...noTime } = rest;
      return noTime;
    }
    return { ...rest, time: timeRest };
  }
  return rest;
}

/**
 * Check if a signature needs (re)generation. This covers obvious placeholders
 * AND legacy attached JWS (non-empty payload segment): v1 signs with a DETACHED
 * payload, so any signature whose middle segment is non-empty is stale and must
 * be re-signed.
 */
function isPlaceholderSig(sig: unknown): boolean {
  if (typeof sig !== 'string') return false;
  if (sig.includes('placeholder') ||
      sig.includes('MOCK') ||
      sig.includes('example') ||
      sig === 'eyJ.example.kernel.signature' ||
      sig.length < 50) {
    return true;
  }
  // Legacy attached JWS: "header.payload.signature" with a non-empty payload.
  const parts = sig.split('.');
  return parts.length === 3 && parts[1].length > 0;
}

/**
 * Check whether a TIM's witnesses need (re)signing: any entry that is a
 * placeholder or a legacy attached JWS (non-empty payload segment) is stale.
 */
function hasPlaceholderWitness(tim: Record<string, unknown>): boolean {
  const time = tim.time as Record<string, unknown> | undefined;
  const witnesses = time?.witnesses;
  if (!Array.isArray(witnesses)) return false;
  return witnesses.some((w) => isPlaceholderSig(w));
}

/**
 * Check if a CID looks like a placeholder
 */
function isPlaceholderCid(cid: unknown): boolean {
  if (typeof cid !== 'string') return false;
  return cid.includes('Example') ||
         cid.includes('example') ||
         cid.includes('123456') ||
         cid.length < 30;
}

/**
 * A TIM whose stored cid no longer matches its canonical body is STALE and must
 * be re-signed (e.g. after editing identity.id). Recompute and compare.
 */
function hasStaleTimCid(tim: Record<string, unknown>): boolean {
  if (typeof tim.cid !== 'string') return false;
  const recomputed = computeCid(jcsCanonical(timCanonicalBody(tim)));
  return recomputed !== tim.cid;
}

/**
 * Process a TIM object: compute cid and sign
 */
async function processTim(tim: Record<string, unknown>, privateKey: jose.KeyLike, witnessKey?: jose.KeyLike): Promise<Record<string, unknown>> {
  // Canonical body excludes cid, sig, and time.witnesses (Canonicalization §2).
  const body = timCanonicalBody(tim);
  const canonical = jcsCanonical(body);
  const newCid = computeCid(canonical);
  const canonicalBytes = new TextEncoder().encode(canonical);
  const newSig = await signJws(canonicalBytes, privateKey);

  // If the TIM carries witnesses, co-sign the SAME canonical bytes with the
  // witness key and rebuild time.witnesses[]. Placeholder witnesses are
  // replaced with real detached JWS so T3/N3 conformance is actually exercised.
  const time = tim.time as Record<string, unknown> | undefined;
  const result: Record<string, unknown> = { ...tim, cid: newCid, sig: newSig };
  if (time && Array.isArray(time.witnesses) && witnessKey) {
    const witnessSig = await signJws(canonicalBytes, witnessKey, TEST_WITNESS_KEY.kid);
    result.time = { ...time, witnesses: time.witnesses.map(() => witnessSig) };
  }
  return result;
}

/**
 * Process a signed artifact (registry, policy, kernel, etc.): compute cid and sign
 */
async function processSignedArtifact(artifact: Record<string, unknown>, privateKey: jose.KeyLike): Promise<Record<string, unknown>> {
  const { cid: _, sig: __, ...body } = artifact;

  const canonical = jcsCanonical(body);
  const newCid = computeCid(canonical);
  const canonicalBytes = new TextEncoder().encode(canonical);
  const newSig = await signJws(canonicalBytes, privateKey);

  // Some artifacts have cid, some don't - preserve structure
  if ('cid' in artifact || isPlaceholderCid(artifact.cid)) {
    return { ...body, cid: newCid, sig: newSig };
  }
  return { ...body, sig: newSig };
}

/**
 * Process files in a directory recursively
 */
async function processDirectory(dir: string, privateKey: jose.KeyLike, rootDir: string, witnessKey: jose.KeyLike): Promise<number> {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      count += await processDirectory(fullPath, privateKey, rootDir, witnessKey);
    } else if (entry.name.endsWith('.json')) {
      const relPath = relative(rootDir, fullPath);

      // Skip certain files
      if (relPath.includes('jwks.json') || relPath.includes('package.json')) {
        continue;
      }

      try {
        const content = await readFile(fullPath, 'utf-8');
        const json = JSON.parse(content);

        // Negative vectors carry intentionally-invalid artifacts (bad cid/sig/
        // timestamp). NEVER re-sign them — that would "fix" the thing they test.
        if (json.expect && json.expect.valid === false) continue;

        let updated: Record<string, unknown> | null = null;

        // Detect artifact type and process accordingly
        const hasSig = 'sig' in json;
        const hasCid = 'cid' in json;
        const isTim = json.time && json.identity && json.measurement;
        // Recognized top-level signable artifacts (besides TIM).
        const isSignableType = Boolean(
          json.registry_id || json.pack_id ||
          (json.scope && json.actor && json.intent) ||
          (json.request_id && json.verb && json.rail));
        // Sign when the sig is a placeholder OR absent on a signable artifact.
        const needsSign = (hasSig && isPlaceholderSig(json.sig)) || ((isTim || isSignableType) && !hasSig);
        const needsCid = hasCid && isPlaceholderCid(json.cid);

        const needsWitnessResign = isTim && (hasPlaceholderWitness(json) || hasStaleTimCid(json));

        if (needsSign || needsCid || needsWitnessResign) {
          if (isTim) {
            // TIM
            updated = await processTim(json, privateKey, witnessKey);
            console.log(`  [tim] ${relPath}`);
          } else if (json.registry_id || json.pack_id) {
            // Registry or policy pack
            updated = await processSignedArtifact(json, privateKey);
            console.log(`  [registry] ${relPath}`);
          } else if (json.scope && json.actor && json.intent) {
            // Kernel commitment
            updated = await processSignedArtifact(json, privateKey);
            console.log(`  [kernel] ${relPath}`);
          } else if (json.request_id && json.verb && json.rail) {
            // Execution receipt
            updated = await processSignedArtifact(json, privateKey);
            console.log(`  [xr] ${relPath}`);
          } else if (hasSig || hasCid) {
            // Generic signed artifact
            updated = await processSignedArtifact(json, privateKey);
            console.log(`  [artifact] ${relPath}`);
          }
        }

        // Handle test vectors with embedded TIMs
        if (json.inputs?.tim) {
          const tim = json.inputs.tim;
          if (isPlaceholderSig(tim.sig) || isPlaceholderCid(tim.cid) || hasPlaceholderWitness(tim) || hasStaleTimCid(tim)) {
            const signedTim = await processTim(tim, privateKey, witnessKey);
            json.inputs.tim = signedTim;
            updated = json;
            console.log(`  [vector:tim] ${relPath}`);
          }
        }

        // Handle test vectors with an embedded signed discovery index
        if (json.inputs?.well_known_index) {
          const idx = json.inputs.well_known_index;
          if (isPlaceholderSig(idx.sig) || isPlaceholderCid(idx.cid)) {
            json.inputs.well_known_index = await processSignedArtifact(idx, privateKey);
            updated = json;
            console.log(`  [vector:discovery] ${relPath}`);
          }
        }

        // Handle test vectors with embedded kernels / commitments
        const embeddedKernel = json.inputs?.kernel ?? json.inputs?.commitment;
        if (embeddedKernel && embeddedKernel.scope && embeddedKernel.actor && embeddedKernel.intent) {
          if (isPlaceholderSig(embeddedKernel.sig) || isPlaceholderCid(embeddedKernel.cid)) {
            const signedKernel = await processSignedArtifact(embeddedKernel, privateKey);
            if (json.inputs.kernel) json.inputs.kernel = signedKernel;
            else json.inputs.commitment = signedKernel;
            updated = json;
            console.log(`  [vector:kernel] ${relPath}`);
          }
        }

        // Handle fixture files with embedded TIMs
        if (json.tim && json.tim.time && json.tim.identity && json.tim.measurement) {
          const tim = json.tim;
          if (isPlaceholderSig(tim.sig) || isPlaceholderCid(tim.cid) || hasPlaceholderWitness(tim) || hasStaleTimCid(tim)) {
            const signedTim = await processTim(tim, privateKey, witnessKey);
            json.tim = signedTim;
            updated = json;
            console.log(`  [fixture:tim] ${relPath}`);
          }
        }

        if (updated) {
          await writeFile(fullPath, JSON.stringify(updated, null, 2) + '\n');
          count++;
        }
      } catch (err) {
        // Skip files that can't be parsed
      }
    }
  }

  return count;
}

async function main() {
  console.log('Arky Artifact Signing Script');
  console.log('============================\n');

  // Import keys: issuer (key-01) and witness (key-02).
  const privateKey = await jose.importJWK(TEST_KEY, 'EdDSA');
  const witnessKey = await jose.importJWK(TEST_WITNESS_KEY, 'EdDSA');

  const rootDir = join(import.meta.dir, '..');

  console.log('Processing directories...\n');

  let total = 0;

  // Process registries
  console.log('Registries:');
  total += await processDirectory(join(rootDir, 'registries'), privateKey, rootDir, witnessKey);

  // Process policies
  console.log('\nPolicies:');
  total += await processDirectory(join(rootDir, 'policies'), privateKey, rootDir, witnessKey);

  // Process examples
  console.log('\nExamples:');
  total += await processDirectory(join(rootDir, 'examples'), privateKey, rootDir, witnessKey);

  // Process vectors
  console.log('\nVectors:');
  total += await processDirectory(join(rootDir, 'vectors'), privateKey, rootDir, witnessKey);

  console.log(`\nDone! Signed ${total} artifacts.`);
}

main().catch(console.error);
