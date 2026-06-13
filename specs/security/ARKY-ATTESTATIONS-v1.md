---
spec_id: ARKY-ATTESTATIONS-v1
title: Arky — Attestations
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-DISCOVERY-v1
  - ARKY-REGISTRIES-v1
  - ARKY-POLICY-PACKS-v1
  - ARKY-ERRORS-v1
summary: >
  Canonical evidence envelope and verification result for device/agent/enclave
  attestation; standardized binding (key/content/account), freshness, trust-chain
  validation, privacy, discovery signaling, and conformance.
links:
  tim: https://arky.foundation/specs/core/ARKY-TIM-v1
  canonicalization: https://arky.foundation/specs/core/ARKY-TIM-Canonicalization-v1
  discovery: https://arky.foundation/specs/infrastructure/ARKY-DISCOVERY-v1
  registries: https://arky.foundation/specs/infrastructure/ARKY-REGISTRIES-v1
  policies: https://arky.foundation/specs/core/ARKY-POLICY-PACKS-v1
  errors: https://arky.foundation/specs/core/ARKY-ERRORS-v1
  vectors: https://arky.foundation/specs/development/ARKY-VECTORS-v1
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public vectors
authors:
  - Arky Foundation Security WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/security/ARKY-ATTESTATIONS-v1
last_updated: 2025-10-15

---

# Arky — Attestations (v1)

**All sections are normative unless labeled *Informative*.**

## Executive Summary *(Informative)*

Defines attestation evidence envelopes and verification results for hardware/software integrity proofs.

**Core Concepts:**
- Attach attestation tokens (TPM/TEE/enclave) to TIM receipts via `identity.proofs[]`
- Verify evidence into signed Attestation Results (AR) with normalized claims
- Cryptographically bind attestations to keys, content, or accounts

**Use Cases:** Hardware root-of-trust, software integrity, zero-trust authorization

**Quick Start:** Generate TEE evidence → attach to TIM → verify → use AR for decisions. See §§3-7 for details.

## 1. Scope

Defines (a) **Attestation Evidence** envelope for scheme-specific tokens, (b) signed **Attestation Result (AR)**, (c) **bindings** to signing keys, content (`cid`), and optional accounts, (d) **freshness**, **trust anchors**, **revocation**, **privacy**, **Discovery** signaling, and **conformance**.

Out of scope: vendor-specific measurement semantics beyond acceptance rules.

