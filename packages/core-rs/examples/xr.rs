//! Emit "<STATUS>|<xr cid>" for an S1 settler vector, so CI can compare Rust
//! execution receipts against @arky/core (TS).
//!
//! Usage: cargo run --example xr -- <path-to-s1-vector.json>

use arky_core::settler::{execute, ExecRequest, IdempotencyStore};
use ed25519_dalek::SigningKey;
use serde_json::Value;
use std::{env, fs};

fn main() {
    let path = env::args().nth(1).expect("usage: xr <vector.json>");
    let v: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    if v["level"].as_str() != Some("S1") {
        print!("SKIP");
        return;
    }
    let inp = &v["inputs"];
    let signing = SigningKey::from_bytes(&[9u8; 32]);
    let mut store = IdempotencyStore::new();
    let req = ExecRequest {
        verb: inp["verb"].as_str().unwrap_or(""),
        rail: inp["rail"].as_str(),
        args: inp["params"].clone(),
        commitment_cid: None,
        request_id: None,
        idempotency_key: inp["idempotency_key"].as_str(),
    };
    let ts = v["context"]["time"].as_str().unwrap_or("2025-10-15T12:00:01Z");
    let r = execute(&req, &signing, Some("test-settler"), ts, "log:arky:transparency@v1", Some(&mut store));
    match r.receipt {
        Some(xr) => print!("{}|{}", r.status.as_str(), xr["cid"].as_str().unwrap()),
        None => print!("{}|", r.status.as_str()),
    }
}
