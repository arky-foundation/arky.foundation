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

### 1. Recruit An External Implementer

Per governance §9.1.7, `stable` requires an implementation built outside the
editors' team passing the published vectors. Both reference stacks share
authorship, so they count as one party; the TC vote records the gates, it does
not substitute for them. This is now the top priority — ratification follows
from it.

Definition of done:

- At least one external implementation passes the core-loop vectors against a
  tagged vector release and publishes results per
  `guides/ARKY-CALL-FOR-IMPLEMENTERS-v1.md`.
- The implementation is listed in the public conformance directory (§8).
- The §5 TC vote is then held; minutes are published citing the external
  results plus both reference implementations' artifacts.
- `governance/ARKY-COMPAT-MATRIX-v1.md`, spec front matter, and
  `CONFORMANCE.md` agree on the lifecycle state.

### 2. Bring Non-Core Suites Up To L2 — DONE (vectors release 0.3.0)

Shipped 2026-08-15: Discovery D2 (descriptor crypto incl. tampered-negative,
spec-level compatibility, auth allowlist, policy-binding precedence) and D3
(capability accuracy, health/readiness); Attestations AT2 (AR crypto,
registry-driven freshness, content and key bindings) and AT3 (claims-vs-policy,
registered-type enforcement); new executable policy-packs (P1 validity, P2
most-restrictive-wins merge + forbidden overrides), registries (R1 snapshot
signatures, R2 tamper rejection + URN/CAIP-2 grammar), and errors (E1 envelope
+ retry rules, E2 taxonomy) suites. All run by the check-dispatched executor in
`scripts/verify-artifacts.ts` for positive AND negative expectations, and each
check was corrupt-tested (flip expectation -> verifier fails -> restore).
Operational levels (P3 auditability, E3 transport) are marked future work in
their manifests; non-core specs stay `status: review`,
`ready_for_production: false`.

### 3. Keep Docs And Manifests In Lockstep

Status claims should converge on one story: core-loop implementing and
production-ready by technical bar; non-core review/partial; stable pending an
external implementation (§9.1.7) plus the recorded TC vote.

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
