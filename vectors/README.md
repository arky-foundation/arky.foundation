# Arky Test Vectors

Standardized test cases for validating implementations against the Arky
specifications. The authoritative suite metadata lives in
[`manifests/`](manifests/) and the release summary lives in
[`RELEASES.json`](RELEASES.json).

## Current Status

Current vector release: **0.2.0** (2026-06-15).

The five core-loop suites (TIM, Canonicalization, Kernel, Notary, Settlers) have
L2-or-better coverage in their manifests and pass on both reference
implementations: [`@arky/core`](../packages/core/) and
[`arky-core`](../packages/core-rs/). They are `core_production_ready`, but the
overall vector set is not production-ready because non-core suites remain
partial.

| Suite | Spec | L1 | L2 | L3 | Total | Status |
|---|---|---:|---:|---:|---:|---|
| TIM | ARKY-TIM-v1 | 7 | 4 | 0 | 11 | core ready |
| Canonicalization | ARKY-TIM-Canonicalization-v1 | 6 | 7 | 0 | 13 | core ready |
| Kernel | ARKY-KERNEL-v1 | 10 | 4 | 0 | 14 | core ready |
| Notary | ARKY-NOTARY-v1 | 8 | 4 | 3 | 15 | core ready |
| Settlers | ARKY-SETTLERS-v1 | 10 | 2 | 2 | 14 | core ready |
| Discovery | ARKY-DISCOVERY-v1 | 6 | 1 | 0 | 7 | partial |
| Attestations | ARKY-ATTESTATIONS-v1 | 2 | 0 | 0 | 2 | basic |
| **Total** | | **49** | **22** | **5** | **76** | |

See [`../CONFORMANCE.md`](../CONFORMANCE.md) and
[`../governance/ARKY-COMPAT-MATRIX-v1.md`](../governance/ARKY-COMPAT-MATRIX-v1.md)
for the exact maturity and implementation claims.

## Quick Links

- Testing guide: [`testing-guide.md`](testing-guide.md)
- Releases index: [`RELEASES.json`](RELEASES.json)
- TIM manifest: [`manifests/tim.json`](manifests/tim.json)
- Canonicalization manifest: [`manifests/canonicalization.json`](manifests/canonicalization.json)
- Kernel manifest: [`manifests/kernel.json`](manifests/kernel.json)
- Notary manifest: [`manifests/notary.json`](manifests/notary.json)
- Settlers manifest: [`manifests/settlers.json`](manifests/settlers.json)
- Discovery manifest: [`manifests/discovery.json`](manifests/discovery.json)
- Attestations manifest: [`manifests/attestations.json`](manifests/attestations.json)

## Layout

```text
vectors/
  manifests/          # Suite manifests and readiness flags
  fixtures/           # Shared test data
    keys/             # Ed25519 test keys
    tims/             # Sample TIM objects
    rails/            # Mock rail configurations
    accounts/         # Test accounts
  tim/                # TIM vectors (T1/T2/T3)
  canonicalization/   # Canonicalization vectors (C1/C2/C3)
  kernel/             # Kernel vectors (K1/K2/K3)
  notary/             # Notary vectors (N1/N2/N3)
  settlers/           # Settler vectors (S1/S2/S3)
  discovery/          # Discovery vectors (D1/D2/D3)
  attest/             # Attestation vectors (AT1/AT2/AT3)
  integration/        # End-to-end flows and reference path
  RESULTS.json        # Example/generated conformance result artifact
  RELEASES.json       # Suite release tracking
```

## Running Local Checks

```sh
bun install
bun run validate
bun test
cargo test --manifest-path packages/core-rs/Cargo.toml
```

`bun run validate` runs JSON parsing, signed artifact/vector verification,
Kernel schema checks, and link checking. `bun test` exercises the TypeScript
reference implementation against the vectors. The Rust command exercises the
second independent implementation.

For just the vector/artifact verifier:

```sh
bun run verify
```

## Test Vector Format

All vectors follow `ARKY-VECTORS-v1`:

```json
{
  "id": "t1-001",
  "spec": "ARKY-TIM-v1",
  "level": "T1",
  "description": "Valid minimal TIM with all required fields",
  "context": {
    "time": "2025-10-15T12:00:00Z",
    "fixtures": {
      "signing_key": "fixtures/keys/ed25519-test-01.json"
    }
  },
  "inputs": {},
  "expect": {
    "valid": true,
    "errors": []
  }
}
```

## Reference Implementations

- [`packages/core`](../packages/core/) - `@arky/core` TypeScript.
- [`packages/core-rs`](../packages/core-rs/) - `arky-core` Rust.

The cross-language check in [`../scripts/cross-check.sh`](../scripts/cross-check.sh)
compares canonical bytes, CIDs, timestamp parsing, kernel decisions, and
execution receipts.

## Contributing

- Add vectors under the appropriate suite directory.
- Reference new vectors in the corresponding manifest under `manifests/`.
- Update `RELEASES.json` when publishing a vector release.
- Keep fixture keys under `fixtures/keys/` as test keys only.
- Format and requirements are defined in
  [`../specs/development/ARKY-VECTORS-v1.md`](../specs/development/ARKY-VECTORS-v1.md).
