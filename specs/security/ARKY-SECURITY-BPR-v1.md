---

spec_id: ARKY-SECURITY-BPR-v1
title: Arky — Security & Key Management Best Practices
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-DISCOVERY-v1
  - ARKY-NOTARY-v1
  - ARKY-SETTLERS-v1
  - ARKY-REGISTRIES-v1
  - ARKY-POLICY-PACKS-v1
  - ARKY-ERRORS-v1
summary: >
  Defines minimum cryptographic baselines, key classes, rotation and storage
  practices, hardening requirements, privacy protections, secure time, and
  incident handling for Arky implementations (TIM issuers, Notaries, Settlers,
  Registries, Policy providers).
links:
  governance: https://arky.foundation/specs/governance/ARKY-GOVERNANCE-v1
  rfcs: https://arky.foundation/rfcs/
  vectors: https://arky.foundation/vectors/
  security: https://arky.foundation/security/
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public review and conformance vectors
authors:
  - Arky Foundation Security WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/security/ARKY-SECURITY-BPR-v1
last_updated: 2025-10-15

---

# Arky — Security & Key Management Best Practices (v1)

**All sections are normative unless labeled *Informative*.**

## Executive Summary *(Informative)*

Mandatory security baseline for all Arky implementations: cryptography, key management, transport, and operations.

**Core Requirements:**
- Ed25519 signatures, SHA-256 hashing, TLS 1.3 transport (§3)
- Key classes with defined lifetimes and rotation policies (§4-5)
- Secure time sources, witness independence, privacy controls (§6-8)
- Monitoring, incident response, supply chain security (§10-12)

**Conformance Levels:** -BPR1 (baseline) → -BPR2 (hardened) → -BPR3 (high assurance)

**Quick Start:** Use approved algorithms (§3), implement key rotation (§5), enable TLS 1.3 (§9), add monitoring (§11).

## 1. Scope

Requirements for all Arky roles: TIM issuers, Notaries, Settlers, Registry/Policy publishers, and Discovery providers. Covers cryptographic baselines, key classes/lifetimes, storage/rotation, transport security, secure time & ordering, witness independence, privacy controls, hardening, monitoring, and incident response.

**Referenced By:**
- [ARKY-KEYS-v1](ARKY-KEYS-v1.md) — Key discovery (references §3 for algorithms)
- [ARKY-REVOCATIONS-v1](ARKY-REVOCATIONS-v1.md) — Revocation lists (references §12 for incident response)
- [ARKY-VC-BINDINGS-v1](ARKY-VC-BINDINGS-v1.md) — VC proofs (references §3 for signatures, §8 for privacy)
- [ARKY-ATTESTATIONS-v1](ARKY-ATTESTATIONS-v1.md) — Attestation results (references §3 for signatures, §8 for privacy)

## 2. Threat Model *(Informative)*

Adversaries include network interceptors, key theft (hot/warm/cold), malicious insiders, supply-chain attackers (build/signing), replay/back-dating manipulators, ledger reorgs, and data leakage (logs/anchors/telemetry).

## 3. Cryptographic Baseline

All Arky components **MUST** implement these cryptographic requirements. Individual specs reference this section rather than duplicating algorithm requirements.

### 3.1 Required Algorithms

* **Signatures:** Ed25519/EdDSA (JWS `alg=EdDSA`) **MUST** be supported for all signatures
* **Hashing:** SHA-256 **MUST** be supported; BLAKE3-256 **MAY** be supported where explicitly allowed
* **Transport:** TLS 1.3 **MUST** be used; cipher suites **MUST** include AEAD (AES-GCM or ChaCha20-Poly1305)
* **Randomness:** Platform CPRNG/DRBG **MUST** be used; custom seeding **MUST NOT** occur

### 3.2 Prohibited Algorithms

* Legacy RSA-PKCS#1 v1.5 **MUST NOT** be used
* TLS 1.2 and earlier **MUST NOT** be used
* Deprecated JWS algorithms (RS256, HS256, etc.) **MUST NOT** be accepted

### 3.3 JWS/JWE Requirements

