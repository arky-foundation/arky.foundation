# Arky Development Next Steps

This document tracks practical work that remains after the current conformance
baseline. It is intentionally subordinate to `CONFORMANCE.md`,
`governance/ARKY-COMPAT-MATRIX-v1.md`, and `vectors/RELEASES.json`.

## Current Read

The core accountability loop is mechanically healthy:

- TIM, Canonicalization, Kernel, Notary, and Settlers are at
  `status: implementing`.
- Their vector manifests are `ready_for_production: true` with L2-or-better
  coverage.
- `@arky/core` and `arky-core` both pass the vectors and are cross-checked
  byte-for-byte.
- `bun run validate`, `bun test`, and the Rust crate tests pass locally.

The core-loop specs are not yet labelled `stable` because formal TC
ratification is still pending. Non-core suites such as Discovery, Attestations,
Policy Packs, Registries, Errors, and SDK guidance remain at `status: review`
or partial vector coverage.

## Development Priorities

### 1. Ratify The Core Loop

Complete the governance step that moves the five core-loop specs from
`implementing` to `stable`.

Definition of done:

- TC vote minutes are published.
- `governance/ARKY-COMPAT-MATRIX-v1.md`, spec front matter, and
  `CONFORMANCE.md` agree on the lifecycle state.
- Any stable claim cites vector release `0.2.0` or later plus results artifacts
  for both reference implementations.

### 2. Bring Non-Core Suites Up To L2

Discovery and Attestations have partial/basic coverage. Policy Packs,
Registries, Errors, SDK, and related specs need executable vectors or a clear
statement that they are schema/prose-only for now.

Definition of done:

- Discovery has D2/D3 descriptor, compatibility, and negative vectors.
- Attestations have AT2/AT3 chain, binding, freshness, policy, and error
  vectors.
- Policy/Registry/Error vectors cover the claims made in their specs.
- Non-core manifests either have nonzero coverage for advertised levels or mark
  the levels as future work.

### 3. Keep Docs And Manifests In Lockstep

Status claims should converge on one story: core-loop implementing and
production-ready by technical bar; non-core review/partial; stable pending TC.

Definition of done:

- `README.md`, package READMEs, `vectors/README.md`, `CONFORMANCE.md`,
  `vectors/RELEASES.json`, and the compatibility matrix agree.
- Schema version language avoids implying spec lifecycle `stable`.
- Every status table is generated or easy to audit from manifests.

### 4. Improve Release Automation

Reduce manual drift between vector files, manifests, release metadata, and
result artifacts.

Definition of done:

- A release script recomputes per-suite vector counts and updates
  `vectors/RELEASES.json`.
- `bun run results` is run as part of release preparation.
- CI fails if manifest counts, README tables, or release summaries disagree.

### 5. Build External Runner Guidance Carefully

The repo has local verifiers and reference implementation tests. A packaged
external `arky-test` runner is not part of this repository today.

Definition of done:

- `vectors/testing-guide.md` distinguishes current local commands from proposed
  third-party runner interfaces.
- Any published runner name maps to an actual package, repository, and support
  policy.

## Validation Commands

Run these locally before proposing changes:

```sh
bun install
bun run validate
bun test
cargo test --manifest-path packages/core-rs/Cargo.toml
git diff --check
```

For a narrower conformance pass:

```sh
bun run verify
bun run check-links
```
