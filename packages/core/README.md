# @arky/core

Reference TypeScript implementation of **Arky TIM** — produce and verify
**T**ime-**I**dentity-**M**easurement receipts: signed, content-addressed
evidence records. Implements JCS canonicalization (RFC 8785), content addressing
(multihash sha2-256 + base58btc multibase), detached-payload Ed25519 JWS
(RFC 7797), witnessing, and Kernel/Settler evaluation.

Built clean-room from the [Arky specs](../../specs/core/ARKY-TIM-v1.md). It
passes the Foundation's conformance vectors and produces **byte-identical**
output to the Rust implementation (`arky-core`) — see the cross-language check
in CI.

## Install

```sh
bun add @arky/core      # or: npm install @arky/core
```

Requires `@noble/curves` and `@noble/hashes` (declared as dependencies).

## Quickstart

```ts
import { generateKeyPair, createTim, verifyTim } from '@arky/core';

// A keypair whose did:key matches the signing key (so identity.id resolves
// to the key that signs — no DID/key mismatch).
const issuer = generateKeyPair();

// Produce a signed, content-addressed TIM.
const tim = createTim(
  {
    ts: '2025-10-15T12:00:00Z',
    identity: { id: issuer.did },
    measurement: {
      name: 'temperature',
      value: 22.5,
      unit: 'degC',
      method: { type: 'sensor', source: 'device:datacenter-temp-01' },
    },
  },
  issuer.privateKey,
);

// Verify it. For a did:key identity the verifying key is resolved
// automatically from identity.id.
verifyTim(tim).valid; // true
console.log(tim.cid);  // zQm…
```

See [`examples/quickstart.ts`](./examples/quickstart.ts) for the full flow
including witnessing. Run it with `bun run examples/quickstart.ts`.

## API

**Keys**
- `generateKeyPair(): KeyPair` — fresh Ed25519 key + matching `did:key`.
- `fromSeed(seed: Uint8Array): KeyPair` — keypair from a 32-byte seed.
- `didKeyFromPublicKey(pub: Uint8Array): string`.

**TIM**
- `createTim(input, privateKey, kid?): Tim` — build + sign a TIM.
- `verifyTim(tim, resolveKey?): VerifyResult` — verify cid, signature, and any
  witnesses. `resolveKey` defaults to resolving `did:key` identities; pass your
  own to resolve other identity methods or witness keys.
- `canonicalize`, `canonicalBody`, `computeCid`, `signDetached`,
  `verifyDetached`, `resolveDidKey` — the lower-level primitives.

**Kernel** — `evaluateKernel(commitment, tims, opts?): Decision`, plus
`evaluateAssertion` (the tri-valued assertion language).

**Settler** — `execute(request, opts): ExecuteResult`, plus `deriveIdempotencyKey`.

## Security notes

- **Verification never throws on hostile input.** A malformed identity,
  signature, or witness yields `{ valid: false }`, not an exception — safe to
  run on untrusted TIMs.
- **Freshness is opt-in.** `verifyTim(tim)` is a pure cryptographic check.
  Pass `verifyTim(tim, resolveKey, { at })` with the current time to also reject
  expired receipts (`exp` ≤ `at` → `tim.expired`).
- **Anti-replay (`nonce`) and causal chains (`prev`, cross-identity) are the
  caller's responsibility.** Single-TIM verification cannot enforce them — they
  need external state (a seen-nonce store, the prior chain). Track `nonce`
  values you have accepted, and validate `prev` against a chain you hold.
- **`did:key` keys are resolved from `identity.id`**, so a DID that does not
  match the signing key fails verification (no hardcoded trust).

## Status

Pre-1.0 (`v0.1.0`). The Arky specs are at `status: review`. This library passes
the published conformance vectors and is cross-checked byte-for-byte against the
Rust stack, but the protocol is not yet declared stable. See the repository
[`CONFORMANCE.md`](../../CONFORMANCE.md).

**The fixture keys under `vectors/fixtures/keys/` are TEST KEYS — never use them
in production.** Generate your own with `generateKeyPair()`.

## License

Apache-2.0.
