---
spec_id: ARKY-TIM-v1
title: Arky — TIM Core
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative

summary: >
  Minimal, verifiable receipt that binds Time, Identity, and Measurement (TIM),
  with strict canonicalization (JCS), content addressing (cid), signatures (JWS Ed25519),
  witnessing, and conformance levels (T1/T2/T3).

links:
  schema: https://arky.foundation/schemas/core/tim-v1.json
  vectors: https://arky.foundation/vectors/
  profiles: https://arky.foundation/specs/core/ARKY-TIM-Profiles-v1
  canonicalization: https://arky.foundation/specs/core/ARKY-TIM-Canonicalization-v1
  rfcs: https://arky.foundation/rfcs/

references:
  - RFC 2119  # Key words for use in RFCs to Indicate Requirement Levels
  - RFC 8785  # JSON Canonicalization Scheme (JCS)
  - RFC 7515  # JSON Web Signature (JWS)
  - RFC 8037  # CFRG Elliptic Curve Algorithms (EdDSA)

governance:
  owner: Arky Foundation Technical Council
  process: RFC with public review and test vectors

authors:
  - Arky Foundation Spec WG

license:
  text: CC-BY-4.0
  code: Apache-2.0

permalink: /specs/ARKY-TIM-v1
last_updated: 2025-10-15
---

# Arky — TIM Core (v1)

Spec ID: ARKY-TIM-v1
Effective: 2025-10-15

**Status:** v1 (Stable)

**All sections are normative unless labeled _Informative_.** Companion docs
(profiles, examples, vectors, implementer notes) are published separately.

> **Normative Keywords** (**MUST**, **SHOULD**, **MAY**, etc.) are as in
> RFC 2119.

---

## 1. Scope

**TIM Core** defines a minimal, verifiable receipt binding **Time**,
**Identity**, and **Measurement**. It specifies:

- the data model
- canonicalization and hashing
- signature and witnessing
- conformance levels

Other concerns (policies, domains, settlement) are out of scope.

---

> **Complete Example:** See [TIM Basic Example](../../examples/flows/tim-basic.md) for a temperature sensor reading.

---

## 3. Terminology

- **TIM receipt (TIM):** A signed, content-addressed JSON object asserting a measurement by an identity at a time.
- **cid:** Content identifier of the canonical unsigned body (multihash encoded with multibase).
- **witness:** An additional signature over the canonical body included in `time.witnesses[]`.
- **JCS:** RFC 8785 JSON Canonicalization Scheme.
- **JWS:** JSON Web Signature (Ed25519/EdDSA in v1).

---

## 4. Data Model

A TIM **MUST** be a JSON object with the following fields.

**Legend:** `required`, `conditional-required`, `recommended`, `optional`.

- `time` _(object)_

  - `ts`: _required_ — RFC3339 UTC timestamp (e.g., `2025-10-15T12:00:00Z`).
  - `witnesses`: _optional_ — array of JWS strings; each signs the canonical
    body.
  - `ordering`: _optional_ — offline ordering hints (opaque to Core).

- `identity` _(object)_

  - `id`: _required_ — stable identifier (e.g., DID, X.509 subject,
    enterprise/robot ID).
  - `claims`: _optional_ — array of credential references (e.g., VCs).
  - `proofs`: _optional_ — array of attestation references (e.g., RATS/TPM/TEE
    evidence).

- `measurement` _(object)_

  - `name`: _required_ — label of the measured quantity.
  - `value`: _required_ — number | string | object (domain-defined).
  - `unit`: _conditional-required_ — **required if** `value` is numeric.
  - `method`: _required_ — structured object with `type` (sensor|computation|manual|oracle|attestation), `source` (identifier), optional `params`, and recommended `version`. Examples: `"type":"sensor","source":"device:temp-01","version":"v2"` or `"type":"computation","source":"code@abc123","params":"alg":"sha256"`.
  - `device`: _recommended_ — source instrument or topic identifier.
  - `error`: _recommended_ — uncertainty (e.g., `±0.05`, confidence interval).
  - `code`: _recommended_ — domain code (e.g., LOINC, DICOM, GS1, ROS2).
  - `provenance`: _optional_ — capture context (opaque to Core).

- Envelope

  - `prev`: _optional_ — `cid` of a prior related TIM.
  - `cid`: _required_ — multibase(multihash(sha2-256, canonical_body)).
  - `nonce`: _recommended_ — anti-replay token.
  - `exp`: _recommended_ — RFC3339 expiry; recipients **SHOULD** reject after
    expiry.
  - `sig`: _required_ — JWS compact signature over the canonical body.

**Constraints**

- If `measurement.value` is numeric, `unit` and `method` **MUST** be present.
- `sig` **MUST** be computed over the canonical body (see §5) and bound to the `cid`.
- PHI/PII **MUST NOT** be included in material intended for public anchoring.

---

## 5. Canonicalization & Content Addressing

**Canonicalization:** v1 **MUST** use **RFC 8785 JCS**. Canonical body = full
TIM object **without** `cid` and `sig`.

