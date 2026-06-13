---

spec_id: ARKY-IDENTITY-BINDINGS-v1
title: Arky — Identity Bindings & Key Resolution
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-DISCOVERY-v1
  - ARKY-SECURITY-BPR-v1
  - ARKY-REGISTRIES-v1
summary: >
  Defines permitted identifier schemes for `identity.id`, the resolution and
  validation of public keys, `kid` selection rules, rotation/revocation, and
  account bindings (CAIP-10) to ensure deterministic signature verification.
links:
  tim: https://arky.foundation/specs/core/ARKY-TIM-v1
  canonicalization: https://arky.foundation/specs/core/ARKY-TIM-Canonicalization-v1
  discovery: https://arky.foundation/specs/infrastructure/ARKY-DISCOVERY-v1
  security: https://arky.foundation/specs/security/ARKY-SECURITY-BPR-v1
  registries: https://arky.foundation/specs/infrastructure/ARKY-REGISTRIES-v1
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public vectors
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/infrastructure/ARKY-IDENTITY-BINDINGS-v1
last_updated: 2025-10-15

---

# Arky — Identity Bindings & Key Resolution (v1)

**All sections are normative unless labeled *Informative*.**

## 1. Scope

Defines: allowed identifier schemes for `identity.id`, key resolution and verification, `kid` rules, rotation, revocation, cache/TTL, and account bindings (CAIP-10). Applies to signers of TIM, Notary witnesses, Registry/Policy publishers, and any verifier (clients, SDKs, services).

Out of scope: human identity proofing, KYC/KYB policy (see Policy Packs).

---

## 2. Terminology

* **Identifier (ID):** Value in `identity.id` identifying the signer.
* **Key Set:** Resolved public keys for an ID (DID Document, JWKS, or X.509 chain).
* **`kid`:** JWS header value selecting a specific key in a Key Set.
* **Account ID:** On-chain account identifier (CAIP-10).

---

## 3. Identifier Schemes

Implementations **MUST** accept only schemes allowed by the active Policy Pack. The baseline permitted set in v1:

* **DID**: `did:web`, `did:key`.
* **JWKS**: HTTP origin with `/.well-known/arky/jwks.json` (per Discovery).
* **X.509**: HTTP origin with TLS-bound identity and certificate chain.

**Rules**

1. `identity.id` **MUST** be one of: a DID URI; an HTTP origin (host) for JWK/X.509; or a CAIP-10 Account ID when the identity *is* an account.
2. If a Policy Pack restricts methods, verifiers **MUST** enforce that restriction.
3. All Arky JWS **MUST** verify against Ed25519 verification methods only.
4. Unknown or disallowed schemes **MUST** be rejected.

---

## 4. Key Resolution

### 4.1 DID Resolution

* `did:web`: resolve over HTTPS to a DID Document.
* `did:key`: parse the method-embedded key.
* The DID Document **MUST** yield at least one Ed25519 verification method compatible with JWS.
* Method-specific revocation and controller rules **MUST** be enforced.

### 4.2 JWK Resolution

* Fetch JWKS at `https://<origin>/.well-known/arky/jwks.json` (Discovery).
* JWKS **MUST** be valid per RFC 7517; keys **MUST** include `kty=OKP`, `crv=Ed25519`, unique `kid`.
* Transport **MUST** be HTTPS/TLS 1.3; caching **MUST** honor ETag/Max-Age.

### 4.3 X.509 Resolution

* Identity is the HTTP origin. Public key material is the TLS serving certificate chain.
* Verifiers **MUST** validate the chain to system or configured roots and enforce EKU for server authentication.
* When used for JWS verification, the key **MUST** be extractable as Ed25519; if not, the signature **MUST** be rejected.

### 4.4 Resolution Order

* Verifiers **MUST** attempt resolution in the order: DID → JWK → X.509.
* The first successful resolver wins; failures **MUST NOT** silently fall back to subsequent methods.
* If all resolution methods fail, verification **MUST** fail with an appropriate ARKY-ERROR code.

---

## 5. `kid` Selection & JWS Constraints

* JWS protected header **MUST** include `"alg":"EdDSA"`.
* `kid` **MUST** uniquely select a key from the resolved Key Set:

  * DID: `kid` **SHOULD** be `<did>#<fragment>` matching a verification method `id`.
  * JWKS: `kid` **MUST** match a member of the published JWKS.
  * X.509: `kid` **MUST** be `x509:spki:sha-256:<base64url(PKI_SHA256)>`; if absent, the active leaf key is implied and **MUST** match.
* If `kid` does not resolve uniquely, verification **MUST** fail.

---

## 6. Verification Procedure

Given a JWS over canonical bytes and `identity.id`:

1. **Resolve Key Set** per §4; apply caching and TTL.
2. **Select Key** via `kid` per §5.
3. **Verify Signature** over the canonical bytes (per Canonicalization v1) using Ed25519 verification only.
4. **Check Validity**:

   * DID: ensure the verification method is not revoked and is authorized for assertion.
  * JWKS: key present and not revoked/expired by provider policy.
   * X.509: chain valid at `ts`; no revocation (CRL/OCSP) if required by Policy Pack.
5. **Return** success/failure. On failure, emit ARKY-ERRORS codes (e.g., `keys.unknown_id`, `common.unauthorized`, `tim.invalid_signature`).

Verifiers **MUST NOT** perform network fetches during critical-path validation if policy forbids; in such cases, stale caches **MUST** cause failure or quarantine per policy.

---

## 7. Rotation & Caching

* Providers **MUST** support overlapping keys for zero-downtime rotation (multiple `kid`s active).
* Clients **MUST** cache Key Sets respecting ETag/TTL; maximum cache lifetime **MUST NOT** exceed Policy Pack maximum.
* On `kid` miss after a single re-resolve, clients **MUST** fail with `keys.unknown_id`.

