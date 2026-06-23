# arky-core (Rust)

Reference Rust implementation of **Arky TIM** — produce and verify
Time-Identity-Measurement receipts. A second independent stack alongside the
TypeScript [`@arky/core`](../core): JCS canonicalization (RFC 8785, including the
number formatter — no runtime float-printing crutch), content addressing
(multihash sha2-256 + base58btc multibase), detached Ed25519 JWS (RFC 7797) over
`ed25519-dalek`, and Kernel/Settler evaluation.

Built clean-room from the [Arky specs](../../specs/core/ARKY-TIM-v1.md). It
passes the Foundation's conformance vectors and produces **byte-identical**
canonical bytes, cids, and signatures to the TS stack — CI runs
`scripts/cross-check.sh` to enforce that agreement on every push.

## Use

```toml
[dependencies]
arky-core = { path = "packages/core-rs" }  # path until published to crates.io
```

## Quickstart

```rust
use arky_core::{create_tim, from_seed, verify_tim};
use serde_json::json;

// A keypair whose did:key matches the signing key (no DID/key mismatch).
let issuer = from_seed([42u8; 32]); // random in production

let body = json!({
    "time": { "ts": "2025-10-15T12:00:00Z" },
    "identity": { "id": issuer.did },
    "measurement": {
        "name": "temperature", "value": 22.5, "unit": "degC",
        "method": { "type": "sensor", "source": "device:room-1" }
    }
});
let tim = create_tim(body, &issuer.signing_key, None);

let pubkey = issuer.signing_key.verifying_key().to_bytes();
let res = verify_tim(&tim, &|_t, _kid| Some(pubkey.to_vec()));
assert!(res.valid);
```

Run the full example: `cargo run --example quickstart`.

## API

- `from_seed(seed) -> KeyPair` / `did_key_from_public(pub)` — keys + did:key.
- `create_tim(body, &signing_key, kid) -> Value` — build + sign a TIM.
- `verify_tim(&tim, &resolver) -> VerifyResult` — verify cid, signature,
  witnesses. The resolver maps `(tim, optional witness kid)` to a 32-byte key;
  use `resolve_did_key` for did:key identities.
- `canonicalize`, `cid_from_canonical`, `sign_detached`, `verify_detached` —
  primitives.
- `evaluate_kernel(...)`, `evaluate_assertion(...)` — Kernel.
- `settler::execute(...)` — Settler.

## Status

Pre-1.0 (`v0.1.0`); the five core-loop specs are at `status: implementing` with
L2 conformance coverage (other specs remain `status: review`). Passes the
published vectors at L2 and is cross-checked byte-for-byte against the TS stack,
but formal ratification of the core specs to **stable** is still pending.
Fixture keys are TEST KEYS — generate your own.

Apache-2.0.