**cid:** `cid = base58btc(multihash(sha2-256, canonical_bytes))` (multihash code `0x12`, length `32`).

**Forbidden numeric values:** `NaN`, `Infinity`, `-Infinity` **MUST NOT** appear; encode as strings if necessary.

---

## 6. Signatures & Witnesses

**sig:** JWS (compact) with **Ed25519/EdDSA** over the canonical bytes. Public keys **MUST** be discoverable from `identity.id` per §6.1. JWS `kid` **SHOULD** reference the signing key.

**witnesses:** Each entry in `time.witnesses[]` **MUST** be a JWS over the same canonical bytes.

### 6.1 Key Discovery

Verifiers **MUST** resolve public keys from `identity.id` using the following methods:

**DID (Decentralized Identifier):**
- **did:key:** Extract key directly from the DID (e.g., `did:key:z6Mkf...` → Ed25519 public key).
- **did:web:** Fetch `https://domain/.well-known/did.json` and resolve verification method.
- **did:jwk:** Decode JWK from the DID.
- **Other DID methods:** Follow W3C DID Core resolution algorithm.

**X.509:**
- If `identity.id` is a X.509 subject (e.g., `CN=device-01.example.org`), verifiers **MUST** validate the certificate chain and extract the public key from the leaf certificate.
- TIM **SHOULD** include the certificate chain in `identity.proofs[]`.

**JWK URI:**
- If `identity.id` is a URI (e.g., `https://example.org/actors/alice`), verifiers **MAY** attempt to fetch `id/.well-known/jwks.json`.
- If `identity.jwks_uri` is present (extension field), fetch that JWK document.

**Custom schemes:**
- Implementations **MAY** support enterprise ID schemes (e.g., `urn:uuid:...`, `robot:unit-42`) if accompanied by a resolvable `identity.jwks_uri` or pre-registered keys.

**Verification algorithm:**
1. Parse `identity.id` to determine scheme.
2. Resolve public key(s) using appropriate method.
3. Extract JWS `kid` from `sig` header (if present).
4. Match `kid` to resolved key(s).
5. Verify JWS signature using matched public key.
6. If `time.witnesses[]` present, repeat for each witness identity.

**Security considerations:**
- Verifiers **SHOULD** cache resolved keys with TTL.
- Verifiers **MUST** check key revocation if the identity method supports it (e.g., DID document `revoked` flag, X.509 CRL/OCSP).
- If key resolution fails, verification **MUST** fail.

---

## 7. Semantics & Causal Chains

A TIM proves that an identity asserted a measurement with a stated method/device at `time.ts`, optionally co-signed by witnesses. Core does **not** mandate any consequence.

**Freshness & Anti-replay:** Recipients **SHOULD** enforce freshness (e.g., `exp`, acceptable skew) and anti-replay (`nonce`).

**Causal Chains (`prev`):** The optional `prev` field creates tamper-evident chains:
- `prev` **MUST** be the `cid` of a prior TIM issued by the same `identity.id`.
- Forms a linear append-only log: TIM₀ → TIM₁ (`prev`: cid₀) → TIM₂ (`prev`: cid₁).
- Verifiers **SHOULD** validate chain integrity; **MUST** reject cross-identity references.
- Fork detection: If two TIMs claim the same `prev`, reject unless using merge rules (e.g., vector clocks).

**Use cases:** Audit logs, state machines, sensor streams.

---

## 8. Security & Privacy

- **Selective disclosure:** Implementations **SHOULD** support privacy-preserving disclosure (e.g., hash commitments, Merkle trees, SD-JWT). When using these, `measurement.method` **MUST** indicate the privacy scheme.
- **Key lifecycle:** Signing keys **SHOULD** support rotation and revocation. Verifiers **SHOULD** check revocation where applicable.
- **Homograph safety:** Implementations **SHOULD** normalize and restrict characters in identifiers and codes to mitigate spoofing.

---

## 9. Conformance

Level definitions:

- **T1 — Verify:** JCS canonicalization; recompute `cid`; verify `sig`; basic
  schema validity.
- **T2 — Completeness:** enforce required/conditional fields; numeric unit +
  method; privacy lints for anchoring.
- **T3 — Witnessed:** if `witnesses` present or required by a profile/policy,
  verify each; ensure `prev` journals are consistent.

Products **MAY** claim `TIM-T1/T2/T3 compliant` only if they pass the
Foundation's conformance vectors.

**References:**

- Conformance harness and machine vectors: `https://arky.foundation/vectors/`
  (versioned).

---

## 10. Interoperability (Informative)

Mappings to domain standards (DIDs, VCs, FHIR/LOINC, ROS2, GS1, CAIP) are defined in **ARKY-TIM-Profiles-v1**.

---

## 11. Registries & Governance

**Registries:** Small, versioned registries (units, domain codes, device classes) are published in **ARKY-REGISTRIES-v1**.

**Versioning:** `ARKY-TIM-v1`. Changes via RFCs with tests and migration notes.

---

**End of TIM Core (v1).**
