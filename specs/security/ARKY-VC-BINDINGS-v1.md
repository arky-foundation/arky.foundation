---

spec_id: ARKY-VC-BINDINGS-v1
title: Arky — Verifiable Credential Bindings for TIM
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-DISCOVERY-v1
  - ARKY-KEYS-v1
  - ARKY-POLICY-PACKS-v1
  - ARKY-ERRORS-v1
links:
  tim: https://arky.foundation/specs/core/ARKY-TIM-v1
  canonicalization: https://arky.foundation/specs/core/ARKY-TIM-Canonicalization-v1
  discovery: https://arky.foundation/specs/infrastructure/ARKY-DISCOVERY-v1
  policies: https://arky.foundation/specs/core/ARKY-POLICY-PACKS-v1
  errors: https://arky.foundation/specs/core/ARKY-ERRORS-v1
  schemas: https://arky.foundation/schemas/
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public vectors
authors:
  - Arky Foundation Dev WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/security/ARKY-VC-BINDINGS-v1
last_updated: 2025-10-15

---

# Arky — Verifiable Credential Bindings for TIM (v1)

**All sections are normative unless labeled *Informative*.**

## 1. Scope

Defines how **TIM Core (v1)** receipts are bound to **W3C Verifiable Credentials** (VC) and presented/verified with selective disclosure. Addresses:

* canonical embedding and referencing of TIM inside VC,
* proof composition (TIM signature vs. VC proof),
* selective disclosure (SD-JWT, BB+) without breaking `cid`,
* verification steps and conformance levels.

Out of scope: domain profile content; rail execution; UI.

