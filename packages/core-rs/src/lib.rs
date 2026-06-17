//! arky-core — reference Rust implementation of Arky TIM.
//!
//! A second independent stack covering JCS canonicalization (RFC 8785,
//! hand-rolled including number formatting), content addressing (multihash
//! sha2-256 with base58btc multibase), detached-payload Ed25519 JWS (RFC 7797),
//! and TIM verification with did:key resolution. Built from the specs, it
//! reproduces byte-identical canonical bytes, cids, and signatures to
//! `@arky/core` (TS) on the Foundation's published vectors.

pub mod assert;
pub mod canonicalize;
pub mod cid;
pub mod jws;
pub mod kernel;
pub mod settler;
pub mod tim;

pub use assert::{evaluate_assertion, EvalResult, SymVal, Symbols, TriState};
pub use canonicalize::canonicalize;
pub use cid::{cid_from_canonical, from_multibase, multihash_mb, to_multibase};
pub use jws::{sign_detached, verify_detached, verifying_key_from_bytes};
pub use kernel::{evaluate_kernel, parse_iso_duration_ms, Decision, DecisionStatus, REGISTERED_VERBS};
pub use settler::{args_hash, derive_idempotency_key, execute, ExecRequest, ExecStatus, ExecuteResult, IdempotencyStore};
pub use tim::{canonical_body, resolve_did_key, verify_tim, VerifyResult};
