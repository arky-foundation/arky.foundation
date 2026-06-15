#!/usr/bin/env bun
/**
 * Generate the end-to-end reference path: one fully-materialized vertical
 * proving the whole loop works as a cryptographically-linked chain, not just
 * isolated components.
 *
 *   TIM (evidence)  ->  Notary (witness + Merkle anchor)
 *                   ->  Kernel Decision (APPROVED)
 *                   ->  Settler Execution Receipt (XR)
 *
 * Every artifact is really signed (fixture test keys) and references the
 * previous by its real cid, so `verify` can walk the chain and prove linkage.
 * Output: vectors/integration/reference-path/*.json (regenerable, idempotent).
 *
 * Usage: bun run scripts/gen-reference-path.ts
 */

import * as jose from 'jose';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { jcsCanonical, multihash, merkleRoot, deriveIdempotencyKey } from './lib/merkle.ts';

const rootDir = join(import.meta.dir, '..');
const outDir = join(rootDir, 'vectors/integration/reference-path');

// Fixture test keys (DO NOT USE IN PRODUCTION). issuer=01, settler/notary=03.
const KEY_ISSUER = {
  kty: 'OKP', crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
  d: 'nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A', kid: 'test-key-2025-01',
};
const KEY_NOTARY = {
  kty: 'OKP', crv: 'Ed25519',
  x: 'HDl_cQgT9vSiYMsH8q1dOdyb5prCuQYuRVBRhTTk1P8',
  d: 's-lf3-1u1GTPb6JOqqYlBVWC8eYdKhXPRZkj7k3x0h8', kid: 'notary-key-2025-01',
};
const DID_ISSUER = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';

/** Detached-payload JWS (RFC 7797, b64:false) over canonical bytes. */
async function signDetached(canonical: string, key: typeof KEY_ISSUER): Promise<string> {
  const priv = await jose.importJWK(key, 'EdDSA');
  const jws = await new jose.CompactSign(new TextEncoder().encode(canonical))
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWS', kid: key.kid, b64: false, crit: ['b64'] })
    .sign(priv);
  const [h, , s] = jws.split('.');
  return `${h}..${s}`;
}

/** Compute cid (multibase multihash) over the canonical body. */
function cidOf(canonical: string): string {
  return multihash(new TextEncoder().encode(canonical));
}

/**
 * Sign an artifact: canonical body excludes cid/sig (and time.witnesses), then
 * attach cid + sig. Returns the full artifact plus its canonical bytes.
 */
async function sign(body: Record<string, unknown>, key: typeof KEY_ISSUER) {
  const canonical = jcsCanonical(body);
  const cid = cidOf(canonical);
  const sig = await signDetached(canonical, key);
  return { artifact: { ...body, cid, sig }, cid, canonical };
}

