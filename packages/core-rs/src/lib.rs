//! arky-core — reference Rust implementation of Arky TIM.
//!
//! A second independent stack covering JCS canonicalization (RFC 8785,
//! hand-rolled including number formatting), content addressing (multihash
//! sha2-256 with base58btc multibase), detached-payload Ed25519 JWS (RFC 7797),
//! and TIM verification with did:key resolution. Built from the specs, it
//! reproduces byte-identical canonical bytes, cids, and signatures to
//! `@arky/core` (TS) on the Foundation's published vectors.

pub mod canonicalize;
pub mod cid;
pub mod jws;
pub mod tim;

pub use canonicalize::canonicalize;
pub use cid::{cid_from_canonical, from_multibase, multihash_mb, to_multibase};
pub use jws::{sign_detached, verify_detached, verifying_key_from_bytes};
pub use tim::{canonical_body, resolve_did_key, verify_tim, VerifyResult};
