---
spec_id: ARKY-COMPAT-MATRIX-v1
title: Arky — Compatibility Matrix
version: v1
status: stable
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

## 3. Minimums (Example)

- TIM: ARKY‑TIM‑v1
- Canonicalization: ARKY‑TIM‑Canonicalization‑v1
- Discovery: ARKY‑DISCOVERY‑v1
- Notary: ARKY‑NOTARY‑v1
- Settlers: ARKY‑SETTLERS‑v1
- Vectors: Suites covering the above at L1 minimum; target L2 for production.

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

## 7. Conformance Claims

- Must cite: spec versions, vector suite/levels with results JSON, repo/commit,
  and any deviations.