---

spec_id: ARKY-CALL-FOR-IMPLEMENTERS-v1
title: Arky - Call for Implementers
version: v1
status: review
effective: 2026-08-14
doc_type: guide
normative_default: false  # Informative document
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-KERNEL-v1
  - ARKY-SETTLERS-v1
  - ARKY-VECTORS-v1
summary: >
  The core loop will not be promoted to stable until an implementation built
  outside the editors' team passes the published vectors. This guide is the
  on-ramp: scope tiers, exact commands, and how to submit results.
governance:
  owner: Arky Foundation Technical Council
  process: Maintained alongside specs; additive updates via RFC
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /guides/ARKY-CALL-FOR-IMPLEMENTERS-v1
last_updated: 2026-08-14
---

# Arky - Call for Implementers

Arky's governance (ARKY-GOVERNANCE-v1 §9.1.7) makes a deliberate commitment:
**the core specs stay `implementing` until someone we do not control passes
the vectors.** The four reference stacks (Rust, Python, Go and TypeScript)
share authorship, so they count as one party. The bar for
`stable` is an external, independent implementation - and this guide exists to
make building one as cheap as possible.

## Why implement

- **The vectors are the contract.** Conformance is pass/fail against
  executable, negative-tested vectors - no certification fee, no membership,
  no interpretation disputes.
- **You get listed.** Passing implementations are cited in the public
  conformance directory (§8) and in the promotion record when the specs go
  stable.
- **The specs are small.** The full core loop is five specs; four independent
  stacks already reproduce every artifact byte-for-byte, so ambiguities have
  been burned out by construction. Where you find one anyway, that is a spec
  bug - report it and it gets fixed by RFC.
- **Pick the closest reference.** Whatever your language, one of the four
  existing stacks is probably near it: Rust, Python, Go, or TypeScript. Each is
  Apache-2.0 and written clean-room from the specs, so it reads as a worked
  example rather than a framework to copy.

## Scope tiers

Pick the smallest tier that interests you; each is independently listable.

| Tier | What you build | Vectors | Rough effort |
| --- | --- | --- | --- |
| **Verifier** | Canonicalize (RFC 8785), compute cids, verify Ed25519 detached JWS + witnesses | C1, C2, T1, T2 | A focused weekend |
| **Producer** | Tier 1 + create signed TIMs (keys, did:key, witnessing) | C1-C2, T1-T2 round-trip | + a few days |
| **Full loop** | Tier 2 + Kernel evaluation (tri-state assertions, windows) + Settler execution (idempotency, XR) | + K1, K2, S1 | + one to two weeks |

Any language counts. A third language (Go, Python, Swift, Zig...) is the most
valuable contribution; an independent team re-implementing in TS or Rust also
satisfies the governance gate.

## The loop you are implementing

```
TIM (signed evidence) -> Notary (witness/order) -> Kernel (deterministic
decision) -> Settler (execute verb) -> XR (signed receipt)
```

Normative sources, in reading order:

1. `specs/core/ARKY-TIM-Canonicalization-v1.md` - JCS canonical bytes, cid
2. `specs/core/ARKY-TIM-v1.md` - the evidence record, signing, witnessing
3. `specs/core/ARKY-KERNEL-v1.md` - commitments, assertions, decisions
4. `specs/core/ARKY-SETTLERS-v1.md` - verbs, execution, receipts, idempotency
5. `specs/development/ARKY-VECTORS-v1.md` - vector format and levels

The reference implementations (`packages/core`, `packages/core-rs`) are
Apache-2.0 and readable in an afternoon - but a clean-room build from the
specs is more valuable, because divergence is signal.

## Running the vectors

Vectors are plain JSON under `vectors/<suite>/`, each with an `expect` block.
Your runner loads a vector, performs the operation, and compares.

```sh
git clone https://github.com/arky-foundation/arky.foundation
ls vectors/                 # suites + manifest.json per suite
cat vectors/tim/t1-001.json
```

To sanity-check your environment against the reference tooling:

```sh
bun install
bun run validate            # full conformance pass, must be green at HEAD
```

Pin your claim to a tagged vector release (see `vectors/RELEASES.json`), not
to a moving branch.

## Submitting results

Open a PR or issue containing:

1. **Repository link** and commit hash of your implementation.
2. **Results artifact** - per-vector pass/fail JSON (shape of
   `vectors/RESULTS.json` is a good template), plus the vector release you ran
   against.
3. **Independence statement** - who built it and any relationship to the
   Foundation's editors (§9.1.7 requires none).
4. **Divergence notes** - anything the specs left ambiguous, even if you
   resolved it correctly. Ambiguity reports are as valuable as passing runs.

The Foundation verifies by re-running your runner where practical, lists the
implementation in the conformance directory, and - once at least one external
full-loop implementation passes - initiates the §5 vote to promote the core
specs to `stable`, citing your results in the promotion record.

## Contact

Open an issue on the repository, or write to the address in `SECURITY.md` for
anything sensitive.
