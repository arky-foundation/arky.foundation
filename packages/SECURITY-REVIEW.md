# Adversarial Security Review — @arky/core & arky-core

A deliberate hostile pass over the reference implementations (TS + Rust),
covering the trust-critical surface: signatures, canonicalization, key
resolution, freshness/replay, and the action/money-authorizing layers (Kernel,
Settler). Every issue below is fixed and has a regression test; the "what held"
section records attacks that were correctly already blocked.

Scope: the SDKs in `packages/`. Out of scope: the live-rail / notary network
behaviors (no running services), and deployment concerns (TLS, key storage).

## Findings (fixed)

### 1. Cross-language canonicalization divergence on exponent/precision numbers — High
`format!("{}", f)` in the Rust canonicalizer is **not** RFC 8785. Numbers needing
exponent notation diverged from the TS stack and from the spec:
`1e21` → TS `1e+21` vs Rust `1000000000000000000000`; `1e-7` → `1e-7` vs
`0.0000001`; `9007199254740993` kept as the exact int instead of the f64
collapse. **A TIM with such a value signed by one stack would be rejected by the
other** (different bytes → different cid/signature). Invisible to the fixtures,
which only use simple values like `22.5`.
**Fix:** implemented ECMAScript `Number::toString` (the RFC 8785 reference) in
Rust, routing all numbers through f64; enabled serde_json `arbitrary_precision`
so the formatter sees the true lexical input. 18/18 number edges now match;
`cross-check.sh` enforces a number battery in CI. (commit `616d523`)

### 2. Verifier DoS on malformed `did:key` — Medium
`verifyTim` with the default resolver **threw** on a malformed `did:key` (e.g.
invalid base58 `did:key:z6Mk0OIl`), crashing a verifier processing untrusted
TIMs. **Fix:** `resolveDidKey` now catches and returns `undefined` (and rejects
wrong-length keys); `verifyTim` never throws on any malformed input. Rust already
handled this via `Result`. (commit `fbec1e6`)

### 3. Expired receipts accepted — Medium
`verifyTim` ignored `exp`, so a TIM expired years ago verified as `valid:true`,
contrary to TIM §4. **Fix:** opt-in freshness — `verifyTim(tim, resolve, { at })`
rejects `exp ≤ at` with `tim.expired` (new `fresh` field). Default remains a pure
cryptographic check. (commit `fbec1e6`)

### 4. Settler authorized invalid amounts — High
The Settler authorized pays with **negative, zero, or malformed amounts** — it
checked that required arg keys were present, never their values. `pay
{value:-1000}` and `pay {value:100}` (no unit) both returned SUCCESS, in both
stacks. **Fix:** amount validation per §3.2 in TS and Rust — a present `amount`
MUST be `{ value: number > 0 (finite), unit: string }`. (commit `10460ca`)

### 5. `did:key` resolution contract diverged between the stacks — Low
`resolve_did_key` (Rust) accepted any `did:key:z…` whose decoded bytes merely
*started* with the Ed25519 multicodec `0xed 0x01`, with no length check, so a
short payload such as `did:key:z332DkP4ju` returned a 4-byte "public key" where
`@arky/core` returned `undefined`. **Not exploitable** — `verifying_key_from_bytes`
requires exactly 32 bytes, so such a TIM still failed closed with
`tim.key_unresolved`, and no forgery was possible. But the two stacks disagreed on
an API's return value, which is precisely the class of drift the second
implementation exists to catch, and a caller using `resolve_did_key` directly
would have seen a `Some(...)` that is not a key.
**Fix:** Rust now requires the literal `did:key:z6Mk` prefix and a decoded length
of exactly 34 bytes, matching `@arky/core` byte for byte.

## What held (correctly blocked, now under regression test)

- Signature forgery: mutated body with original cid/sig; mutated body + fixed
  cid but stale sig; **attacker re-signs with their own key while claiming the
  victim's DID** (blocked — the did:key resolves to the victim's key); swapping
  `identity.id` to the attacker while keeping the victim's signature.
- `alg:none` downgrade (the verifier requires EdDSA); empty/stripped signatures.
- Forged witnesses when the resolver doesn't know the attacker's key.
- Malformed base58 in cids/DIDs (invalid chars rejected; wrong multicodec/length
  → safe `undefined`).
- Kernel never authorizes on missing or INDETERMINATE evidence (no fall-through
  to APPROVE); unregistered verbs → REJECTED.

## Known limitations (caller's responsibility, documented)

- **Anti-replay (`nonce`)** and **causal-chain (`prev`, cross-identity)**
  enforcement require external state (a seen-nonce store, the prior chain) and
  cannot be done by single-TIM verification. Callers must track accepted nonces
  and validate `prev` against a chain they hold. See `packages/core/README.md`.
- JSON **duplicate member names**: the spec (Canonicalization §3) says these MUST
  be rejected, but `JSON.parse`/`serde_json` silently keep the last. Both stacks
  now ship an **opt-in strict parser** — `parseStrict(json)` (`@arky/core`) and
  `parse_strict(json)` (`arky-core`) — that rejects any object with a duplicate
  key at any depth. Callers handling untrusted JSON should parse through it before
  canonicalizing/verifying. (The default `JSON.parse`/`serde_json` path is
  unchanged and still last-wins; this does not affect signature soundness for
  objects produced by these libraries.)

## Regression coverage

All three stacks now carry a mirrored adversarial suite, so the *failure*
behaviour is pinned on each side rather than only on the TS one:

- `packages/core/test/security.test.ts` (26 cases, TS)
- `packages/core-rs/tests/security.rs` (19 cases, Rust) — the same forgery,
  downgrade, malformed-input, freshness, Settler-amount, and Kernel-evidence
  attacks, plus the `did:key` length/prefix contract from finding 5.
- `packages/core-go/security_test.go` (Go) — the same attack set again, plus
  JWS-shape rejections and an enumeration showing that for Ed25519 did:keys the
  `z6Mk` prefix check already implies the 34-byte length check.

The Rust and Go suites additionally lock the RFC 8785 number forms and amount
validation. CI runs all three suites plus the cross-language `cross-check.sh`.

Each new assertion was negative-tested (break the guard → the test must fail →
restore), so the suite is known to have teeth rather than rubber-stamping. The
Go suite was additionally mutation-tested against eight independent defects
(signature check bypassed, `Valid` ignoring cid/witness/freshness, the did:key
prefix loosened, amount and verb-registry checks removed in both the Settler and
the Kernel, UTF-8 key ordering, and the public-key size check dropped); every one
was caught. That exercise corrected a test whose name claimed the 34-byte length
check was load-bearing when the prefix check was in fact rejecting those inputs
first.
