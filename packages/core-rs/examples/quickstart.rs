//! arky-core quickstart: generate a key, sign a TIM, verify it.
//! Run: cargo run --example quickstart

use arky_core::{create_tim, from_seed, verify_tim};
use serde_json::json;

fn main() {
    // A keypair whose did:key matches the signing key (no DID/key mismatch).
    // (Use a random seed in production; fixed here for a reproducible demo.)
    let issuer = from_seed([42u8; 32]);

    // Produce a signed, content-addressed TIM.
    let body = json!({
        "time": { "ts": "2025-10-15T12:00:00Z" },
        "identity": { "id": issuer.did },
        "measurement": {
            "name": "temperature",
            "value": 22.5,
            "unit": "degC",
            "method": { "type": "sensor", "source": "device:datacenter-temp-01" }
        }
    });
    let tim = create_tim(body, &issuer.signing_key, None);
    println!("TIM cid: {}", tim["cid"].as_str().unwrap());

    // Verify it. For a did:key identity the verifying key is resolved
    // automatically from identity.id — the resolver below handles the issuer.
    let pub_bytes = issuer.signing_key.verifying_key().to_bytes();
    let res = verify_tim(&tim, &|_t, _kid| Some(pub_bytes.to_vec()));
    println!("valid: {}", res.valid); // true
}
