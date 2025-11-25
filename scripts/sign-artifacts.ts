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

// Test key from fixtures (DO NOT USE IN PRODUCTION)
const TEST_KEY = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
  d: 'nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A',
  kid: 'test-key-2025-01'
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
 * Sign canonical bytes with Ed25519 using JWS compact format
 */
async function signJws(canonicalBytes: Uint8Array, privateKey: jose.KeyLike): Promise<string> {
  const jws = await new jose.CompactSign(canonicalBytes)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWS', kid: TEST_KEY.kid })
    .sign(privateKey);
  return jws;
}

/**
 * Check if a signature looks like a placeholder
 */
function isPlaceholderSig(sig: unknown): boolean {
  if (typeof sig !== 'string') return false;
  return sig.includes('placeholder') ||
         sig.includes('MOCK') ||
         sig.includes('example') ||
         sig === 'eyJ.example.kernel.signature' ||
         sig.length < 50; // Real JWS is much longer
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
 * Process a TIM object: compute cid and sign
 */
async function processTim(tim: Record<string, unknown>, privateKey: jose.KeyLike): Promise<Record<string, unknown>> {
  // Remove existing cid and sig for canonical body
  const { cid: _, sig: __, ...body } = tim;

  // Canonicalize and compute CID
  const canonical = jcsCanonical(body);
  const newCid = computeCid(canonical);

  // Sign canonical bytes
  const canonicalBytes = new TextEncoder().encode(canonical);
  const newSig = await signJws(canonicalBytes, privateKey);

  return { ...body, cid: newCid, sig: newSig };
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
async function processDirectory(dir: string, privateKey: jose.KeyLike, rootDir: string): Promise<number> {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      count += await processDirectory(fullPath, privateKey, rootDir);
    } else if (entry.name.endsWith('.json')) {
      const relPath = relative(rootDir, fullPath);

      // Skip certain files
      if (relPath.includes('jwks.json') || relPath.includes('package.json')) {
        continue;
      }

      try {
        const content = await readFile(fullPath, 'utf-8');
        const json = JSON.parse(content);

        let updated: Record<string, unknown> | null = null;

        // Detect artifact type and process accordingly
        const hasSig = 'sig' in json;
        const hasCid = 'cid' in json;
        const needsSign = hasSig && isPlaceholderSig(json.sig);
        const needsCid = hasCid && isPlaceholderCid(json.cid);

        if (needsSign || needsCid) {
          if (json.time && json.identity && json.measurement) {
            // TIM
            updated = await processTim(json, privateKey);
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
          if (isPlaceholderSig(tim.sig) || isPlaceholderCid(tim.cid)) {
            const signedTim = await processTim(tim, privateKey);
            json.inputs.tim = signedTim;
            updated = json;
            console.log(`  [vector:tim] ${relPath}`);
          }
        }

        // Handle test vectors with embedded kernels
        if (json.inputs?.kernel) {
          const kernel = json.inputs.kernel;
          if (isPlaceholderSig(kernel.sig) || isPlaceholderCid(kernel.cid)) {
            const signedKernel = await processSignedArtifact(kernel, privateKey);
            json.inputs.kernel = signedKernel;
            updated = json;
            console.log(`  [vector:kernel] ${relPath}`);
          }
        }

        // Handle fixture files with embedded TIMs
        if (json.tim && json.tim.time && json.tim.identity && json.tim.measurement) {
          const tim = json.tim;
          if (isPlaceholderSig(tim.sig) || isPlaceholderCid(tim.cid)) {
            const signedTim = await processTim(tim, privateKey);
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

  // Import private key
  const privateKey = await jose.importJWK(TEST_KEY, 'EdDSA');

  const rootDir = join(import.meta.dir, '..');

  console.log('Processing directories...\n');

  let total = 0;

  // Process registries
  console.log('Registries:');
  total += await processDirectory(join(rootDir, 'registries'), privateKey, rootDir);

  // Process policies
  console.log('\nPolicies:');
  total += await processDirectory(join(rootDir, 'policies'), privateKey, rootDir);

  // Process examples
  console.log('\nExamples:');
  total += await processDirectory(join(rootDir, 'examples'), privateKey, rootDir);

  // Process vectors
  console.log('\nVectors:');
  total += await processDirectory(join(rootDir, 'vectors'), privateKey, rootDir);

  console.log(`\nDone! Signed ${total} artifacts.`);
}

main().catch(console.error);
