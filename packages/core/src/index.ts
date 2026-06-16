/**
 * @arky/core — reference TypeScript implementation of Arky TIM.
 *
 * Produce and verify Time-Identity-Measurement receipts: JCS canonicalization
 * (RFC 8785), content addressing (multihash sha2-256 + base58btc multibase),
 * and detached-payload Ed25519 JWS (RFC 7797), with witnessing.
 *
 * This is an independent implementation built from the specs — it passes the
 * Foundation's TIM (T1) and Canonicalization (C1) vectors. See
 * `specs/core/ARKY-TIM-v1.md` and `ARKY-TIM-Canonicalization-v1.md`.
 */

export { canonicalize } from './canonicalize.ts';
export {
  computeCid,
  cidFromCanonical,
  multihashSha256,
  toMultibase,
  fromMultibase,
  base58btcEncode,
  base58btcDecode,
} from './cid.ts';
export {
  signDetached,
  verifyDetached,
  decodeProtectedHeader,
  base64urlEncode,
  base64urlDecode,
} from './jws.ts';
export {
  createTim,
  verifyTim,
  canonicalBody,
  resolveDidKey,
  type Tim,
  type TimMeasurement,
  type CreateTimInput,
  type VerifyResult,
} from './tim.ts';
export {
  evaluateAssertion,
  type TriState,
  type Symbols,
  type EvalResult,
} from './assert.ts';
export {
  evaluateKernel,
  parseIsoDurationMs,
  REGISTERED_VERBS,
  type Commitment,
  type MeasureSpec,
  type ConsequenceSpec,
  type Verb,
  type Decision,
  type DecisionStatus,
  type AssertionResult,
} from './kernel.ts';