* JWS protected header **MUST** set `"alg":"EdDSA"`
* `"kid"` **SHOULD** reference a discoverable key (see [ARKY-KEYS-v1](ARKY-KEYS-v1.md))
* Arky artifact signatures use a **detached payload** (RFC 7797): the protected header **MUST** set `"b64":false` and list `"b64"` in `"crit"` (see [ARKY-TIM-Canonicalization-v1](../core/ARKY-TIM-Canonicalization-v1.md) §5). Verifiers **MUST** support this `b64:false`/`crit:["b64"]` combination and **MUST** reject any other non-default `"b64"` value or unrecognized `"crit"` member.
* Unknown or unsupported `alg` values **MUST** be rejected

## 4. Key Classes & Lifetimes

Implementations **MUST** classify keys and meet or exceed:

| Key Class                 | Purpose                                  | Storage     | Lifetime (Max) | Rotation (Min) |
| ------------------------- | ---------------------------------------- | ----------- | -------------- | -------------- |
| Issuer Signing (TIM)      | Sign `sig` on TIM receipts               | HSM/TEE/KMS | 365 days       | 90 days        |
| Notary Witness            | Sign witness entries & anchors           | HSM/TEE/KMS | 365 days       | 90 days        |
| Registry/Policy Publisher | Sign registries & packs                  | HSM/TEE/KMS | 365 days       | 90 days        |
| Settler Rail Keys         | Execute on rails (chains/banks/hardware) | HSM/MPC/TEE | 180 days       | 60 days        |
| Server TLS                | HTTPS transport                          | HSM/KMS     | 397 days       | 60–90 days     |
| API Keys/OAuth Secrets    | Service-to-service                       | Vault/KMS   | 90 days        | 30 days        |

* Hot keys **MUST** be rate-limited and monitored.
* High-value rail keys **SHOULD** use threshold/MPC (≥2-of-3) or custody segregation per Policy Packs.
* Test/staging keys **MUST NOT** be reused in production.

## 5. Key Generation, Storage, Rotation

* Keys **MUST** be generated in **FIPS 140-2/3 validated** (or equivalent) modules where available, or via platform CPRNG with immediate import to secure storage.
* Private keys **MUST** be non-exportable where hardware permits; if exportable, they **MUST** be at-rest encrypted with strict access controls.
* Rotation **MUST** be zero-downtime via overlapping validity (multiple active `kid`s) and **MUST** publish updated JWKS at `/.well-known/arky-keys`.
* Suspected/confirmed compromise **MUST** trigger immediate revocation (see §12).

## 6. Secure Time & Ordering

* Time sources **MUST** be secured: at least two of authenticated NTP/NTS, Roughtime, GNSS with anti-spoof.
* Implementations **MUST** enforce bounded skew policies; receipts beyond policy **MUST** be quarantined (see Notary ordering rules).
* Offline contexts **SHOULD** carry Lamport counters (`time.ordering.lamport`) and **MUST** merge deterministically on reconciliation.

## 7. Witness Independence (Notary)

* Multiple witnesses on the same receipt **SHOULD** be operationally independent (separate keys, infra, admin domains).
* Policies **MUST** state minimum witness counts/classes; Notaries **MUST** publish the active policy via Discovery descriptors.
* Cross-witness correlation risks **SHOULD** be mitigated (staggered batching, independent time sources).

## 8. Privacy & Data Handling

* PHI/PII **MUST NOT** appear in public anchors or Discovery/Registry payloads.
* Selective-disclosure mechanisms (e.g., SD-JWT/BB+) **SHOULD** be used where identity attributes are asserted.
* Logs **MUST NOT** contain secrets, raw private material, or unnecessary identifiers; public transparency logs **MUST** include only hashes/CIDs.
* Residency/retention **MUST** follow the bound Policy Pack; deletions **MUST** leave audit-safe tombstones (no sensitive content).

## 9. Transport & Interface Security

* All Arky endpoints **MUST** serve HTTPS/TLS 1.3; HTTP/2 or HTTP/3 **SHOULD** be enabled; **HSTS SHOULD** be enabled.
* mTLS or OAuth2 **SHOULD** protect service-to-service calls; API keys **MUST** be scoped and rotated.
* Rate limits and body-size limits **MUST** be enforced on submit/execute endpoints; duplicate submissions **MUST** be deduplicated by `cid`/idempotency key.
* Content types **MUST** be validated; JSON parsers **MUST** reject duplicate keys and non-finite numbers.

## 10. Hardening & Supply Chain

