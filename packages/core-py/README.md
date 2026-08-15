# arky-core (Python)

Reference **Python** implementation of Arky TIM — a fourth independent stack.

Produce and verify Time-Identity-Measurement receipts: JCS canonicalization
(RFC 8785), content addressing (multihash sha2-256 + base58btc multibase), and
detached-payload Ed25519 JWS (RFC 7797), with witnessing — plus the Kernel
(commitment evaluation) and Settler (execution receipts).

Built clean-room from the specs. It passes the published conformance vectors and
is cross-checked **byte-for-byte** against `@arky/core` (TypeScript), `arky-core`
(Rust) and `arky-core` (Go): canonical bytes, cids, Ed25519 signatures,
Kernel decisions, and execution receipts are all identical.

## Requirements

Python 3.11 or newer. **No runtime dependencies** — everything is standard
library. Ed25519 is implemented from RFC 8032 on top of `hashlib` (see the
caveat below), and base58btc, the JSON parser, and the RFC 8785 number formatter
are hand-rolled.

## Install

```sh
pip install arky-core
```

## Quickstart

```python
import arky_core as arky

def obj(**pairs):
    out = arky.JsonObject()
    for k, v in pairs.items():
        out.set(k, v)
    return out

kp = arky.generate_keypair()

tim = arky.create_tim(
    obj(
        time=obj(ts="2025-10-15T12:00:00Z"),
        identity=obj(id=kp.did),
        measurement=obj(
            name="temperature",
            value=arky.Number("22.5"),
            unit="arky:unit/temp.C",
            method=obj(type="sensor", source="device:temp-01"),
        ),
    ),
    kp.seed,
)

result = arky.verify_tim(tim)  # default resolver handles did:key
print(result.valid, arky.get_str(tim, "cid"))
```

Run the bundled example: `python examples/quickstart.py`.

## Why not `json`, and why not a crypto library?

**The `json` module cannot produce JCS output.** Each difference below changes
the signed bytes, so none of them is cosmetic:

| Concern | `json` module | Required by RFC 8785 |
| --- | --- | --- |
| Object key order | `sort_keys=True` sorts by code point | sorted by **UTF-16 code units** |
| Numbers | Python `repr` (`1e+20`, `1e-07`, `-0.0`, `42.0`) | **ECMAScript `Number::toString`** |
| Integer range | arbitrary-precision `int` | IEEE-754 double (so `9007199254740993` → `...992`) |
| Non-ASCII | `ensure_ascii=True` escapes it | emitted literally |
| Key order on decode | lost | preserved (the JWS protected header is signed verbatim) |

Python's `repr` disagrees with ECMAScript on **nine of the eighteen** number
edges in the cross-check battery — the largest divergence of any stack here.
`json` also parses `9007199254740993` into an exact `int`, which would
canonicalize losslessly and produce a cid no other implementation agrees with.

**Ed25519 is implemented from RFC 8032 rather than imported.** The other three
stacks are dependency-free, and a *reference* implementation of a signature
protocol should not defer to someone else's reading of it — nor add a
supply-chain surface to a package whose purpose is auditability. It is verified
against the RFC's official test vectors.

The trade-off, stated plainly: this implementation is written for clarity and
auditability, and Python cannot offer real constant-time guarantees. **Signing**
with a long-lived secret in an adversarial, co-located setting should use a
vetted native library. **Verification** — what a receipt consumer actually does —
handles only public data, so the side-channel concern does not apply.

## API

- `generate_keypair()`, `from_seed(seed)`, `did_key_from_public(pub)` — keys + did:key.
- `parse(s)` / `parse_strict(s)` — JSON parsing; `parse_strict` rejects duplicate
  object member names (Canonicalization section 3).
- `canonicalize(v)` — RFC 8785 canonical string.
- `compute_cid(v)`, `cid_from_canonical(s)`, `multihash_mb(b)`, `to_multibase(b)` — content addressing.
- `sign_detached(payload, seed, kid)`, `verify_detached(jws, payload, pub)` — detached JWS.
- `create_tim(body, seed, kid)`, `verify_tim(tim, resolve)`, `verify_tim_at(tim, resolve, at)`,
  `canonical_body(tim)`, `resolve_did_key(id)`, `default_resolver` — TIM.
- `evaluate_kernel(commitment, tims, eval_time)`, `evaluate_assertion(expr, syms)` — Kernel.
- `execute(request, seed, kid, ts, anchor, store)`, `derive_idempotency_key(...)` — Settler.

## Security notes

These mirror the guarantees of the other three stacks; all four are held to them
by a shared adversarial suite (`tests/test_security.py` here).

- **Verification never raises on hostile input.** A malformed identity,
  signature, or witness yields `valid=False`, not an exception — safe to run on
  untrusted TIMs. Non-finite numbers (which JCS forbids) surface as
  `tim.non_finite`.
- **Freshness is opt-in.** `verify_tim` is a pure cryptographic check; use
  `verify_tim_at(tim, resolve, now)` to also reject expired receipts
  (`exp` <= `at` → `tim.expired`).
- **`resolve_did_key` is strict.** It accepts only `did:key:z6Mk...` decoding to
  exactly 34 bytes (`0xed 0x01` + a 32-byte Ed25519 key) and returns `None`
  otherwise, so it never hands back something that is not a key.
- **Non-canonical signatures are rejected.** `S >= L` is refused, which blocks
  trivial Ed25519 malleability.
- **Anti-replay (`nonce`) and causal chains (`prev`, cross-identity) are the
  caller's responsibility.** Single-TIM verification cannot enforce them — they
  need external state.
- **`did:key` keys are resolved from `identity.id`**, so a DID that does not
  match the signing key fails verification (no hardcoded trust).

## Testing

```sh
uv venv && uv pip install pytest ruff
PYTHONPATH=src:tests python -m pytest tests/ -q   # unit + vectors + security
ruff check src tests tools && ruff format --check src tests tools
bash ../../scripts/cross-check.sh                 # byte-identity vs the other stacks
```

The `tools/` drivers (`canon`, `canonjson`, `decide`, `xr`, `parsetime`) exist so
CI can byte-diff this stack's output against the other three.

## Status

Pre-1.0 (`0.1.0`); the five core-loop specs are at `status: implementing` with
L2 conformance coverage (other specs remain `status: review`). Passes the
published vectors at L2 and is cross-checked byte-for-byte against the TS, Rust
and Go stacks.

Note on governance: this is a **reference** implementation by the same authors as
the other three, so per governance section 9.1.7 it does **not** satisfy the
external-implementation requirement for promoting specs to `stable`. Its value is
contradiction-hunting — another clean-room reading of the specs — not quorum.

Fixture keys are TEST KEYS — generate your own with `generate_keypair()`.

Apache-2.0.
