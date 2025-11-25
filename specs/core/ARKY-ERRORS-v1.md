---

spec_id: ARKY-ERRORS-v1
title: Arky — Error Model & Codes
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-NOTARY-v1
  - ARKY-SETTLERS-v1
  - ARKY-DISCOVERY-v1
  - ARKY-REGISTRIES-v1
  - ARKY-POLICY-PACKS-v1
summary: >
  Defines a uniform error envelope, code taxonomy, transport bindings, retry hints,
  and conformance levels for all Arky components (TIM, Notary, Settlers, Discovery, Registries, Policy Packs).
links:
  vectors: https://arky.foundation/specs/development/ARKY-VECTORS-v1
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public vectors
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/core/ARKY-ERRORS-v1
last_updated: 2025-10-15

---

# Arky — Error Model & Codes (v1)

**All sections are normative unless labeled *Informative*.**

## 1. Scope

Provides a single wire format for errors, a stable code taxonomy, required metadata, retry signaling, privacy rules, and transport mappings for HTTP/gRPC. Applies to server and client diagnostics across TIM, Notary, Settlers, Discovery, Registries, and Policy Packs.

---

> See error examples in `examples/flows/settler-execution.md` and throughout this spec.

---

## 1.1 Error Response Example

**Settler insufficient funds error:**
```json
{
  "type": "https://arky.foundation/specs/core/ARKY-SETTLERS-v1#insufficient-funds",
  "code": "settler.insufficient_funds",
  "title": "Insufficient Funds",
  "detail": "Balance 100 USD, required 255 USD (250 amount + 5 fee)",
  "status": 422,
  "severity": "error",
  "retry": { "policy": "after", "after_ms": 300000 },
  "context": { "rail": "arky:rail/ach:us@v1", "required": 255, "available": 100 },
  "ts": "2025-10-15T14:30:05Z"
}
```

---

## 2. Terminology

* **Error Envelope (EE):** Canonical JSON structure carried on error responses.
* **Error Code:** Stable, namespaced identifier (e.g., `notary.anchor_reorg`).
* **Retry Hint:** Machine-readable guidance for clients on when/how to retry.

## 3. Error Envelope (EE)

All Arky services **MUST** return the EE on failure. The EE is JCS-serializable JSON.

```
ErrorEnvelope := {
  type: string,            // required; URN or URL of spec section or RFC; MAY be "about:blank"
  code: string,            // required; namespaced error code (see §5)
  title: string,           // required; short, stable summary of the error class
  detail?: string,         // optional; human-readable; MUST NOT contain PHI/PII
  status?: integer,        // optional; HTTP status mapping (see §6)
  instance?: string,       // optional; stable id for this occurrence (e.g., trace id)
  severity: "error"|"fatal"|"warning", // required
  retry?: RetryHint,       // optional; see §4
  context?: object,        // optional; machine fields (e.g., target, rail, verb); no secrets
  causes?: [CauseRef],     // optional; linked lower-level errors (see below)
  ts: RFC3339              // required; server timestamp when EE was produced
}

RetryHint := {
  policy: "never"|"immediate"|"after"|"exponential", // required
  after_ms?: integer,        // required if policy="after"
  max_attempts?: integer,    // optional
  jitter?: boolean           // optional
}

CauseRef := {
  code: string,              // required; namespaced code
  detail?: string            // optional; sanitized
}
```

**Rules**

* `code` **MUST** be from the taxonomy in §5 or an approved extension (RFC).
* `detail` and `context` **MUST NOT** include PHI/PII, secrets, or raw keys.
* EE **MUST** be UTF-8 JSON; unknown EE fields **MUST** be ignored by clients.

## 4. Retry Semantics

* If omitted, clients **MUST** treat as `policy="never"`.
* Servers **MUST** choose conservative hints; irreversible rails **MUST** set `policy="never"` after finality.
* Clients **MUST** back-off at least exponentially when `policy="exponential"`.

## 5. Error Code Taxonomy

Codes are lowercase with dot-namespacing: `<namespace>.<slug>`. New codes **MUST** be added via RFC with vectors and mapped to status (§6). Breaking semantic changes **MUST** version the code as `<slug>@v2`.

**Summary:** 73 total error codes across 8 namespaces (10 common, 7 TIM, 6 keys/discovery, 9 kernel, 15 notary, 20 settler, 6 registry/policy, 2 vectors).

**Table Format:** Code | HTTP | Retry | Description

### 5.1 Common (`common.*`)

