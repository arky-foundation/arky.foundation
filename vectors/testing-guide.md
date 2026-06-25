# Developer Testing Guide

This guide describes the test commands that exist in this repository today.
Future packaged runners may wrap these checks, but no external `arky-test`
package is required for local conformance work.

## Quick Start

```sh
bun install
bun run validate
bun test
cargo test --manifest-path packages/core-rs/Cargo.toml
```

Use `bun run validate` for repository conformance hygiene:

- JSON syntax across schemas, registries, policies, vectors, and examples.
- Signed artifact and vector verification via `bun run verify`.
- Kernel vector expectations against the Kernel JSON Schema.
- Relative Markdown link checking.

Use `bun test` for the TypeScript reference implementation and `cargo test` for
the Rust reference implementation.

## Current Suite Status

| Suite | Levels covered | Manifest status |
|---|---|---|
| TIM | T1 (7), T2 (4) | `ready_for_production: true` |
| Canonicalization | C1 (6), C2 (7) | `ready_for_production: true` |
| Kernel | K1 (10), K2 (4) | `ready_for_production: true` |
| Notary | N1 (8), N2 (4), N3 (3) | `ready_for_production: true` |
| Settlers | S1 (10), S2 (2), S3 (2) | `ready_for_production: true` |
| Discovery | D1 (6), D2 (1) | `ready_for_production: false` |
| Attestations | AT1 (2) | `ready_for_production: false` |

The five core-loop suites are technically production-ready by vector manifest
and implementation evidence, but their specs remain `status: implementing`
until formal TC ratification to `stable`.

## Running Individual Checks

```sh
# Verify signed artifacts, vectors, algorithmic expectations, and reference path
bun run verify

# Validate Kernel vector schema expectations
bun run validate-kernel

# Check relative Markdown links
bun run check-links

# Generate a results artifact
bun run results
```

`bun run results` writes a `RESULTS.json` artifact under `vectors/` with
implementation metadata, per-case statuses, and totals. Treat it as a
reproducible artifact tied to the commit used for the run.

## What The Verifier Executes

`bun run verify` recomputes or verifies:

- JCS canonical JSON and canonical byte hex for canonicalization vectors.
- CIDs and detached Ed25519 JWS signatures for signed artifacts.
- TIM witness signatures over the same canonical payload as the issuer.
- TIM freshness vectors when `context.verify_options.at` is present.
- Notary Merkle roots, inclusion proofs, finality depth, and reorg behavior.
- Settler idempotency keys, STOP_ON_FAILURE cascades, compensation mapping, and
  XR state transitions.
- End-to-end reference path links from TIM to Notary anchor to Kernel decision
  to Settler receipt.

Negative vectors and pure schema-shape vectors are reported as passing when
they are intentionally delegated to schema validation.

## Testing Another Implementation

An implementation may claim a suite level only if it passes every Foundation
vector for that level and all lower levels in the suite. At minimum, publish:

- Implementation name, version, language, and commit.
- Vector release version and manifest hashes.
- The exact levels claimed.
- A results artifact matching `schemas/testing/results-schema.json`.
- Any deviations or unsupported optional behavior.

For cross-language reference behavior, compare against:

- [`../packages/core`](../packages/core/) for TypeScript.
- [`../packages/core-rs`](../packages/core-rs/) for Rust.
- [`../scripts/cross-check.sh`](../scripts/cross-check.sh) for byte-for-byte
  agreement on canonicalization, timestamps, Kernel decisions, and Settler
  receipts.

## Adding Vectors

- Add the vector under the appropriate suite directory.
- Reference it from `vectors/manifests/<suite>.json`.
- Include fixtures under `vectors/fixtures/` only when they are shared.
- Use test keys only; never commit production credentials, PII, PHI, or real
  account data.
- Update `vectors/RELEASES.json` when publishing a vector release.

## Troubleshooting

- If a vector fails signature or CID checks, recompute the canonical body and
  verify which fields are excluded (`cid`, `sig`, and `time.witnesses` for TIMs).
- If a Kernel vector is `INDETERMINATE`, check whether its evidence comes from
  `context.fixtures.tim` or inline `context.evidence`.
- If a TIM freshness vector behaves unexpectedly, check
  `context.verify_options.at`; freshness is opt-in in the SDK APIs.
- If docs checks fail, run `bun run check-links` and inspect the broken target.