* Reproducible builds and BOMs **SHOULD** be produced; release artifacts **SHOULD** be signed (e.g., sigstore).
* Secure/measured boot **SHOULD** be enabled on servers/appliances; workload attestation (TPM/TEE) **MAY** be verified for high-risk roles.
* Secrets scanning **MUST** gate commits; dependency pinning and vulnerability remediation SLAs **MUST** be defined (critical ≤7 days).
* Memory-safe languages (Rust/Go) **SHOULD** be preferred; unsafe FFI **MUST** be minimized/audited.

## 11. Monitoring, Alerts, and Auditing

* Key events (generation/rotation/revocation), policy changes, witness activity, anchoring cadence/finality, and settler executions **MUST** be logged immutably.
* Anomaly detection **SHOULD** alert on: unusual witness rates, finality stalls, reorg sizes, duplicate `cid`s, excessive retries, and API abuse.
* Time drift **MUST** be monitored; quarantine rates **SHOULD** be reported.
* Audit logs **SHOULD** be periodically anchored (hash-only) to a Notary.
* Error responses **MUST** use the ARKY-ERROR-v1 envelope and taxonomy.

## 12. Incident Response & Revocation

* Security incidents **MUST** follow Governance PIRT with triage ≤72h.
* Compromised keys **MUST** be revoked by: (a) publishing a signed revocation list, (b) removing affected `kid`s from JWKS, (c) rotating to fresh keys, and (d) notifying via provider Index/Descriptor.
* Post-incident reports **MUST** document scope, affected specs/versions, and remediation timelines.

## 13. Component-specific Requirements

**TIM Issuers**

* Canonicalization **MUST** precede signing; `cid` **MUST** match canonical bytes.
* Nonce/expiry **SHOULD** be used to prevent replay; journals **SHOULD** be linear per scope.

**Notaries**

* Batch size/dwell **MUST** be bounded; finality depths **MUST** be enforced per Policy Packs.
* Reorgs < finality **MUST** trigger re-anchor; ≥ finality **MUST** trigger remediation per policy.
* Inclusion proofs **MUST** be retained; anchors **MUST** be externally verifiable.

**Settlers**

* Idempotency keys **MUST** be honored; irreversible rails **MUST** implement compensating actions where policy permits.
* Custody segregation **MUST** be enforced; high-value rails **SHOULD** use MPC/threshold control.
* XR hashes **SHOULD** be anchored for audit.

**Registries/Policies**

* Snapshots **MUST** be signed and versioned; aliases **MUST NOT** create cycles.
* Discovery descriptors **MUST** reflect current capabilities and supported spec levels.

## 14. Constraints Matrix *(Informative)*

| Area             | MUST                                         | SHOULD                      |
| ---------------- | -------------------------------------------- | --------------------------- |
| Crypto baseline  | Ed25519, SHA-256, TLS 1.3                    | BLAKE3-256 where permitted  |
| Key mgmt         | HSM/TEE/KMS; rotation; JWKS updates          | MPC for high-value rails    |
| Time             | secure sources; bounded skew; quarantine     | Roughtime/GNSS diversity    |
| Witnessing       | independence policy; quorum enforcement      | staggered batching          |
| Privacy          | no PHI/PII in public artifacts               | selective disclosure        |
| Transport        | HTTPS; limits; strict JSON parsing           | mTLS/OAuth2; HSTS           |
| Supply chain     | secrets scans; CVE remediation SLAs          | BOM + signed artifacts     |
| Monitoring/Audit | immutable logs of key/anchor/execute events  | anchor audit hashes         |
| Incidents        | revocation lists; JWKS removal; notification | post-incident public report |

## 15. Conformance

| Level | Requirements |
|---|---|
| **-BPR1** | Baseline: §§3–5 (crypto/keys), §8 (privacy), §9 (transport), §11 (basic monitoring), ARKY-ERROR-v1 |
| **-BPR2** | Hardened: -BPR1 + §§10–11 (full hardening/monitoring), audit anchoring, service-to-service auth |
| **-BPR3** | High Assurance: -BPR2 + MPC/threshold signing, attested workloads, external anchor verification |

Claims require passing Foundation security vectors and publishing a controls statement.

## 16. Versioning & Governance

**Spec ID:** `ARKY-SECURITY-BPR-v1`. Changes follow the Governance RFC process; backwards compatibility **RECOMMENDED**. Emergency security updates may be fast-tracked per PIRT.