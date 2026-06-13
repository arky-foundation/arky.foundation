---

spec_id: ARKY-COLLECTORS-v1
title: Arky — Collectors
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-ASSERTIONS-v1
  - ARKY-REGISTRIES-v1
  - ARKY-NOTARY-v1
  - ARKY-ERROR-v1
summary: >
  Defines the minimal, deterministic rules for Collectors that acquire signals from
  external systems (sensors, logs, APIs), transform them, and emit signed TIM
  receipts with optional witnessing/anchoring, journaling, and device/host attestation.
links:
  tim: https://arky.foundation/specs/core/ARKY-TIM-v1
  canonicalization: https://arky.foundation/specs/core/ARKY-TIM-Canonicalization-v1
  assertions: https://arky.foundation/specs/core/ARKY-ASSERTIONS-v1
  registries: https://arky.foundation/specs/infrastructure/ARKY-REGISTRIES-v1
  notary: https://arky.foundation/specs/core/ARKY-NOTARY-v1
  errors: https://arky.foundation/specs/core/ARKY-ERROR-v1
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public vectors
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/infrastructure/ARKY-COLLECTORS-v1
last_updated: 2025-10-15

---

# Arky — Collectors (v1)

**All sections are normative unless labeled *Informative*.**

## 1. Scope

Defines the Collector role: acquire external data, apply a declared transform, and emit **TIM Core (v1)** receipts that are verifiable and portable. Out of scope: UI, business policy, and rail execution (settlers).

## 2. Terminology

* **Source:** External system being read (e.g., ROS2 topic, FHIR API, DB log, chain node, IoT device).
* **Collector:** Implementation that reads sources and emits TIM receipts.
* **Transform:** Deterministic mapping from raw inputs to a single `measurement` per receipt.
* **Notary:** Service that witnesses/anchors receipts (per ARKY-NOTARY-v1).

## 3. Collector Configuration

Collectors **MUST** load a signed JSON config (JCS + JWS Ed25519) describing operation:

```
CollectorConfig := {
  config_id: string,                    // required; stable id
  sources: [SourceRef],                 // required; one or more
  transform: TransformDecl,             // required
  tim_defaults: TimDefaults,            // required
  policy?: PolicyDecl,                  // optional; local enforcement
  audit: AuditDecl,                     // required
  sig: string                           // required; JWS over canonical config
}

SourceRef := {
  kind: "ros2"|"fhir"|"dicom"|"db"|"file"|"http"|"chain"|"iot"|"custom",
  locator: string,                      // required; e.g., topic name, URL, DSN
  auth?: object,                        // optional; out of scope semantics
  sampling?: SamplingDecl               // optional
}

SamplingDecl := {
  mode: "event"|"fixed"|"window",       // required
  period_ms?: integer,                  // required if mode="fixed"
  window_ms?: integer,                  // required if mode="window"
  jitter?: boolean                      // optional
}

TransformDecl := {
  method: string,                       // required; human-stable label (alg@version)
  expr?: string,                        // optional; ARKY-ASSERTIONS-v1 expression
  inputs?: { [name: string]: InputBind } // required if expr set
}

InputBind := {
  from: string,                         // required; source field/path
  unit?: string                         // optional; expected unit (arky:unit/* or symbol)
}

TimDefaults := {
  identity_id: string,                  // required; issuer id for TIM.identity.id
  measurement_name: string,             // required
  unit?: string,                        // optional default unit
  code?: string,                        // optional domain code (e.g., loinc:4548-4)
  device?: string                       // optional; device id/class
}

PolicyDecl := {
  require_witnesses?: integer,          // min witness count; default 0
  quarantine_skew?: string,             // ISO 8601 duration; max allowed clock skew
  redact_fields?: [string]              // fields to omit from public sharing
}

AuditDecl := {
  journal: boolean,                     // required; whether to chain via prev
  notary?: string,                      // optional; notary endpoint/urn
  anchor_targets?: [string],            // optional; CAIP-2/log targets
  retention_days: integer               // required; local log retention
}
```

**Rules**

* `CollectorConfig` **MUST** be verifiable before collection starts.
* If `expr` is present, it **MUST** conform to **ARKY-ASSERTIONS-v1** and evaluate deterministically.

## 4. Emission Requirements

For each output receipt, the Collector **MUST**:

1. Construct TIM per **ARKY-TIM-v1** with:

   * `time.ts` (UTC RFC3339).
   * `identity.id = TimDefaults.identity_id`.
   * `measurement.name = TimDefaults.measurement_name`.
   * `measurement.method` including `TransformDecl.method` and relevant source metadata (non-PII).
   * `measurement.value` from the transform; `unit` present if numeric.
   * `measurement.device` if configured; `code` if provided.
