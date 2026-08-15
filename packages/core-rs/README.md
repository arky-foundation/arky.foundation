# arky-core (Rust)

Reference Rust implementation of **Arky TIM** — produce and verify
Time-Identity-Measurement receipts. One of four independent stacks, alongside
[Python](../core-py), [Go](../core-go) and [TypeScript](../core): JCS
canonicalization (RFC 8785, including the
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

## Security notes

These mirror `@arky/core`'s guarantees; all four stacks are held to them by a shared
adversarial suite (`tests/security.rs` here, `test/security.test.ts` there).

- **Verification never panics on hostile input.** A malformed identity,
  signature, or witness yields `valid: false`, not a panic — safe to run on
  untrusted TIMs.
- **Freshness is opt-in.** `verify_tim` is a pure cryptographic check; use
  `verify_tim_at(&tim, &resolver, Some(now))` to also reject expired receipts
  (`exp` ≤ `at` → `tim.expired`).
- **`resolve_did_key` is strict.** It accepts only `did:key:z6Mk…` decoding to
  exactly 34 bytes (`0xed 0x01` + a 32-byte Ed25519 key) and returns `None` for
  anything else, so it never hands back a byte slice that is not a key.
- **Anti-replay (`nonce`) and causal chains (`prev`, cross-identity) are the
  caller's responsibility.** Single-TIM verification cannot enforce them — they
  need external state (a seen-nonce store, the prior chain).
- **`did:key` keys are resolved from `identity.id`**, so a DID that does not
  match the signing key fails verification (no hardcoded trust).

## Status

Pre-1.0 (`v0.1.0`); the five core-loop specs are at `status: implementing` with
L2 conformance coverage (other specs remain `status: review`). Passes the
published vectors at L2 and is cross-checked byte-for-byte against the TS stack.
Promotion of the core specs to **stable** additionally waits on an external
implementation passing the vectors (governance §9.1.7) plus the recorded TC vote.
Fixture keys are TEST KEYS — generate your own.

Apache-2.0.
