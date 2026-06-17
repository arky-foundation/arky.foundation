//! Canonicalize a raw JSON string argument (for cross-language number/edge
//! checks). Usage: cargo run --example canonjson -- '{"n":1e21}'

use arky_core::canonicalize;

fn main() {
    let s = std::env::args().nth(1).expect("usage: canonjson <json>");
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    print!("{}", canonicalize(&v));
}
