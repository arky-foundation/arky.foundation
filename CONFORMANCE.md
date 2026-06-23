# Conformance

How to validate the Arky repository, and exactly what each check proves. This
is the practical companion to "Vectors over vibes" (see `Mission.md`).

> **Maturity:** the five **core-loop** specs (TIM, Canonicalization, Kernel,
> Notary, Settlers) are at `status: implementing` with L2 vector coverage and
> `ready_for_production: true` manifests; the remaining specs stay at
> `status: review`. Per `governance/ARKY-GOVERNANCE-v1.md` §4, a spec is
> **Stable** only once vectors are published **and ≥2 independent
> implementations pass** — both now hold for the core loop (`@arky/core` TS and
> `arky-core` Rust pass at L2 and are cross-checked byte-for-byte), but the
> formal TC ratification to **Stable** is still pending, so the core specs are
> labelled `implementing` rather than `stable`. The tooling in `scripts/` is
> maintenance and conformance tooling, **not** a third reference implementation.

## Run everything

```sh
bun install
bun run validate
```

`bun run validate` runs all local checks and exits non-zero if any fails:

| Step | Command | What it proves |
|---|---|---|
| JSON syntax | (built into `validate`) | Every `.json` under schemas/registries/policies/vectors/examples parses. |
| Conformance verifier | `bun run verify` | Recomputes cids, verifies signatures + witnesses, and executes algorithmic vectors (below). |
| Kernel vs schema | `bun run validate-kernel` | Each Kernel vector's `schema_valid` expectation matches AJV. |
| Link checker | `bun run check-links` | Every relative link in the docs resolves. |

Schema (AJV) validation of every artifact type runs in CI
(`.github/workflows/validate-schemas.yaml`); it needs the `ajv-cli` dev
dependency and is not part of `validate`.

## What the verifier executes

`bun run verify` does more than schema-shape checking — it **recomputes**
results from inputs and compares them to each vector's `expect` block. Of the
current checks, roughly 45 are actively executed crypto/algorithm checks; the
rest are negative vectors or pure schema-shape vectors deferred to the AJV step.

**Cryptographic checks**
- **cid** = `multibase(multihash(sha2-256, JCS(body)))`, recomputed and compared
  (TIM, Kernel, execution receipts, service descriptors, discovery indexes).
  Artifacts that are signed but not content-addressed (registries, policy packs,
  revocation lists) are verified signature-only.
- **Signatures**: detached-payload JWS Ed25519 (RFC 7797, `b64:false`) over the
  canonical body (which excludes `cid`, `sig`, and `time.witnesses`).
- **Witnesses**: each `time.witnesses[]` entry is verified as a detached JWS over
  the same canonical bytes, against its `kid`-resolved key.

**Algorithmic checks** (recomputed via `scripts/lib/merkle.ts`)
- **Canonicalization (C1)**: JCS canonical bytes recomputed and compared to
  `canonical_json` / `canonical_bytes_hex`.
- **Notary Merkle (N2)**: Merkle root over a cid set (profile `merkle-sha256-v1`,
  bytewise sort, odd-count last-leaf duplication) and inclusion-proof
  verification (§5.1/§5.2), including a negative bad-proof case.
- **Notary finality (N3)**: depth = max(registry, policy floor, request override)
  (§4.4); the negative case where an override below the policy floor is a
  `notary.policy_violation`; and reorg remediation (depth < finality →
  `reorged` + re-anchor; depth ≥ finality → `finality_violated`, no re-anchor).
- **Settler (S2/S3)**: idempotency-key derivation (§6.1), the STOP_ON_FAILURE
  failure cascade / skipped verbs (§4.1), the compensation verb map (§7.2), and
  the XR state-machine transitions including window/rail-capability edges (§5.2).

Vectors whose `expect.valid` is `false`, or that assert only schema/structure
(e.g. JWKS shape, service-list counts), are validated by the AJV schema step,
not re-executed here.

## End-to-end reference path

`vectors/integration/reference-path/` is one fully-materialized vertical —
TIM → Notary anchor → Kernel decision → Settler XR — where every artifact is
really signed and references the previous by its real `cid`. The verifier walks
it: each artifact's cid/sig/witness verifies against its `kid`-resolved key, and
every cross-link in `chain.json` must resolve to the referenced artifact's real
cid. Tampering any reference fails on both the signature and the linkage check.
Regenerate with `bun run gen-reference-path` (deterministic); see that folder's
README for the scenario and content IDs.

## Conformance levels (from the specs)

| Suite | Levels | Executable vectors today |
|---|---|---|
| TIM Canonicalization | C1 canonicalize, C2 hash+sign, C3 cross-verify | C1 (6) |
| TIM | T1 verify, T2 completeness, T3 witnessed | T1 + witness fixture |
| Kernel | K1 eval, K2 policy-aware, K3 orchestrated | K1 |
| Notary | N1 witness, N2 anchor, N3 multi-anchor/DTN | N1 + N2 (Merkle/inclusion) + N3 (finality depth) |
| Settlers | 1 basic, 2 anchored, 3 multi-rail | S1 + S2 (idempotency/cascade) + S3 (compensation/transitions) |

A product **MAY** claim a level only if it passes the Foundation vectors for
that level. Empty levels in the manifests (`coverage: 0`) are future work.

## Regenerating signed test artifacts

Test artifacts are signed with the fixture keys in `vectors/fixtures/keys/`
(**test keys only — never production**). To re-sign after editing an artifact's
body:

```sh
bun run sign
```

The signer is idempotent: it only touches artifacts whose `sig`/`cid` is a
placeholder or stale, and regenerates witness signatures over the corrected
canonical bytes.
