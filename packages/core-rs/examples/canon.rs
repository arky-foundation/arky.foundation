//! Emit the JCS canonical string of a TIM's canonical body (cid/sig/witnesses
//! stripped) for a fixture, so CI can byte-diff Rust output against @arky/core.
//!
//! Usage: cargo run --example canon -- <path-to-tim-fixture.json>

use arky_core::{canonicalize, tim::canonical_body};
use std::env;
use std::fs;

fn main() {
    let path = env::args().nth(1).expect("usage: canon <fixture.json>");
    let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    // Accept either a bare TIM or a fixture wrapper { "tim": {...} }.
    let tim = if v.get("tim").is_some() {
        &v["tim"]
    } else {
        &v
    };
    print!("{}", canonicalize(&canonical_body(tim)));
}