| Code | HTTP | Retry | Description |
|---|---|---|---|
| `common.invalid_argument` | 400 | never | Malformed request, invalid JSON, type mismatch |
| `common.unauthorized` | 401 | never | Missing or invalid authentication |
| `common.forbidden` | 403 | never | Authenticated but not authorized |
| `common.not_found` | 404 | never | Resource not found |
| `common.conflict` | 409 | never | Resource conflict (e.g., duplicate key) |
| `common.too_many_requests` | 429 | after | Rate limit exceeded |
| `common.unavailable` | 503 | exponential | Service temporarily unavailable |
| `common.deadline_exceeded` | 504 | exponential | Request timeout |
| `common.internal_error` | 500 | exponential | Unexpected server error |
| `common.not_implemented` | 501 | never | Feature not implemented |

### 5.2 TIM / Canonicalization (`tim.*`)

| Code | HTTP | Retry | Description |
|---|---|---|---|
| `tim.cid_mismatch` | 400 | never | Provided cid doesn't match canonical_bytes hash |
| `tim.invalid_signature` | 400 | never | Signature verification failed |
| `tim.missing_required` | 400 | never | Required field absent (e.g., unit for numeric value) |
| `tim.unit_missing` | 400 | never | Numeric value without unit |
| `tim.privacy_violation` | 400 | never | PHI/PII in public anchor material |
| `tim.schema_mismatch` | 400 | never | TIM doesn't conform to schema |
| `tim.expired` | 422 | never | TIM past expiry timestamp |

### 5.3 Discovery / Keys (`discovery.*`, `keys.*`)

| Code | HTTP | Retry | Description |
|---|---|---|---|
| `discovery.unsupported_level` | 501 | never | Requested conformance level not supported |
| `discovery.unverified_descriptor` | 400 | never | Descriptor signature invalid |
| `discovery.key_mismatch` | 400 | never | Key doesn't match identity |
| `keys.revoked` | 403 | never | Key has been revoked |
| `keys.expired` | 403 | never | Key expired |
| `keys.unknown_id` | 401 | never | Key ID not found |

### 5.4 Kernel (`kernel.*`)

| Code | HTTP | Retry | Description |
|---|---|---|---|
| `kernel.parse_error` | 400 | never | Assertion expression parse error |
| `kernel.unknown_function` | 400 | never | Assertion function not recognized |
| `kernel.unknown_unit` | 400 | never | Unit not in registry |
| `kernel.policy_denied` | 403 | never | Policy rejected commitment |
| `kernel.unauthorized` | 401 | never | Actor not authorized for scope |
| `kernel.conflict` | 409 | never | Verb conflict detected |
| `kernel.approval_missing` | 422 | after | Two-person approval not met |
| `kernel.invalid_signature` | 400 | never | Commitment signature invalid |
| `kernel.verb_conflict` | 409 | never | Multiple verbs conflict on same resource |

### 5.5 Notary (`notary.*`)

| Code | HTTP | Retry | Description |
|---|---|---|---|
| `notary.witness_quorum_failed` | 422 | never | Insufficient witnesses for quorum |
| `notary.anchor_reorg` | 409 | immediate | Anchor reorganized before finality |
| `notary.finality_unmet` | 202 | after | Finality depth not yet reached (transient) |
| `notary.unsupported_target` | 501 | never | Target chain not configured |
| `notary.ordering_violation` | 422 | never | Lamport counter regression |
| `notary.journal_fork` | 409 | never | Fork detected in causal chain |
| `notary.policy_violation` | 403 | never | TIM violates Policy Pack constraints |
| `notary.rate_limited` | 429 | after | Rate limit exceeded |
| `notary.duplicate` | 409 | never | CID already witnessed (idempotent) |
| `notary.quota_exceeded` | 429 | after | Storage or batch quota exceeded |
| `notary.skew_quarantine` | 422 | never | Timestamp outside acceptable skew |
| `notary.anchor_pending` | 202 | after | Anchor not yet finalized (transient) |
| `notary.finality_violated` | 500 | never | Reorg after finality (critical) |
| `notary.proof_invalid` | 400 | never | Inclusion proof verification failed |
| `notary.unsupported_alg` | 501 | never | Unknown Merkle tree algorithm |

### 5.6 Settlers (`settler.*`)