async function main() {
  await mkdir(outDir, { recursive: true });

  // ---- Step 1: TIM evidence (datacenter temperature, °F) ----
  const timBody = {
    time: { ts: '2025-10-15T14:30:00Z' },
    identity: { id: DID_ISSUER },
    measurement: {
      name: 'temperature',
      value: 87.5,
      unit: 'arky:unit/temp.F',
      method: { type: 'sensor', source: 'device:datacenter-temp-01', version: 'v2.1' },
      device: 'datacenter-temp-01',
    },
    nonce: 'ref-path-tim-001',
  };
  const tim = await sign(timBody, KEY_ISSUER);
  // Notary witnesses the same canonical bytes as the issuer (TIM §6).
  const witnessSig = await signDetached(tim.canonical, KEY_NOTARY);
  const timSigned = { ...tim.artifact } as any;
  timSigned.time = { ...timSigned.time, witnesses: [witnessSig] };

  // ---- Step 2: Notary anchor (Merkle root over the single TIM cid) ----
  const root = merkleRoot([tim.cid]);
  const anchorBody = {
    cid_root: root,
    target: 'log:arky:transparency@v1',
    locator: 'ref-path-batch-0001',
    ts_anchor: '2025-10-15T14:30:01Z',
    finality: { depth: 1, status: 'final' },
    proof: { leaf: tim.cid, path: [], alg: 'merkle-sha256-v1' },
    witnessed_cid: tim.cid,
  };
  const anchor = await sign(anchorBody, KEY_NOTARY);

  // ---- Step 3: Kernel commitment + Decision ----
  const kernelBody = {
    scope: 'arky:scope/datacenter.cooling',
    actor: DID_ISSUER,
    intent: { do: 'arky:verb/pay@v1', budget: { value: 500, unit: 'USD' } },
    measure: [
      { name: 'temp', from: 'sensor:datacenter', window: { max_age: 'PT5M' }, assert: 'temp > 85' },
    ],
    consequence: [
      {
        if: 'PASS',
        then: [
          {
            name: 'arky:verb/pay@v1',
            args: {
              to: 'acct:cooling-provider:billing',
              amount: { value: 100, unit: 'USD' },
              memo: 'Emergency cooling activation',
            },
          },
        ],
      },
    ],
    nonce: 'ref-path-kernel-001',
  };
  const kernel = await sign(kernelBody, KEY_ISSUER);

  // Decision references the kernel cid and the exact TIM cid that drove it.
  const decisionBody = {
    kernel_cid: kernel.cid,
    actor: DID_ISSUER,
    scope: 'arky:scope/datacenter.cooling',
    status: 'APPROVED',
    assertions: [{ name: 'temp', result: 'PASS', inputs: [tim.cid] }],
    authorized: [
      {
        name: 'arky:verb/pay@v1',
        args: {
          to: 'acct:cooling-provider:billing',
          amount: { value: 100, unit: 'USD' },
          memo: 'Emergency cooling activation',
        },
      },
    ],
    ts_eval: '2025-10-15T14:30:02Z',
  };
  const decision = await sign(decisionBody, KEY_ISSUER);

  // ---- Step 4: Settler Execution Receipt (XR) ----
  const verb = 'arky:verb/pay@v1';
  const rail = 'arky:rail/ach:us@v1';
  const args = {
    to: 'acct:cooling-provider:billing',
    amount: { value: 100, unit: 'USD' },
    memo: 'Emergency cooling activation',
  };
  const xrBody = {
    request_id: 'ref-path-exec-001',
    commitment_cid: kernel.cid,
    decision_cid: decision.cid,
    verb,
    rail,
    args_hash: multihash(new TextEncoder().encode(jcsCanonical(args))),
    idempotency_key: deriveIdempotencyKey({ commitment_cid: kernel.cid, verb, rail, args, verb_index: 0 }),
    status: 'success',
    locator: 'ACH20251015T143005-refpath',
    cost: { unit: 'USD', value: 0.25 },
    anchors: [{ target: 'log:arky:transparency@v1', locator: 'ref-path-batch-0002', status: 'pending' }],
    ts: '2025-10-15T14:30:05Z',
  };
  const xr = await sign(xrBody, KEY_NOTARY);

  // ---- Write the chain ----
  const files: [string, unknown][] = [
    ['01-tim.json', timSigned],
    ['02-anchor.json', anchor.artifact],
    ['03-kernel.json', kernel.artifact],
    ['04-decision.json', decision.artifact],
    ['05-xr.json', xr.artifact],
  ];
  for (const [name, obj] of files) {
    await writeFile(join(outDir, name), JSON.stringify(obj, null, 2) + '\n');
  }

  // Chain manifest: the linkage the verifier must confirm.
  const chain = {
    id: 'reference-path-001',
    description: 'End-to-end: TIM -> Notary anchor -> Kernel decision -> Settler XR, fully signed and cross-linked.',
    scenario: 'Datacenter temperature 87.5°F (> 85 threshold) authorizes a $100 cooling payment.',
    keys: { issuer: 'fixtures/keys/ed25519-test-01.json', notary: 'fixtures/keys/ed25519-test-03.json' },
    artifacts: {
      tim: '01-tim.json',
      anchor: '02-anchor.json',
      kernel: '03-kernel.json',
      decision: '04-decision.json',
      xr: '05-xr.json',
    },
    cids: { tim: tim.cid, anchor: anchor.cid, kernel: kernel.cid, decision: decision.cid, xr: xr.cid },
    links: [
      { from: 'anchor.witnessed_cid', to: 'tim.cid', value: tim.cid },
      { from: 'anchor.proof.leaf', to: 'tim.cid', value: tim.cid },
      { from: 'decision.assertions[0].inputs[0]', to: 'tim.cid', value: tim.cid },
      { from: 'decision.kernel_cid', to: 'kernel.cid', value: kernel.cid },
      { from: 'xr.commitment_cid', to: 'kernel.cid', value: kernel.cid },
      { from: 'xr.decision_cid', to: 'decision.cid', value: decision.cid },
    ],
  };
  await writeFile(join(outDir, 'chain.json'), JSON.stringify(chain, null, 2) + '\n');

  console.log('Reference path generated:');
  for (const [name] of files) console.log(`  ${name}`);
  console.log('  chain.json');
  console.log(`\ncids:\n  tim      ${tim.cid}\n  anchor   ${anchor.cid}\n  kernel   ${kernel.cid}\n  decision ${decision.cid}\n  xr       ${xr.cid}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
