//! Emit epoch ms for an RFC3339 timestamp, so CI can compare Rust's
//! parse_rfc3339_ms against @arky/core (TS) Date.parse. Prints the integer
//! epoch ms, or "NONE" when the parser rejects the input (TS prints NaN as
//! "NONE" too). Usage: cargo run --example parsetime -- <ts>

use arky_core::kernel::parse_rfc3339_ms;

fn main() {
    let ts = std::env::args().nth(1).expect("usage: parsetime <ts>");
    match parse_rfc3339_ms(&ts) {
        Some(ms) => print!("{ms}"),
        None => print!("NONE"),
    }
}
