/**
 * Settler execution per ARKY-SETTLERS-v1 §4 (pre-checks) and §5 (Execution
 * Receipt). Independent implementation: validate an execution request (verb
 * registered, args valid, rail supported), then produce a signed XR. Supports
 * deterministic idempotency (§6.1) so duplicate requests return the same XR.
 */

import { canonicalize } from './canonicalize.ts';
import { cidFromCanonical, multihashSha256, toMultibase } from './cid.ts';
import { signDetached } from './jws.ts';
import { REGISTERED_VERBS } from './kernel.ts';

/** Required argument fields per core verb (schemas/verbs/*.json). */
export const VERB_REQUIRED_ARGS: Record<string, string[]> = {
  'arky:verb/pay@v1': ['to', 'amount'],
  'arky:verb/refund@v1': ['payment_ref'],
  'arky:verb/slash@v1': ['subject', 'amount'],
  'arky:verb/revoke@v1': ['subject'],
  'arky:verb/upgrade@v1': ['target', 'version'],
  'arky:verb/signal@v1': ['channel'],
  'arky:verb/control@v1': ['action'],
};

export interface ExecutionRequest {
  verb: string;
  rail?: string;
  params?: Record<string, unknown>;
  args?: Record<string, unknown>;
  commitment_cid?: string;
  request_id?: string;
  idempotency_key?: string;
}

export type XrStatus = 'success' | 'pending' | 'failed' | 'rolled_back' | 'skipped';

export interface ExecutionReceipt {
  request_id: string;
  commitment_cid: string;
  verb: string;
  rail: string;
  args_hash: string;
  idempotency_key: string;
  status: XrStatus;
  locator?: string;
  anchors?: Array<{ target: string; locator: string; status: string }>;
  error?: { code: string; message: string };
  ts: string;
  cid: string;
  sig: string;
  [k: string]: unknown;
}

export interface ExecuteResult {
  valid: boolean;
  status: 'SUCCESS' | 'FAILED';
  errors: string[];
  missing_fields?: string[];
  receipt?: ExecutionReceipt;
}

/** A rail is unsupported if its scheme is explicitly `unknown:`; absent is ok. */
function railSupported(rail: string | undefined): boolean {
  if (!rail) return true;
  return !rail.startsWith('unknown:');
}

/**
 * multibase(multihash(sha2-256, JCS(args))) — args_hash and the basis for the
 * deterministic idempotency key (§5 / §6.1).
 */
export function argsHash(args: unknown): string {
  return toMultibase(multihashSha256(new TextEncoder().encode(canonicalize(args ?? {}))));
}

/** Derive an idempotency key per §6.1 when the client omits one. */
export function deriveIdempotencyKey(req: { commitment_cid?: string; verb: string; rail?: string; args: unknown; verb_index?: number }): string {
  const components = {
    args_hash: argsHash(req.args),
    commitment_cid: req.commitment_cid ?? '',
    rail: req.rail ?? '',
    verb: req.verb,
    verb_index: req.verb_index ?? 0,
  };
  return toMultibase(multihashSha256(new TextEncoder().encode(canonicalize(components))));
}

/** In-memory idempotency cache: key -> XR. */
export type IdempotencyStore = Map<string, ExecutionReceipt>;

export interface ExecuteOptions {
  privateKey: Uint8Array;
  kid?: string;
  ts?: string;
  /** anchor target attached to the XR (default the transparency log) */
  anchorTarget?: string;
  store?: IdempotencyStore;
}

/**
 * Validate and "execute" a request (no real rail — produces a signed XR with a
 * mock locator + anchor). Pre-check order per §4.2: verb -> args -> rail.
 */
export function execute(req: ExecutionRequest, opts: ExecuteOptions): ExecuteResult {
  const args = req.args ?? req.params ?? {};
  const rail = req.rail ?? (req.params?.rail as string | undefined);

  // 1. Verb must be registered.
  if (!REGISTERED_VERBS.has(req.verb)) {
    return { valid: false, status: 'FAILED', errors: ['settler.unknown_verb'] };
  }
  // 2. Required args present.
  const required = VERB_REQUIRED_ARGS[req.verb] ?? [];
  const missing = required.filter((k) => (args as Record<string, unknown>)[k] === undefined);
  if (missing.length > 0) {
    return { valid: false, status: 'FAILED', errors: ['settler.invalid_args'], missing_fields: missing };
  }
  // 3. Rail supported.
  if (!railSupported(rail)) {
    return { valid: false, status: 'FAILED', errors: ['settler.unsupported_rail'] };
  }

  // Idempotency: return cached XR for the same key.
  const idemKey = req.idempotency_key ?? deriveIdempotencyKey({ commitment_cid: req.commitment_cid, verb: req.verb, rail, args });
  const cached = opts.store?.get(idemKey);
  if (cached) return { valid: true, status: 'SUCCESS', errors: [], receipt: cached };

  const ts = opts.ts ?? new Date().toISOString();
  const anchorTarget = opts.anchorTarget ?? 'log:arky:transparency@v1';
  const body: Record<string, unknown> = {
    request_id: req.request_id ?? `exec-${idemKey.slice(0, 12)}`,
    commitment_cid: req.commitment_cid ?? '',
    verb: req.verb,
    rail: rail ?? '',
    args_hash: argsHash(args),
    idempotency_key: idemKey,
    status: 'success',
    locator: `MOCK-${idemKey.slice(1, 18)}`,
    anchors: [{ target: anchorTarget, locator: `batch-${idemKey.slice(1, 10)}`, status: 'pending' }],
    ts,
  };
  const canonical = canonicalize(body);
  const cid = cidFromCanonical(canonical);
  const sig = signDetached(new TextEncoder().encode(canonical), opts.privateKey, opts.kid);
  const receipt = { ...(body as object), cid, sig } as ExecutionReceipt;

  opts.store?.set(idemKey, receipt);
  return { valid: true, status: 'SUCCESS', errors: [], receipt };
}
