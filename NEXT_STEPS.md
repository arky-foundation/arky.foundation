# Arky Development Next Steps

This document tracks practical work that remains after the current conformance
baseline. It is intentionally subordinate to `CONFORMANCE.md`,
`governance/ARKY-COMPAT-MATRIX-v1.md`, and `vectors/RELEASES.json`.

## Current Read

The protocol surface is mechanically healthy:

- The five core-loop specs (TIM, Canonicalization, Kernel, Notary, Settlers)
  are at `status: implementing` with `ready_for_production: true` manifests at
  L2-or-better coverage.
- `@arky/core` (TypeScript) and `arky-core` (Rust) both pass the vectors and
  are cross-checked byte-for-byte in CI.
- Non-core suites (Discovery, Attestations, Policy Packs, Registries, Errors)
  carry executable vectors run by the verifier; their specs remain
  `status: review` and their manifests `ready_for_production: false`.
- Count consistency across manifests, `RELEASES.json`, and every prose table
  is CI-enforced by `bun run release-check`.

Promotion of the core loop to `stable` is gated on one thing: an external
implementation (governance §9.1.7), followed by the recorded TC vote.

## Development Priorities

### 1. Recruit An External Implementer

Per governance §9.1.7, `stable` requires an implementation built outside the
editors' team passing the published vectors. Both reference stacks share
authorship, so they count as one party; the TC vote records the gates, it does
not substitute for them. This is the top priority — ratification follows from
it.

Definition of done:

- At least one external implementation passes the core-loop vectors against a
  tagged vector release and publishes results per
  `guides/ARKY-CALL-FOR-IMPLEMENTERS-v1.md`.
- The implementation is listed in the public conformance directory (§8).
- The §5 TC vote is then held; minutes are published citing the external
  results plus the reference implementations' artifacts.
- `governance/ARKY-COMPAT-MATRIX-v1.md`, spec front matter, and
  `CONFORMANCE.md` agree on the lifecycle state.

### 2. Build External Runner Guidance Carefully

The repo has local verifiers and reference implementation tests. A packaged
external `arky-test` runner is not part of this repository today.

Definition of done:

- `vectors/testing-guide.md` distinguishes current local commands from proposed
  third-party runner interfaces (it does today; keep it true).
- Any published runner name maps to an actual package, repository, and support
  policy.

## Standing Invariants

Enforced continuously, not tracked as tasks:

- **Status lockstep** — `README.md`, package READMEs, `vectors/README.md`,
  `CONFORMANCE.md`, `vectors/RELEASES.json`, and the compatibility matrix tell
  one story: core loop implementing and production-ready by technical bar;
  non-core review; `stable` pending an external implementation plus the TC
  vote. Vector counts in all of these are gated by `bun run release-check`.
- **Vectors over vibes** — new behavioral claims ship with executable vectors,
  and new verifier checks are negative-tested (corrupt the expectation, watch
  it fail, restore).

## Completed

- **Non-core suites to L2** (2026-08-15, vectors release 0.3.0): executable
  Discovery D2/D3, Attestations AT2/AT3, and new policy-packs, registries, and
  errors suites — 34 vectors run by the verifier's check-dispatched executor
  for positive and negative expectations. Operational levels (P3, E3) are
  marked future work in their manifests.
- **Release automation** (2026-08-15): `scripts/release-check.ts` recounts
  vectors from disk and fails CI on drift across manifests, `RELEASES.json`,
  and every prose count surface; `--write` regenerates the machine-owned
  files. It caught a real README total drift on its first run.

## Validation Commands

Run these locally before proposing changes:

```sh
bun install
bun run validate      # syntax, verifier (+results), kernel-vs-schema, links, counts
bun test              # TypeScript reference implementation
cargo test --manifest-path packages/core-rs/Cargo.toml
git diff --check
```

For a narrower pass:

```sh
bun run verify         # conformance verifier only
bun run release-check  # count-consistency gate only (--write to regenerate)
bun run check-links
```