2. JCS-canonicalize, compute `cid`, sign `sig` (Ed25519 JWS).
3. If `audit.journal = true`, set `prev` to prior `cid` in the same stream.
4. If `audit.notary` is configured:

   * obtain a witness signature; append to `time.witnesses[]`;
   * if `anchor_targets` present, request anchoring and retain inclusion proofs.
5. Enforce `PolicyDecl`:

   * quarantine if clock skew > `quarantine_skew`;
   * **MUST** redact configured fields before any public distribution;
   * ensure `require_witnesses` met before marking the record “ready”.

## 5. Determinism & Transform Semantics

* Transforms **MUST NOT** perform I/O during evaluation beyond reading declared sources.
* If `expr` is used, inputs **MUST** be bound only from `InputBind` and evaluated per **ARKY-ASSERTIONS-v1** with default `on_missing = indeterminate`.
* Non-expr transforms **MUST** publish their deterministic algorithm identifier in `TransformDecl.method` and are subject to RFC review if standardized.

## 6. Time & Ordering

* `time.ts` **MUST** be derived from a secure clock on the Collector host or source (prefer source-stamped time if trustworthy).
* If the Collector operates offline, it **SHOULD** set `time.ordering.lamport` monotonically.
* When journaling, forks **MUST** be detected and reported (`notary.journal_fork` via ARKY-ERROR-v1) if the same stream produces multiple successors to a `prev`.

## 7. Attestation (Device/Host)

* When available, the Collector **SHOULD** attach device/host attestation material in `identity.proofs[]` (e.g., RAT/TPM/TEE).
* Attestation evidence **MUST NOT** contain secrets or raw keys; only signed claims.

## 8. Privacy & Redaction

* PHI/PII **MUST NOT** be included in public anchors or shared TIM payloads.
* Redaction **MUST** occur before handing receipts to Notary/clients per `PolicyDecl.redact_fields`.
* Hash/token references MAY be used where lineage is required.

## 9. Health, Metrics, and Logs

Collectors **MUST** expose:

* health: `ok|degraded|down`;
* emit counters: receipts_emitted, witnesses_obtained, anchors_finalized, quarantine_count, journal_forks;
* error logs using **ARKY-ERROR-v1** envelopes.

Transport and authentication are deployment-specific.

## 10. Conformance

Levels for Collector implementations:

* **CL1 — Local TIM:** Valid TIM emission (T1/T2), signed, deterministic transform; journaling optional.
* **CL2 — Witnessed:** CL1 + Notary witness integration; policy enforcement; quarantine/skew handling.
* **CL3 — Anchored & Attested:** CL2 + multi-anchor proofs retained; device/host attestation when available; journal fork detection.

An implementation **MAY** claim `ARKY-COLLECTORS-v1 CL1/CL2/CL3` only if it passes Foundation vectors.

## 11. Constraints Table (Informative)

| Area        | MUST                                                     | SHOULD                                     |
| ----------- | -------------------------------------------------------- | ------------------------------------------ |
| Config      | JCS + JWS-signed; deterministic; resolvable sources      | versioned `config_id`                      |
| Emission    | TIM T1/T2; `unit` for numerics; method includes alg id  | journal via `prev`                         |
| Witnessing  | append JWS to `time.witnesses[]` when configured         | multi-anchor via Notary                    |
| Determinism | no side-effects in transform; Assertions if using `expr` | stable algorithm labels                    |
| Time        | secure UTC timestamps                                    | Lamport hints when offline                 |
| Privacy     | no PHI/PII in public anchors; redaction before sharing   | tokenized references                       |
| Attestation | —                                                        | RAT/TPM/TEE proofs in `identity.proofs[]` |
| Errors      | ARKY-ERROR-v1 envelopes                                 | retry hints where appropriate              |

---

## 12. Quick Reference (Informative)

| Phase | Action | Key Fields | Output |
|---|---|---|---|
| **Acquire** | Get signal from external system | `source`, `method`, `device` | Raw data |
| **Transform** | Convert to Arky format | `expr`, `stable_id` | Normalized measurement |
| **Package** | Create TIM receipt | `cid`, `sig`, optional witnesses | Complete TIM |
| **Optional** | Witness/Anchor/Journal | `time.witnesses[]`, anchors | Enhanced TIM |

**Core Flow:**
```
External Signal → Transform → TIM Canonicalization → JWS Signature → (Optional Witness/Anchor)
```

**Required TIM Fields:**
- `time.ts` (RFC3339 UTC)
- `identity.id` (resolvable DID)
- `measurement.name, value, unit, method`
- `cid` (multihash of canonical_bytes)
- `sig` (JWS over canonical_bytes)

**Method Examples:** see [Collector Method Types](../../examples/infrastructure/collectors/method-types.md) for complete examples of sensor, API, and log collectors with full TIM receipts.

## 13. Versioning & Governance

* **Spec ID:** `ARKY-COLLECTORS-v1`.
* Additions are additive; breaking changes require `-v2` and updated vectors.