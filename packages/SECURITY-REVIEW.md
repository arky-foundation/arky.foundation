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
  be rejected, but `JSON.parse`/`serde_json` silently keep the last. Parsing
  hardening (a strict reader that rejects duplicates) is left as future work; it
  does not affect signature soundness for objects produced by these libraries.

## Regression coverage

`packages/core/test/security.test.ts` (26 cases) exercises every finding and the
"what held" attacks; the Rust crate's unit tests lock the RFC 8785 number forms
and amount validation. CI runs both suites plus the cross-language `cross-check.sh`.
