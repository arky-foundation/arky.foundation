---
spec_id: ARKY-TIM-Profiles-v1
title: TIM Profiles — Domain Requirements
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
summary: >
  Profiles that constrain TIM Core for specific domains (AI, Blockchain/Web3,
  Fintech, Space, Robotics). Claiming a profile requires meeting these rules
  in addition to TIM Core conformance (T1/T2/T3).

links:
  core: https://arky.foundation/core/
  examples: https://arky.foundation/examples/profiles/
  vectors: https://arky.foundation/vectors/
  schema: https://arky.foundation/schemas/core/tim-v1.json
  rfcs: https://arky.foundation/rfcs/

governance:
  owner: Arky Foundation Technical Council
  process: RFC with public review and test vectors

authors:
  - Arky Foundation Spec WG

license:
  text: CC-BY-4.0
  code: Apache-2.0

permalink: /specs/ARKY-TIM-Profiles-v1
last_updated: 2025-10-15
---


# TIM Profiles (v1) — Domain Requirements

Spec ID: ARKY-TIM-Profiles-v1
Effective: 2025-10-15

---

## 1. Scope & Structure

* **Applies to:** TIM Core (v1) receipts.
* **Profile ID:** `TIM-<DOMAIN>-v1`
* **Conformance:** Additive to TIM T1/T2/T3; see §8.

Each profile defines:
(a) field constraints; (b) method content requirements; (c) units; (d) witness quorum classes; (e) privacy/attestation expectations.

**Companions:** See **TIM Core** (`https://arky.foundation/core/`), **Examples** (`https://arky.foundation/examples/profiles/`), and **Vectors** (`https://arky.foundation/vectors/`).

---

## 2. Common Requirements (all profiles)

* `identity.id`: *required* and **resolvable** under the domain's accepted methods (e.g., DID, X.509, enterprise IDs).
* `measurement.method`: *required* and **parsable key–value segments** (e.g., `key:value|key:value`).
* `measurement.value`: if numeric → `unit` *required*; units must be SI or profile-listed.
* **Witnesses:** At least **two** independent witnesses are *recommended* unless stated otherwise.
* **Selective disclosure:** Material intended for public anchoring **MUST NOT** contain PHI/PII.

---

## 3. AI / Machine Learning — `TIM-AI-v1`

**3.1 Field constraints**

* `measurement.name`: one of `dataset_hash | train_compute | eval_score | redteam_findings | action_journal_digest`.
* `measurement.method`: *required* segments depending on `name`:

  * `dataset_hash` → `license:<id>` and `hash:<alg>`
  * `train_compute` → `code@<commit>`, `env:<hash>`, `hyper:…`, `seed:<n>`, `hw:<label>`
  * `eval_score` → `suite:<name>@<ver>`, `metric:<name>`
* `measurement.unit`:

  * `train_compute` → `TFLOP·h`
  * `eval_score` → `%` (or profile-approved metric unit)
* `identity.claims` (optional): IRB/ethics license refs when humans/data are involved.

**3.2 Witness & attestation**

* Witness quorum: **lab** + **compute provider** (≥2).
* `identity.proofs` (recommended): RATS/TEE for training hosts.

**3.3 Conformance notes**

* Lints **MUST** reject `train_compute` without `unit=TFLOP·h`.
* `eval_score` **SHOULD** include uncertainty in `error`.

### 3.4 Hooks (Registries & Vectors)

- Registries
  - Units/Resources: `arky:unit/tflop·h`, `arky:unit/%`
  - Device classes (optional): `arky:device/camera.rgb`, `arky:device/gpu.cluster`
  - Attestation types (recommended): `arky:attest/rats.eat@v1`, `arky:attest/tee.intel.sgx@v1`
- Anchor Targets (if anchored): `caip2:eip155:1`, `log:arky:transparency@v1`
- Vectors suite prefix: `/vectors/ai/`

---

## 4. Blockchain / Web3 — `TIM-CHAIN-v1`

**4.1 Field constraints**

* `measurement.method` **MUST** include `chain:caip2:<namespace>:<reference>` and `height:<n>` for chain observations.
* If `identity.id` denotes a chain account, it **MUST** be CAIP-10 (e.g., `eip155:1:0x…`).
* `measurement.name`: one of `block_finality_depth | oracle_value | tx_status | bridge_event | gas_used` (extensible).

**4.2 Units**

* `block_finality_depth` → `blocks`
* `gas_used` → `gas` or `gwei` (as applicable); other values domain units

**4.3 Witness & attestation**

