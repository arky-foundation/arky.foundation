---
spec_id: ARKY-COMPAT-MATRIX-v1
title: Arky — Compatibility Matrix
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true
summary: >
  Defines version compatibility rules across specs, SDKs, registries, schemas,
  and vector suites; sets minimums; and describes deprecation windows and
  migration guidance.
permalink: /governance/ARKY-COMPAT-MATRIX-v1
last_updated: 2025-10-15
---

# Arky — Compatibility Matrix (v1)

## 1. Purpose

Ensure independent implementations interoperate by publishing clear minimum
versions and supported ranges across specs, SDKs, registries, and vectors.

## 2. Principles

- Major versions define compatibility lines (e.g., `ARKY-TIM-v1`).
- Backward‑compatible clarifications do not bump majors.
- Schemas may add optional fields without breaking existing clients.
- Registries are immutable snapshots; breaking entry semantics require `@v<next>`.

## 3. Current Matrix

Concrete state as of vectors release **0.2.0** (`vectors/RELEASES.json`). Specs
are at `status: review`; production claims require ≥2 independent implementations
per `ARKY-GOVERNANCE-v1` §4.

| Component | Spec | Schema `$id` | Executable vector levels |
|---|---|---|---|
| TIM | ARKY‑TIM‑v1 | `…/schemas/core/tim-v1.json` | T1 (7) |
| Canonicalization | ARKY‑TIM‑Canonicalization‑v1 | (covered by tim-v1) | C1 (6) |
| Kernel | ARKY‑KERNEL‑v1 | `…/schemas/core/kernel-v1.json` | K1 (10) |
| Notary | ARKY‑NOTARY‑v1 | `…/schemas/core/anchor-object-v1.json` | N1 (8), N2 (4), N3 (3) |
| Settlers | ARKY‑SETTLERS‑v1 | `…/schemas/core/execution-receipt-v1.json` | S1 (10), S2 (2), S3 (2) |
| Discovery | ARKY‑DISCOVERY‑v1 | `…/schemas/infrastructure/discovery-index-v1.json` | D1 (6), D2 (1) |
| Policy Packs | ARKY‑POLICY‑PACKS‑v1 | `…/schemas/core/policy-pack-v1.json` | (schema-validated) |
| Attestations | ARKY‑ATTESTATION‑v1 | — | AT1 (2) |

- L1 coverage is complete across core specs; L2/L3 is partial (Notary, Settlers).
- An **end-to-end reference path** (`vectors/integration/reference-path/`)
  exercises the full TIM→Notary→Kernel→Settler chain with cryptographic linkage.
- Vectors covering a component at L1 are the minimum; target L2 for production.

## 4. SDK Compatibility

- SDKs advertise supported spec majors and vector levels (L1/L2/L3) per component.
- A client may mix component levels but must not claim a higher overall level
  than the least of its components.

## 5. Deprecation Windows

- Minimum 180 days for widely deployed components; 270 days recommended.
- Security corrections may shorten with PIRT approval.
- Deprecations must include migration notes and links to vectors.

## 6. Publication

- Each release must include: spec versions, registry snapshot IDs/CIDs, schema `$id`s,
  vector release manifest hashes, and migration notes.
- The vector release manifest is `vectors/RELEASES.json` (per-suite levels and
  changelog). Per-suite vector manifests live in `vectors/manifests/*.json`.

## 7. Conformance Claims

- Must cite: spec versions, vector suite/levels with results JSON, repo/commit,
  and any deviations.
- A results artifact conforming to `schemas/testing/results-schema.json` is
  produced by `bun run results` (writes `vectors/RESULTS.json` with impl,
  environment, per-case status, and totals). It is generated, not committed, so
  every claim is reproducible from a clean checkout at a stated commit.