**See Also:**
- [ARKY-KEYS-v1](ARKY-KEYS-v1.md) — Verifier key discovery
- [ARKY-SECURITY-BPR-v1 §3](ARKY-SECURITY-BPR-v1.md#3-cryptographic-baseline) — Signature algorithms for AR
- [ARKY-SECURITY-BPR-v1 §8](ARKY-SECURITY-BPR-v1.md#8-privacy--data-handling) — Privacy requirements for attestations

## 2. Terminology

* **Evidence:** Scheme-specific attestation token (e.g., RAT/EAT, TPM quote, SGX/TDX/SNP/CCA report) carried in a canonical envelope.
* **Attestation Type:** Registry entry `arky:attest/<scheme>@v<major>` defining container, required claims, anchors, and freshness.
* **Binding:** Cryptographic link proving relevance: **key-binding**, **content-binding**, optional **account-binding**.
* **Attestation Result (AR):** Signed, normalized verifier output.
* **Verifier:** Component that validates Evidence and produces an AR.

## 3. Placement in TIM

`TIM.identity.proofs[]` **MUST** be an array of strings. Each element is either:

1. a **raw token string** (e.g., JWS compact; or base64url of COSE/TPM), or
2. a **CID** referencing an external **Attestation Evidence** object (see §4).

If both are present for the same Evidence, the **CID reference** is authoritative for hashing/audit.

## 4. Evidence Envelope

When Evidence is stored as an object (referenced by CID), it **MUST** use:

```
AttestationEvidence := {
  type: string,                 // required; arky:attest/<scheme>@v<major> (Registries)
  format: string,                  // required; registered container/format id (e.g., eat-cbor, tpm2, sgx-quote)
  payload: string,              // required; base64url raw Evidence
  nonce: string,                // required; challenge binding per §6
  subject: { id: string, class?: string }, // required id; optional device class (Registries)
  endorsements?: [string],      // optional; base64url or URN references
  ts?: string,                  // optional; RFC3339 attester time if present
  cid?: string,                 // required if this envelope is signed
  sig?: string                  // optional; JWS signature per ARKY-SECURITY-BPR-v1 §3
}
```

**Rules**

* `type`/`format` **MUST** be registered; unknown types **MUST** be rejected unless Policy explicitly allowlists.
* If `sig` present, `cid` **MUST** hash the envelope with `cid/sig` omitted (JCS).
* `payload` **MUST** be unmodified raw token bytes.

---

## 5. Attestation Result (AR)

Verifiers **MUST** emit a signed, canonical AR:

```
AttestationResult := {
  type: string,                       // arky:attest/<scheme>@v<major>
  subject: { id: string },            // matches Evidence.subject.id
  status: "pass"|"fail"|"indeterminate",
  freshness_ms: integer,
  validity: { not_before?: string, not_after?: string },
  claims: object,                     // normalized per §5.1
  binding: {                           // what was proven
    key?: { id?: string, fingerprint?: string },
    content?: { cid?: string, digest?: string },
    account?: { id?: string }          // if applicable
  },
  trust: {
    chain: "root-"|"untrusted"|"revoked"|"unknown",
    nonce_verified: boolean,
    replay_protected: boolean
  },
  policy: { pack_id: string, profile?: string },
  evidence_cid: string,               // CID of Evidence or hash of raw token if inlined
  verifier_id: string,                // DID or issuer id
  ts_verified: string,                // RFC3339
  cid: string,                        // JCS canonical body hash
  sig: string                         // JWS signature per ARKY-SECURITY-BPR-v1 §3
}
```

**Normalized Claims (Minimum)**

AR `claims` **MUST** include when derivable:

| Claim | Type | Values |
|---|---|---|
| `hw_vendor` | string | Hardware vendor |
| `hw_model` | string | Hardware model |
| `tee` | enum | `sgx`, `tdx`, `sev-snp`, `cca-realm`, `none` |
| `sw_measurement` | string | Multibase hash |
| `debug` | boolean | Debug mode enabled |
| `anti_rollback` | boolean | Anti-rollback protection |
| `boot_state` | enum | `secure`, `measured`, `unknown` |
| `key_class` | enum | `device_key`, `os_key` |
| `origin` | enum | `strongbox`, `tee`, `host` |

Extra keys **MAY** appear but **MUST NOT** redefine the minimum set; namespaced additions (`ns:key`) **MUST** be registered.

## 6. Bindings

Valid verification **MUST** confirm at least one binding:

| Binding | Description | Validation |
|---|---|---|
| **Key** | Evidence asserts the public key signing `tim.sig` | Extracted key **MUST** match discovered signing key; mismatch → `discovery.key_mismatch` |
| **Content** | Evidence proves knowledge of exact content | `nonce == cid` **or** `nonce == H(canonical_bytes || context)`; mismatch → `tim.cid_mismatch` |
| **Account** (optional) | Evidence proves CAIP-10 account control | Follow ARKY-IDENTITY-BINDINGS when present |

**Freshness:** `nonce` **MUST** be fresh per Policy (no reuse; max age enforced). Stale/replayed → `common.unauthorized` with retry `never`.

## 7. Verification Procedure

Verifiers **MUST**:

1. **Identify type** from headers/markers → registered `arky:attest/*`.
2. **Parse/verify container** (JWS/COSE/TPM) to configured trust anchors; check revocation.
3. **Validate bindings** (§6): key/content/account as required by Policy Pack or service.
4. **Check freshness** against the type's `max_age` (Registries) and Pack thresholds.
5. **Evaluate reference values** (measurements/allowlists) when defined by the type.
6. **Produce AR** (§5) using JCS canonicalization and JWS signature per [ARKY-SECURITY-BPR-v1 §3](ARKY-SECURITY-BPR-v1.md#3-cryptographic-baseline); set `status` accordingly.
7. **Emit errors** using ARKY-ERROR: `common.invalid_argument`, `keys.unknown_id`, `keys.revoked`, `common.unauthorized`, `policy.pack_invalid`.

Determinism: network usage for revocation/lookups **MUST** follow Pack rules; results **MUST** be reproducible from cached state where required.

## 8. Attestation Types (Registries)

The canonical list of permitted types lives in **Registries** (`arky:attest/*`). Each entry **MUST** declare:

* containers (JWS/COSE/TPM),
* allowed bindings (`key`, `content`, `account`) and whether exactly one or multiple are required,
* freshness policy (`max_age`, `accept_skew`),
* trust anchors and revocation method,
* claim mapping to the §5.1 normalized set.

This spec **MUST NOT** enumerate types; they are maintained in the Registry.

## 9. Discovery Signaling

Services that require or support attestation **MUST** advertise in their ServiceDescriptor:

```
capabilities.attestation := {
  required: boolean,
  types: [ "arky:attest/<scheme>@v<major>", ... ]
}
```

Clients **MUST** refuse services requiring unsupported types (`discovery.unsupported_level`).

## 10. Policy Integration

Policy Packs **MUST** be able to require: specific types, bindings, freshness windows, and claim predicates (e.g., `tee in [sgx, tdx]`, `debug=false`). Verifiers **MUST** enforce and record `policy.pack_id` (and `profile`, if any) in the AR.

## 11. Privacy

Evidence and AR **MUST NOT** be publicly anchored. See [ARKY-SECURITY-BPR-v1 §8](ARKY-SECURITY-BPR-v1.md#8-privacy--data-handling) for complete privacy requirements.

## 12. Transport & Keys

Verifier keys **MUST** be discoverable per [ARKY-KEYS-v1 §2](ARKY-KEYS-v1.md#2-discovery--jws). Evidence `type/format` and hash algorithms **MUST** resolve via Registries. Unverifiable keys → `keys.unknown_id`.

## 13. Conformance

| Level | Requirements |
|---|---|
| **AT1** | Accept raw tokens or CID-referenced Evidence; enforce registered `type/format`; require `nonce` |
| **AT2** | Validate chain/revocation; enforce bindings and freshness; normalize claims; emit signed AR |
| **AT3** | Honor Policy Packs; expose Discovery capabilities; map failures to ARKY-ERROR with retry hints |

Claims of conformance require passing Foundation vectors.

## 14. Constraints Table *(Informative)*

| Area      | MUST                                       | SHOULD                                  |
| --------- | ------------------------------------------ | --------------------------------------- |
| Placement | `identity.proofs[]` strings (token or CID) | prefer CID to Evidence object for audit |
| Bindings  | key or content (±account) proven           | both when feasible                      |
| Freshness | enforce `max_age`, no nonce reuse          | skew tolerance per type                 |
| Trust     | anchors + revocation checks                | multiple anchors for redundancy         |
| Claims    | normalized set; no redefinition            | namespaced extensions via Registries    |
| Privacy   | never anchor raw Evidence/AR               | hash/cid anchoring if policy allows     |
| Discovery | advertise `attestation.required/types`     | cache descriptors with ETag             |