* Oracle values **SHOULD** include multi-signer witnesses (≥3) representing the signer set snapshot.

**4.4 Conformance notes**

* Reorg handling **SHOULD** use minimum finality depths per chain policy before notarization.

### 4.5 Hooks (Registries & Vectors)

- Registries
  - Units: `arky:unit/blocks`, `arky:unit/gas`
  - Attestation types (optional): `arky:attest/rats.eat@v1`
- Anchor Targets: `caip2:eip155:*`, `solana:*`, `btc:*`
- Vectors suite prefix: `/vectors/chain/`

---

## 5. Fintech / Payments — `TIM-FIN-v1`

**5.1 Field constraints**

* `measurement.name`: `service_uptime | fx_rate | kyc_check | chargeback_outcome | payment_latency`.
* `measurement.method` must name the **procedure/provider** (e.g., `kyc:providerX@v3|step:pass`).
* `measurement.unit`:

  * `service_uptime` → `%`
  * `fx_rate` → quoted currency (e.g., `USD`), with source basket in `method`
  * `payment_latency` → `ms`

**5.2 Privacy**

* `kyc_check` **MUST NOT** reveal PII; use token/hash or SD-JWT/BBS+.

**5.3 Witness**

* Recommended: **PSP** + **auditor** (≥2).

### 5.4 Hooks (Registries & Vectors)

- Registries
  - Units: `arky:unit/%`, `arky:unit/ms`
  - Verbs (reference): `arky:verb/pay@v1`, `arky:verb/refund@v1`
- Anchor Targets (optional): `log:arky:transparency@v1`
- Vectors suite prefix: `/vectors/fin/`

---

## 6. Space / Aerospace — `TIM-SPACE-v1`

**6.1 Field constraints**

* `measurement.name`: `p_collision | delta_v | tle | health_status | downlink_rate`.
* `measurement.method` must include model/source (e.g., `ssa:<provider>@<ver>|cdm:<ver>`).
* `measurement.unit`:

  * `delta_v` → `m/s`
  * `p_collision` → `%`

**6.2 Witness & attestation**

* Witness quorum: independent **SSA networks/ground stations** (≥2) when feasible.
* `identity.proofs` (recommended): flight-software/hardware attestation.

**6.3 Offline tolerance**

* If DTN applies, implementations **SHOULD** include `time.ordering` hints; merge rules are defined by the Notary.

### 6.4 Hooks (Registries & Vectors)

- Registries
  - Units: `arky:unit/m/s`, `arky:unit/%`
  - Device classes (optional): `arky:device/radar.ssa`, `arky:device/transponder`
- Anchor Targets (optional): `log:arky:transparency@v1`
- Vectors suite prefix: `/vectors/space/`

---

## 7. Robotics — `TIM-ROBOTICS-v1`

**7.1 Field constraints**

* `measurement.name`: `coverage | thrust | pose_accuracy | geo_fence | power_draw`.
* `measurement.method` must include middleware/topic and alg (e.g., `ros2:/topic|alg:<id>`).
* Numeric measurements **SHOULD** include `error`.
* `unit` examples: `%`, `newton`, `m`, `m/s`, `W`.

**7.2 Witness & attestation**

* Recommended witnesses: **controller** + **sensor pipeline** (≥2).
* `identity.proofs` (recommended): device attestation for safety-critical ops.

### 7.3 Hooks (Registries & Vectors)

- Registries
  - Units: `arky:unit/%`, `arky:unit/newton`, `arky:unit/m`, `arky:unit/m/s`, `arky:unit/W`
  - Device classes: `arky:device/controller`, `arky:device/sensor.pipeline`
  - Attestation types (recommended): `arky:attest/tee.arm.cca@v1`, `arky:attest/device.tpm.quote@v1`
- Anchor Targets (optional): `log:arky:transparency@v1`
- Vectors suite prefix: `/vectors/robotics/`

---

## 8. Conformance

* A product may claim `TIM-<DOMAIN>-v1` only if **all** profile rules above are met **and** TIM Core conformance (T1/T2/T3) is satisfied.
* Profile test vectors live under `https://arky.foundation/vectors/<domain>/`.

## 9. Governance & Versioning (Informative)

* Profile changes follow the Foundation RFC process (public comment + vectors).
* Profiles are versioned independently of TIM Core; cross-compatibility matrices are maintained in the Profiles README.
* **New profiles** (e.g., Healthcare, Supply Chain) are proposed via RFC with: scope, field constraints, units, witness policy, privacy notes, and draft vectors.

---

**End of TIM Profiles (v1).**
