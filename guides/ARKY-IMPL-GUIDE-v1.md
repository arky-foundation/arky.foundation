---

spec_id: ARKY-IMPLEMENTER-GUIDE-v1
title: Arky - Implementers' Guide
version: v1
status: review
effective: 2025-10-15
doc_type: guide
normative_default: false  # this guide is Informative; specs remain the source of truth
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-NOTARY-v1
  - ARKY-SETTLERS-v1
  - ARKY-REGISTRIES-v1
  - ARKY-POLICY-PACKS-v1
  - ARKY-DISCOVERY-v1
  - ARKY-ERRORS-v1
  - ARKY-VECTORS-v1
  - ARKY-SECURITY-BPR-v1
summary: >
  Role-based checklists to implement Arky components, bind Policy Packs,
  expose Discovery metadata, and pass conformance vectors before claiming
  compliance. No examples - just steps, gates, and artifacts.
links:
  specs: [https://arky.foundation/specs/](https://arky.foundation/specs/)
  schemas: [https://arky.foundation/schemas/](https://arky.foundation/schemas/)
  vectors: [https://arky.foundation/vectors/](https://arky.foundation/vectors/)
  registries: [https://arky.foundation/registries/](https://arky.foundation/registries/)
  rfcs: [https://arky.foundation/rfcs/](https://arky.foundation/rfcs/)
governance:
  owner: Arky Foundation Technical Council
  process: Maintained alongside specs; additive updates via RFC
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /guides/ARKY-IMPLEMENTER-GUIDE-v1
last_updated: 2025-10-15

---

# Arky - Implementers' Guide (v1)

## 1) Purpose & Audience *(Informative)*

A concise, role-based path to shipping compliant Arky components. Use this alongside the normative specs. Each role includes **Implement**, **Publish**, and **Readiness Gates** (must-pass checks), plus **Required Artifacts** to make claims verifiable.

---

## 2) Role <-> Conformance Matrix *(Informative)*

| Role / Component             | Primary Specs & Levels to Target                 | Also Required                                              |
| ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| **TIM Issuer**               | TIM Core (T1/T2/T3), Canonicalization (C1/C2/C3) | Errors (E1/E2/E3), Discovery (Keys), Security BPR (S-BPR1) |
| **Notary**                   | Notary (N1->N3), Canonicalization (C1/C2/C3)      | Discovery (D1->D3), Errors, Security BPR (S-BPR2+)          |
| **Settler**                  | Settlers (S1->S3)                                 | Discovery (D1->D3), Registries (verbs), Errors, S-BPR2+     |
| **Registry/Policy Provider** | Registries (R1->R3) / Policy Packs (P1->P3)        | Discovery (publish), Canonicalization, S-BPR1+             |
| **Discovery Provider**       | Discovery (D1->D3)                                | Errors, S-BPR1+                                            |
| **SDK Authors (TS/Go/Rust)** | Canonicalization, TIM Core parse/verify          | Discovery parsing, Errors, Schemas                         |
| **Auditors**                 | Vectors, Notary/Settler specs (read)             | Security BPR, Policy Packs                                 |

*(Levels are defined in each spec's Conformance section.)*

---

## 3) Cross-Cutting Prerequisites *(Informative)*

* **Canonicalization:** JCS per Canonicalization v1; compute `cid`; sign with JWS Ed25519.
* **Error model:** Emit **ARKY-ERROR-v1** envelope/codes on failure.
* **Discovery:** Publish/consume well-known endpoints; verify signed **ServiceDescriptors**.
* **Policy binding:** Accept `policy_pack_id`; apply **most-restrictive wins** precedence.
* **Security:** Meet **ARKY-SECURITY-BPR-v1** baselines (TLS 1.3, key rotation, secure time, logging).

---

## 4) TIM Issuer - Build Path *(Informative)*

**Implement**

1. Validate against `tim-v1.json` + applicable Profile constraints.
2. Canonicalize (C1) -> hash `cid` -> sign (C2) -> self-verify (C3).
3. Enforce invariants (T2): numeric `value` -> `unit` present; `method` present; resolvable `identity.id`.
4. Privacy: only hash material to public anchors; no PHI/PII.
5. Journaling via `prev`; consider `nonce`/`exp` to limit replay.

**Publish**

* **Keys (required):** `/.well-known/arky-keys` (JWKS with stable `kid`).
* **Index (optional):** if exposing any service endpoints.

**Readiness Gates**

* Vectors: **T1/T2/T3**, **C1/C2/C3** -> PASS.
* Errors: **E1/E2/E3** on malformed/cid/signature/unit failures -> PASS.
* Security: **S-BPR1** controls documented.

**Required Artifacts**

* JWKS (active `kid`s), vector results JSON, version/commit of canonicalization library.

---

## 5) Notary - Build Path *(Informative)*

**Implement**

1. Ingest full TIM or `cid, canonical_bytes`; verify issuer `sig`.
2. Witness: produce JWS over canonical bytes; append to `time.witnesses[]`.
3. Batch -> Merkle root -> anchor to >=1 target; retain inclusion proofs.
4. Finality: track per-target depths; re-anchor on reorg < depth.
5. Deterministic order; quarantine skew; detect journal forks.
6. Persist `(cid, witness sig, batch id, proofs, order index)` for >= retention policy.

**Publish (Discovery)**

* `/.well-known/arky/index.json`, signed **ServiceDescriptor** (targets, finality defaults, batch limits, policy requirements), JWKS, `/health`, `/ready`.

**Readiness Gates**

* Vectors: **N1/N2/N3** -> PASS.
* Discovery: **D1/D2/D3** -> PASS.
* Errors: **E1-E3** -> PASS.
* Security: **S-BPR2+** (key rotation, monitoring, reorg handling) in place.

**Required Artifacts**

* Descriptor (`cid` + JWS), JWKS, active Policy Pack IDs, vector results, retention/finality policies.

---

## 6) Settler - Build Path *(Informative)*

**Implement**

1. Parse commitments; enforce Policy Pack gates.
2. Execute **core verbs** (`pay`, `refund`, `slash`, `revoke`, `upgrade`, `signal`, `control`); reject unknown verbs unless allowlisted.
3. Idempotency key support; rollback windows per rail; compensations on irreversible rails.
4. Emit **Execution Receipts (XR)**; anchor XR hashes via Notary at **S2+**.

**Publish (Discovery)**

* Signed **ServiceDescriptor**: supported rails, verbs (+ versions), rollback support, idempotency, XR anchoring policy.

**Readiness Gates**

* Vectors: **S1/S2/S3** -> PASS.
* Discovery: **D1/D2/D3** -> PASS.
* Errors: **E1-E3** -> PASS.
* Security: **S-BPR2+** (custody segregation, access controls).

**Required Artifacts**

* Descriptor (`cid` + JWS), JWKS, vector results, verb list with versions, rollback matrix by rail.

---

## 7) Registry & Policy Providers - Build Path *(Informative)*

**Implement**

* **Registries:** signed URN catalogs; alias resolution without cycles; versioned updates.
* **Policy Packs:** extends/overrides resolution; forbidden-override checks; signed distribution.

**Publish (Discovery)**

* Well-known indexes for registries and policies.

**Readiness Gates**

* Registries **R1-R3** -> PASS; Policy Packs **P1-P3** -> PASS.
* Discovery **D1** -> PASS.
* Security **S-BPR1+** (publisher keys, rotation, ETag/TTL).

**Required Artifacts**

* Signed registry/pack JSON (`cid` + JWS), index endpoints, change logs.

---

## 8) Discovery Provider - Build Path *(Informative)*

**Implement**

* **Index**, **Keys (JWKS)**, **Policy/Registry indexes**, signed **ServiceDescriptors**, `/health`, `/ready`.

**Readiness Gates**

* Discovery **D1/D2/D3** -> PASS.
* Errors **E1-E3** -> PASS.
* Security **S-BPR1+**.

**Required Artifacts**

* Index, JWKS, descriptors (all signed), uptime SLO for discovery endpoints.

---

## 9) SDK Authors (TS / Go / Rust) - Build Path *(Informative)*

**Implement**

* JCS, `cid`, JWS Ed25519; TIM parse/verify; witnesses; XR parse.
* Discovery parsing/verification; Error envelope types; Schemas bundling.

**Readiness Gates**

* Vectors: **C1-C3**, **T1-T3**, Discovery **D2 (client)**, Errors **E2 (client)** -> PASS.
* Security defaults: strict JSON, TLS hardening, no non-finite numbers.

**Required Artifacts**

* API surface doc, supported spec levels, vector results, reproducible build metadata.

---

## 10) Auditors - Assessment Path *(Informative)*

* Reproduce canonical bytes and signatures independently.
* Validate descriptors vs live behavior; confirm finality depths and witness independence.
* Assess Security BPR adherence (keys, rotation, monitoring, incident playbooks).
* Produce a **Conformance Report** with vector run IDs and descriptor `cid`s.

---

## 11) CI/CD Conformance Pipeline *(Informative)*

* **Lint:** schemas, invariants, forbidden fields.
* **Vectors:** run per-component suites; store `/results/<impl>/<version>/<runid>.json`.
* **Security:** ensure JWKS present/valid; time skew checks.
* **Discovery:** verify descriptor JWS + `cid`; diff capabilities; fail on drift.
* **Artifacts:** publish keys, descriptors, policy pack IDs, vector results.

---

## 12) Operational Readiness *(Informative)*

* **SLOs:** submit/execute/status availability; anchoring cadence; finality latency.
* **Rotations:** scheduled; overlapping `kid`s during cutover.
* **Monitoring:** anchor reorgs, skew quarantine rate, idempotency conflicts, rate-limit breaches.
* **Incidents:** revocations, descriptor updates, public notices per governance.

---

## 13) Self-Certification Pack *(Informative)*

Publish with your claim:

* Spec levels (e.g., `ARKY-NOTARY-v1 N2`), vector results (run IDs + commits).
* JWKS (`kid`s), signed descriptors (`cid`), effective Policy Pack IDs.
* Security BPR statement (key classes, lifetimes, rotation policy).

---

## 14) Change Management *(Informative)*

* **Upgrade path:** stage -> shadow -> canary; dual-signing windows for key rotations and descriptor updates.
* **Anti-downgrade:** clients refuse services below configured minimum spec levels.
* **Deprecations:** announce via Discovery index; provide sunset dates.

---

## 15) Final Deliverables Checklist *(Informative)*

| Role               | Must Publish                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| TIM Issuer         | JWKS; vector results (T1-T3, C1-C3); library version/commit                                                   |
| Notary             | ServiceDescriptor (signed); JWKS; finality policy; vector results (N1-N3); retention policy                   |
| Settler            | ServiceDescriptor (signed); JWKS; supported rails/verbs (+ versions); rollback matrix; vector results (S1-S3) |
| Registry/Policy    | Signed registries/packs; well-known indexes; change logs                                                      |
| Discovery Provider | Index; JWKS; signed descriptors; `/health` & `/ready`                                                         |
| SDK Authors        | Supported spec levels; vector results; API surface doc; reproducible build metadata                           |
| Auditors           | Conformance report; reproduced vector outcomes; descriptor `cid`s                                             |

---

**End - ARKY-IMPLEMENTER-GUIDE-v1**