**See Also:**
- [ARKY-KEYS-v1](ARKY-KEYS-v1.md) — JWK discovery for VC issuer keys
- [ARKY-SECURITY-BPR-v1 §3](ARKY-SECURITY-BPR-v1.md#3-cryptographic-baseline) — Signature algorithms for VC proofs
- [ARKY-SECURITY-BPR-v1 §8](ARKY-SECURITY-BPR-v1.md#8-privacy--data-handling) — Privacy requirements for VCs

## 2. Terminology

* **TIM:** Arky Time–Identity–Measurement receipt (ARKY-TIM-v1).
* **VC:** W3C Verifiable Credential (JSON object with `proof`/`proofs`).
* **Evidence binding:** A VC field carrying a reference to (or inclusion of) a TIM.
* **Selective disclosure (SD):** Mechanisms that reveal only a subset of claims (e.g., SD-JWT, BB+).

## 3. Binding Modes

Implementations **MUST** support at least **Mode A** and **SHOULD** support **Mode B**.

**Mode A — Evidence Reference (required)**

* The VC **MUST** include a deterministic reference to the TIM using its `cid`.
* The VC **MUST NOT** alter, re-sign, or re-serialize the TIM.
* The VC proof **MUST** be independent of the TIM’s `sig`.

**Mode B — Evidence Embed (recommended)**

* The VC **MAY** embed the full TIM object **byte-for-byte** (canonical JSON form for transport) alongside the `cid`.
* Embedded TIM **MUST** match the referenced `cid` exactly.

## 4. VC Fields (Required)

A conformant VC **MUST** include the following fields for TIM binding:

* `type` (array) — **MUST** include `"ArkyTIMEvidenceCredential"`.
* `issuer` — **MUST** be a resolvable identifier (e.g., DID/X.509 subject) distinct from TIM issuer when applicable.
* `issued` (or `issuanceDate`) — RFC3339.
* `evidence` (array of objects) — **MUST** contain at least one **ArkyTIMEvidence** object (see §5).
* `proof` / `proofs` — VC proof(s) per §7.

Unknown VC fields **MUST** be ignored by verifiers unless restricted by Policy Packs.

## 5. ArkyTIMEvidence Object

```
ArkyTIMEvidence := {
  type: "ArkyTIMEvidence",          // required
  cid: string,                      // required; Base58-BTC(MH(SHA-256,...))
  integrity: {                      // required
    hash_alg: "sha-256",            // required
    canonicalization: "JCS",        // required
  },
  embed?: object,                   // optional; full TIM (byte-preserving)
  roles?: ["data","train","eval","telemetry","payment","other"], // optional
  policy_pack_id?: string,          // optional; if binding requires a pack
  disclosures?: DisclosureSet       // optional; see §6
}
```

**Constraints**

* `cid` **MUST** equal the TIM’s content id computed per TIM Canonicalization v1.
* If `embed` is present, its canonical bytes **MUST** hash to `cid`.
* `roles` values are advisory; no new semantics are introduced by this spec.

## 6. Selective Disclosure (SD)

When a VC reveals only portions of a TIM’s content or related claims:

* The VC **MUST NOT** modify the TIM itself; SD applies to **additional VC claims** or **to redaction of the embedded TIM**, while preserving `cid`.
* If redaction is applied to an **embedded** TIM, the embed **MUST** be treated as opaque and **MUST NOT** diverge from the original canonical bytes; therefore, redacted embeds are **forbidden**. Use **reference-only** with `cid` plus SD claims derived from the TIM instead.
* SD mechanisms **MUST** be one of: `"sd-jwt"` or `"data-integrity-bbs"`.
* The VC **MUST** carry a disclosure manifest listing revealed fields; this manifest **MUST NOT** affect `cid` validation.

## 7. Proof Composition

* **TIM proof:** The TIM `sig` and any `time.witnesses[]` **MUST** remain intact and are verified independently.
* **VC proof:** The VC **MUST** carry its own proof (`proof`/`proofs`). Required support:

  * **Required:** JWS signature per [ARKY-SECURITY-BPR-v1 §3](ARKY-SECURITY-BPR-v1.md#3-cryptographic-baseline) — equivalent to VC-JWT/`proof.type="JsonWebSignature2020"`.
  * **Optional:** BB+ Data Integrity for SD use cases.
* A verifier **MUST**:

  1. Validate VC proof(s) against issuer keys discovered via ARKY-DISCOVERY-v1 or DID resolution.
  2. Resolve each `evidence[i].cid` and verify the referenced TIM (cid, `sig`, witnesses).
  3. Apply applicable Policy Pack (§9) constraints (residency, witness quorum, finality if anchored).

## 8. Discovery & Keys

VC issuer keys **MUST** be discoverable per [ARKY-KEYS-v1 §2](ARKY-KEYS-v1.md#2-discovery--jws) or via DID resolution.

* `kid` in VC proofs **MUST** resolve to one of the issuer's keys at the same origin (no cross-origin redirects)

## 9. Policy Interaction

* A VC **MAY** specify `policy_pack_id` at VC top level or inside `ArkyTIMEvidence`.
* Verifiers **MUST** enforce “most-restrictive-wins” precedence: commitment/request scope → VC-level → issuer default (Discovery).
* Packs **MUST NOT** be weakened by overlays in violation of ARKY-POLICY-PACKS-v1.

## 10. Verification Procedure (Normative)

Given a VC with ArkyTIMEvidence:

1. **Parse & Canonicalize:** Validate JSON; reject duplicate keys; ensure UTF-8.
2. **Verify VC Proof(s):** Check algorithm, `kid` resolution, signature.
3. **Resolve Evidence:** For each evidence:

   * If `embed` present: recompute `cid` from canonical bytes; **MUST** equal `evidence.cid`.
   * If only `cid` present: fetch or otherwise supply the TIM by `cid` (out of scope).
   * Verify TIM `sig`; verify `time.witnesses[]` per Notary policy if required.
4. **Apply Policy:** Enforce Pack constraints (privacy, residency, min witnesses, finality).
5. **Emit Result:** success/failure with ARKY-ERROR-v1 envelopes on error paths.

## 11. Inter-Constraints

* **Canonicalization:** Both TIM and Descriptor material **MUST** use JCS; VC proof mechanisms **MUST NOT** alter referenced `cid`
* **Privacy:** See [ARKY-SECURITY-BPR-v1 §8](ARKY-SECURITY-BPR-v1.md#8-privacy--data-handling) for PHI/PII handling
* **Hash agility:** `integrity.hash_alg` defaults to `"sha-256"`; alternate algorithms **MUST** be registered before use

## 12. Conformance

| Level | Requirements |
|---|---|
| **VB1** | Produce/consume `ArkyTIMEvidence` with valid `cid`; verify VC and TIM proofs independently |
| **VB2** | Support selective disclosure (SD-JWT or BB+) without breaking `cid`; enforce "no redacted embed" |
| **VB3** | Enforce Policy Pack constraints; record pack ID in verification logs |

Products **MAY** claim conformance only after passing Foundation vectors.

## 13. Constraints Table (Informative)

| Area      | MUST                                       | SHOULD                                |
| --------- | ------------------------------------------ | ------------------------------------- |
| Binding   | `evidence[].type="ArkyTIMEvidence"`, `cid` | `embed` when transport/locality helps |
| Integrity | JCS canonicalization; `cid` recomputation  | publish `cid` in in catalogs         |
| Proofs    | separate VC vs TIM proofs                  | BB+ for SD                           |
| SD        | no redacted embeds; ref-only with `cid`    | SD-JWT disclosure manifests           |
| Keys      | JWK at well-known or DID resolution       | multiple keys for rotation            |
| Policy    | most-restrictive precedence                | pack id recorded in logs              |

## 14. Versioning & Governance

**Spec ID:** `ARKY-VC-BINDINGS-v1`. Changes via RFC with public vectors. Backwards compatibility **RECOMMENDED**; migrations documented.