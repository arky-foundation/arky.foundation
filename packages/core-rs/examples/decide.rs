//! Emit "<STATUS>|<authorized verbs>" for a K1 kernel vector, so CI can compare
//! Rust kernel decisions against @arky/core (TS).
//!
//! Usage: cargo run --example decide -- <path-to-k1-vector.json>

use arky_core::kernel::evaluate_kernel;
use serde_json::Value;
use std::{env, fs};

fn main() {
    let path = env::args().nth(1).expect("usage: decide <vector.json>");
    let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let v: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    let commitment = &v["inputs"]["commitment"];
    if commitment.is_null() {
        print!("NONE");
        return;
    }
    let mut tims = vec![];
    if let Some(tp) = v["context"]["fixtures"]["tim"].as_str() {
        let t: Value =
            serde_json::from_str(&fs::read_to_string(repo.join("vectors").join(tp)).unwrap())
                .unwrap();
        tims.push(t["tim"].clone());
    }
    let et = v["context"]["time"]
        .as_str()
        .unwrap_or("2025-10-15T12:00:00Z");
    let d = evaluate_kernel(commitment, &tims, et);
    print!("{}|{}", d.status.as_str(), d.authorized.join(","));
}
