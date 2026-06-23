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
pub mod keys;
pub mod parse;
pub mod settler;
pub mod tim;

pub use keys::{KeyPair, did_key_from_public, from_seed};

pub use assert::{EvalResult, SymVal, Symbols, TriState, evaluate_assertion};
pub use canonicalize::canonicalize;
pub use cid::{cid_from_canonical, from_multibase, multihash_mb, to_multibase};
pub use jws::{sign_detached, verify_detached, verifying_key_from_bytes};
pub use kernel::{
    Decision, DecisionStatus, REGISTERED_VERBS, evaluate_kernel, parse_iso_duration_ms,
};
pub use parse::parse_strict;
pub use settler::{
    ExecRequest, ExecStatus, ExecuteResult, IdempotencyStore, args_hash, derive_idempotency_key,
    execute,
};
pub use tim::{
    VerifyResult, canonical_body, create_tim, resolve_did_key, verify_tim, verify_tim_at,
};