---

## 8. Revocation

* Providers **MUST** publish key revocations:

  * DID: update DID Document removing or revoking the method.
  * JWKS: remove `kid` from JWKS and optionally publish a signed revocation list.
  * X.509: publish CRL/OCSP; rotate TLS cert.
* Verifiers **MUST** treat revoked keys as invalid immediately on detection; caches **MUST** be invalidated.

---

## 9. Account Bindings (CAIP-10)

Where `identity.id` denotes a **chain account**:

* The value **MUST** be CAIP-10.
* CAIP-10 in v1 **MUST** be used as account binding (proof-of-control) only, not as a signing ID for Arky JWS.
* Proof of control **MUST** be demonstrated either by:

  1. a signature from the account over a binding challenge referencing the provider's ID, or
  2. a DID/registry record that asserts control of the CAIP-10 account, signed by the identity and verifiable to the same Key Set.
* Notaries/Settlers **MUST** refuse actions that rely on unproven account bindings.

**Note:** Use of CAIP-10 as signer ID for Arky JWS is earmarked for v2 consideration.

---

## 10. Delegation

* A service key **MAY** act for a DID only if delegation is explicitly declared in either:
  - DID document relationships, or
  - Discovery descriptor
* Delegation **MUST** be allowed by Policy Pack before service key actions are accepted.
* Verifiers **MUST** validate delegation chains and ensure delegation is still active and authorized.

---

## 11. TIM Field Semantics

In TIM Core:

* `identity.id`: *required*; **MUST** be resolvable under §3.
* `identity.claims`: optional; **MAY** list credential references; verifiers **MUST** treat them as hints unless profiles mandate checking.
* `identity.proofs`: optional; **MAY** carry auxiliary attestations (e.g., device/os attestation). Contents **MUST** not be required for basic signature verification unless a Profile or Policy Pack requires them.

---

## 12. Discovery Interaction

* Providers **SHOULD** list identity methods and key endpoints in their Discovery **ServiceDescriptor**.
* The Keys endpoint defined by Discovery **MUST** be authoritative for JWK identities.
* Descriptor signatures **MUST** themselves verify under this spec.

---

## 13. Privacy & Minimization

* Identity material in public artifacts **MUST NOT** include PHI/PII.
* DID Documents and JWKS **SHOULD** contain only necessary verification methods; avoid surplus metadata.
* Logs and error envelopes **MUST NOT** contain private keys or raw secrets.

---

## 14. Error Mapping

| ARKY-ERROR Code        | Condition                                 | Retry Hint                     |
| ----------------------- | ----------------------------------------- | ------------------------------ |
| `keys.unknown_id`      | `kid` not found after re-resolve          | No retry (permanent failure)   |
| `discovery.key_mismatch` | Key mismatch between sources              | Re-resolve once               |
| `keys.revoked`          | Key revoked                               | No retry (permanent failure)   |
| `common.unavailable`    | Service temporarily unavailable           | Exponential backoff          |
| `tim.invalid_signature` | Signature verification failed             | No retry (permanent failure)   |

---

## 15. Conformance

* **I1 — Publisher:** serves valid Key Sets; supports rotation; publishes revocations; Discovery entries accurate.
* **I2 — Verifier:** resolves per §4; enforces `kid` rules; verifies signatures; honors revocation/TTL; enforces Policy Pack method allow-lists.
* **I3 — Account Binding:** validates CAIP-10 bindings where used; rejects unproven bindings.

Claims of `ARKY-IDENTITY-BINDINGS-v1 I1/I2/I3` require passing Foundation vectors.

---

## 16. Constraints Table *(Informative)*

| Area            | MUST                                       | SHOULD                             |
| --------------- | ------------------------------------------ | ---------------------------------- |
| Methods         | did:web, did:key, JWK, X.509 (per policy) | restrict via Policy Pack           |
| JWS            | `alg=EdDSA`; `kid` uniquely selects a key  | DID `kid` uses `<did>#<fragment>`  |
| Resolution      | HTTPS/TLS 1.3; cache with ETag/TTL         | bounded TTL per policy             |
| Rotation        | overlapping keys; multiple active `kid`s   | announce rotations via Discovery   |
| Revocation      | immediate invalidation on detection        | signed revocation lists for JWK   |
| CAIP-10 binding | proof of control required                  | publish registry-based assertions |
| Privacy         | no PHI/PII; minimal metadata               |                                    |

---

## 17. Quick Reference (Informative)

| Scheme | Example | Key Fields | Resolution |
|---|---|---|---|
| **did:web** | `did:web:example.com:users:alice` | `kid` in JWK, JWS verification | HTTP GET to `/.well-known/did.json` |
| **did:key** | `did:key:z6M...` | Multibase encoded public key | Local verification, no network |
| **CAIP-10** | `caip10:ethereum:1:0xab...` | `chain_id` + `address` | Chain-specific resolution |
| **account** | `acct:ach:us:ban:123456` | Namespace + identifier | Registry lookup |

**Key Rules:**
- `identity.id` MUST be resolvable to public key(s)
- `identity.claims[]` use URN format (VCs, certs)
- Signature verification: JWS over JCS canonical_bytes
- `kid` selection: exact match → first compatible → error
- Account binding requires proof of control signature

**Common Algorithms:** Ed25519 (`EdDSA`), secp256k1 (`ES256K`), P-256 (`ES256`)

---

## 17. Versioning & Governance

**Spec ID:** `ARKY-IDENTITY-BINDINGS-v1`. Changes follow RFC; backwards compatibility **RECOMMENDED**. New methods require registry admission and vectors.