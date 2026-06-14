/**
 * Reference implementations of Arky's deterministic algorithms, shared by the
 * conformance verifier and any tooling. These are the single source of truth
 * for cross-checking N2 (Merkle/inclusion) and S2 (idempotency) vectors.
 *
 *   - Notary Merkle tree (ARKY-NOTARY-v1 §5.1, profile merkle-sha256-v1)
 *   - Notary inclusion-proof verification (§5.2)
 *   - Settler idempotency-key derivation (ARKY-SETTLERS-v1 §6.1)
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { base58btc } from 'multiformats/bases/base58';

/** Decode a multibase 'z…' base58btc cid into its raw multihash bytes. */
export function decodeCid(cid: string): Uint8Array {
  return base58btc.decode(cid);
}

/** Bytewise comparison: negative if a<b, 0 if equal, positive if a>b. */
export function byteCompare(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** internal_node = SHA-256(min(left,right) || max(left,right)) — §5.1 step 3. */
export function merkleNode(left: Uint8Array, right: Uint8Array): Uint8Array {
  return byteCompare(left, right) <= 0
    ? sha256(concat(left, right))
    : sha256(concat(right, left));
}

/** Encode raw 32-byte hash as multibase(multihash(sha2-256, …)). */
export function encodeRoot(bytes: Uint8Array): string {
  return base58btc.encode(new Uint8Array([0x12, 0x20, ...bytes]));
}

/**
 * Compute the Merkle root over a set of cids per ARKY-NOTARY-v1 §5.1:
 * decode → sort bytewise → duplicate last if odd → hash bottom-up → encode.
 */
export function merkleRoot(cids: string[]): string {
  if (cids.length === 0) throw new Error('merkleRoot: empty cid set');
  let level = cids.map(decodeCid).sort(byteCompare);
  while (level.length > 1) {
    if (level.length % 2 === 1) level.push(level[level.length - 1]); // duplicate last
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(merkleNode(level[i], level[i + 1]));
    level = next;
  }
  return encodeRoot(level[0]);
}

/**
 * Verify an inclusion proof per §5.2: fold the leaf with each sibling using the
 * same min/max node rule and compare to the claimed root. `path` and `leaf` are
 * cids (multibase); `root` is the claimed multibase root.
 */
export function verifyInclusion(leaf: string, path: string[], root: string): boolean {
  let current = decodeCid(leaf);
  for (const sibling of path) {
    current = merkleNode(current, decodeCid(sibling));
  }
  return encodeRoot(current) === root;
}

/** JCS (RFC 8785) canonical serialization (UTF-16 key order). */
export function jcsCanonical(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(jcsCanonical).join(',') + ']';
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted
    .map((k) => {
      const v = (obj as Record<string, unknown>)[k];
      return v === undefined ? null : JSON.stringify(k) + ':' + jcsCanonical(v);
    })
    .filter(Boolean);
  return '{' + pairs.join(',') + '}';
}

/** multibase(multihash(sha2-256, bytes)). */
export function multihash(bytes: Uint8Array): string {
  return encodeRoot(sha256(bytes));
}

/**
 * Derive a Settler idempotency key from a request per ARKY-SETTLERS-v1 §6.1
 * (used when the client omits idempotency_key):
 *   args_hash  = mh(JCS(args))
 *   components = {args_hash, commitment_cid, rail, verb, verb_index}
 *   key        = mh(JCS(components))
 */
export function deriveIdempotencyKey(input: {
  commitment_cid: string;
  verb: string;
  rail: string;
  args: unknown;
  verb_index: number;
}): string {
  const argsHash = multihash(new TextEncoder().encode(jcsCanonical(input.args)));
  const components = {
    args_hash: argsHash,
    commitment_cid: input.commitment_cid,
    rail: input.rail,
    verb: input.verb,
    verb_index: input.verb_index,
  };
  return multihash(new TextEncoder().encode(jcsCanonical(components)));
}

/**
 * Notary finality depth per ARKY-NOTARY-v1 §4.4:
 *   depth = max(registry_default, policy_pack_minimum, request_override)
 * A request override below the policy-pack floor is a policy violation (the
 * caller surfaces notary.policy_violation); this returns { depth, violation }.
 */
export function finalityDepth(input: {
  registry_default: number;
  policy_pack_minimum?: number;
  request_override?: number;
}): { depth: number; violation: boolean } {
  const floor = input.policy_pack_minimum ?? 0;
  const violation =
    input.request_override !== undefined && input.request_override < floor;
  const depth = Math.max(
    input.registry_default,
    floor,
    input.request_override ?? 0,
  );
  return { depth, violation };
}

/**
 * Settler XR state-machine guard per ARKY-SETTLERS-v1 §5.2. `context` carries
 * withinRollbackWindow and railSupportsRollback for the conditional edges.
 */
export function canTransition(
  from: string,
  to: string,
  context: { withinRollbackWindow?: boolean; railSupportsRollback?: boolean } = {},
): boolean {
  const transitions: Record<string, string[]> = {
    pending: ['success', 'failed', 'rolled_back'],
    success: context.withinRollbackWindow ? ['rolled_back'] : [],
    failed: context.railSupportsRollback ? ['rolled_back'] : [],
    rolled_back: [],
    skipped: [],
  };
  return transitions[from]?.includes(to) ?? false;
}
