/**
 * TIM produce + verify, per ARKY-TIM-v1.
 *
 * Canonical body = TIM minus `cid`, `sig`, and `time.witnesses` (the witnesses
 * are co-signed over the same bytes and appended afterwards). The issuer `sig`
 * and each witness are detached-payload Ed25519 JWS over the canonical bytes.
 */

import { canonicalize } from './canonicalize.ts';
import { cidFromCanonical, base58btcDecode } from './cid.ts';
import { signDetached, verifyDetached } from './jws.ts';

export interface TimMeasurement {
  name: string;
  value: number | string | boolean | object;
  unit?: string;
  method: { type: string; source: string; params?: object; version?: string };
  device?: string;
  error?: string;
  code?: string;
  provenance?: unknown;
}

export interface Tim {
  time: { ts: string; witnesses?: string[]; ordering?: unknown };
  identity: { id: string; claims?: unknown[]; proofs?: unknown[] };
  measurement: TimMeasurement;
  prev?: string;
  cid: string;
  nonce?: string;
  exp?: string;
  sig: string;
  [k: string]: unknown;
}

/** The canonical body: strip cid, sig, and time.witnesses (drop empty time). */
export function canonicalBody(tim: Record<string, unknown>): Record<string, unknown> {
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

export interface CreateTimInput {
  ts: string;
  identity: { id: string; claims?: unknown[]; proofs?: unknown[] };
  measurement: TimMeasurement;
  prev?: string;
  nonce?: string;
  exp?: string;
}

/** Build a signed TIM from inputs and an Ed25519 private key seed. */
export function createTim(input: CreateTimInput, privateKey: Uint8Array, kid?: string): Tim {
  const body: Record<string, unknown> = {
    time: { ts: input.ts },
    identity: input.identity,
    measurement: input.measurement,
    ...(input.prev ? { prev: input.prev } : {}),
    ...(input.nonce ? { nonce: input.nonce } : {}),
    ...(input.exp ? { exp: input.exp } : {}),
  };
  const canonical = canonicalize(body);
  const cid = cidFromCanonical(canonical);
  const sig = signDetached(new TextEncoder().encode(canonical), privateKey, kid);
  return { ...(body as object), cid, sig } as Tim;
}

const REQUIRED_PATHS = [
  'time.ts',
  'identity.id',
  'measurement.name',
  'measurement.value',
  'measurement.method',
  'cid',
  'sig',
];

function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj);
}

export interface VerifyResult {
  valid: boolean;
  errors: string[];
  schema_valid: boolean;
  cid_valid: boolean;
  signature_valid: boolean;
  witnesses_valid: boolean;
  /** false iff `options.at` is provided and the TIM's `exp` is at/before it. */
  fresh: boolean;
  missing_fields?: string[];
}

export interface VerifyOptions {
  /**
   * Current time (RFC3339 or epoch ms) for freshness enforcement (TIM §4). When
   * provided, a TIM whose `exp` is at or before this time fails with
   * `tim.expired`. Omit to skip freshness (pure cryptographic verification).
   *
   * Note: anti-replay (`nonce`) and causal-chain (`prev`, cross-identity)
   * enforcement need external state (a seen-nonce store, the prior chain) and
   * are the caller's responsibility — single-TIM verification cannot do them.
   */
  at?: string | number;
}

/**
 * Verify a TIM. `resolveKey` maps an identity/kid to an Ed25519 public key; if
 * omitted, did:key identities are resolved automatically and others fail.
 */
export function verifyTim(
  tim: Record<string, unknown>,
  resolveKey: (tim: Record<string, unknown>) => Uint8Array | undefined = resolveDidKey,
  options: VerifyOptions = {},
): VerifyResult {
  const errors: string[] = [];
  const missing = REQUIRED_PATHS.filter((p) => getPath(tim, p) === undefined);
  const schema_valid = missing.length === 0;
  if (!schema_valid) {
    errors.push('tim.missing_required');
    return {
      valid: false,
      errors,
      schema_valid: false,
      cid_valid: false,
      signature_valid: false,
      witnesses_valid: false,
      fresh: true,
      missing_fields: missing,
    };
  }

  const canonical = canonicalize(canonicalBody(tim));
  const payload = new TextEncoder().encode(canonical);

  const cid_valid = cidFromCanonical(canonical) === tim.cid;
  if (!cid_valid) errors.push('tim.cid_mismatch');

  const key = resolveKey(tim);
  let signature_valid = false;
  if (!key) {
    errors.push('tim.key_unresolved');
  } else {
    signature_valid = verifyDetached(tim.sig as string, payload, key);
    if (!signature_valid) errors.push('tim.invalid_signature');
  }

  // Witnesses (optional): each is a detached JWS over the SAME canonical bytes.
  let witnesses_valid = true;
  const witnesses = (tim.time as any)?.witnesses;
  if (Array.isArray(witnesses)) {
    for (let i = 0; i < witnesses.length; i++) {
      const wk = resolveKey({ ...tim, __witness: witnesses[i] });
      if (!wk || !verifyDetached(witnesses[i], payload, wk)) {
        witnesses_valid = false;
        errors.push(`tim.invalid_witness[${i}]`);
      }
    }
  }

  // Freshness (TIM §4): if a reference time is given and `exp` is at/before it,
  // the receipt has expired.
  let fresh = true;
  if (options.at !== undefined && typeof tim.exp === 'string') {
    const now = typeof options.at === 'number' ? options.at : Date.parse(options.at);
    const exp = Date.parse(tim.exp);
    if (!Number.isNaN(now) && !Number.isNaN(exp) && exp <= now) {
      fresh = false;
      errors.push('tim.expired');
    }
  }

  const valid = cid_valid && signature_valid && witnesses_valid && fresh;
  return { valid, errors, schema_valid, cid_valid, signature_valid, witnesses_valid, fresh };
}

/**
 * Extract an Ed25519 public key from a did:key:z6Mk… identity. Returns
 * undefined for any malformed input (bad base58, wrong multicodec, wrong
 * length) — it MUST NOT throw, so a verifier processing untrusted TIMs cannot
 * be crashed (DoS) by a hostile identity string.
 */
export function resolveDidKey(tim: Record<string, unknown>): Uint8Array | undefined {
  const id = (tim.identity as any)?.id as string | undefined;
  if (!id?.startsWith('did:key:z6Mk')) return undefined;
  try {
    // did:key multibase: 'z' + base58btc(0xed 0x01 || 32-byte ed25519 pubkey).
    const decoded = base58btcDecode(id.slice('did:key:z'.length));
    if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) return undefined;
    return decoded.slice(2);
  } catch {
    return undefined;
  }
}