| Code | HTTP | Retry | Description |
|---|---|---|---|
| `settler.unknown_verb` | 400 | never | Verb not in registry |
| `settler.unsupported_rail` | 400 | never | Rail unknown or doesn't support verb |
| `settler.invalid_args` | 400 | never | Verb args fail schema validation |
| `settler.policy_denied` | 403 | never | Policy gate rejection (KYC/sanctions/export) |
| `settler.insufficient_funds` | 422 | after | Balance < amount + fee |
| `settler.counterparty_reject` | 422 | never | Recipient rejected transaction |
| `settler.timeout` | 504 | exponential | Rail response timeout |
| `settler.rate_limited` | 429 | after | Rate limit exceeded |
| `settler.finality_unmet` | 500 | never | Anchor reorg >= finality depth (catastrophic) |
| `settler.anchor_reorg` | 409 | immediate | Anchor reorg < finality, refresh needed |
| `settler.irreversible` | 422 | never | Rail doesn't support rollback |
| `settler.rollback_window_closed` | 422 | never | Rollback attempted after window closed |
| `settler.deadline_exceeded` | 422 | never | Current time > verb deadline |
| `settler.rail_unavailable` | 503 | exponential | Rail health check failed |
| `settler.auth_failed` | 401 | never | Commitment signature invalid or unauthorized |
| `settler.quota_exceeded` | 429 | after | Actor usage quota exceeded |
| `settler.prior_verb_failed` | 424 | never | Earlier verb in batch failed |
| `settler.no_compensation_available` | 501 | never | No compensation verb for this type |
| `settler.partial_execution` | 207 | never | Multi-verb request partially succeeded |
| `settler.idempotency_conflict` | 409 | never | Idempotency key conflict |

### 5.7 Registries / Policy Packs (`registry.*`, `policy.*`)

| Code | HTTP | Retry | Description |
|---|---|---|---|
| `registry.unknown_urn` | 404 | never | URN not found in registry |
| `registry.alias_cycle` | 400 | never | Circular alias reference detected |
| `registry.schema_mismatch` | 400 | never | Registry entry doesn't match schema |
| `policy.pack_invalid` | 400 | never | Policy Pack malformed or invalid |
| `policy.forbidden_override` | 403 | never | Override not allowed by Pack |
| `policy.unresolvable_pack` | 404 | never | Policy Pack reference not found |

### 5.8 Vectors (`vectors.*`)

| Code | HTTP | Retry | Description |
|---|---|---|---|
| `vectors.test_failed` | 422 | never | Vector test assertion failed |
| `vectors.unsupported_case` | 501 | never | Vector case not supported by implementation |

## 6. Transport Bindings

### 6.1 HTTP

Response **MUST** set HTTP status per §5 tables and include EE as JSON body (`application/json`).

**Additional requirements:**
- **MUST** set `Retry-After` header when `retry.policy="after"`
- **SHOULD** set `Retry-After` when `retry.policy="exponential"` (with backoff calculation)
- **MUST** set `Content-Type: application/json`
- **MAY** include `X-Request-ID` matching EE `instance` for tracing

### 6.2 gRPC

Map error codes to canonical gRPC status codes; EE **MUST** be attached in trailers/metadata under `arky-error-bin` (base64-encoded JSON).

## 7. Privacy & Redaction

* PHI/PII, secrets, private keys, and raw signatures **MUST NOT** appear in `detail`/`context`.
* If redaction occurs, servers **MUST** retain full diagnostics internally and may include a sanitized `causes[]`.

## 8. Determinism & Canonicalization

* EE **MUST** be JCS-serializable for hashing if anchored; however, EE **MUST NOT** be publicly anchored by default.
* If an implementation anchors EEs (policy-specific), only the EE hash **MAY** be anchored.

## 9. Conformance

* **E1 — Envelope:** Emits EE with required fields; correct status mapping.
* **E2 — Taxonomy:** Uses only registered codes or approved extensions; provides retry hints where relevant.
* **E3 — Transport:** Correct HTTP/gRPC bindings; sets `Retry-After` when applicable; includes `instance` for traceability.

Claims of `ARKY-ERRORS-v1 E1/E2/E3` require passing vectors.

## 10. Constraints Table (Informative)

| Area      | MUST                                       | SHOULD                                |
| --------- | ------------------------------------------ | ------------------------------------- |
| Envelope  | `type, code, title, severity, ts` present  | `instance` correlation id             |
| Codes     | registered taxonomy; RFC for new codes     | version codes on semantic change      |
| Retry     | conservative hints; irreversible → `never` | `Retry-After` header where applicable |
| Privacy   | no PHI/PII/secrets in EE                   | sanitized `causes[]`                  |
| Transport | HTTP status mapping; JSON body             | gRPC metadata with EE                 |

## 11. Versioning & Governance

**Spec ID:** `ARKY-ERRORS-v1`. Changes via RFC with public vectors; backwards compatibility **RECOMMENDED**. New codes require: semantics, status mapping, retry policy, and vectors.