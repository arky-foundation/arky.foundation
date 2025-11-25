---
spec_id: ARKY-SDK-v1
title: Arky — SDK Requirements & Conformance
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-NOTARY-v1
  - ARKY-SETTLERS-v1
  - ARKY-REGISTRIES-v1
  - ARKY-POLICY-PACKS-v1
  - ARKY-VECTORS-v1
summary: >
  Defines mandatory API surface, behavioral requirements, and conformance testing
  for official Arky SDKs (TypeScript, Go, Rust). Ensures deterministic operations,
  policy enforcement, and cross-language interoperability.
links:
  vectors: https://arky.foundation/specs/development/ARKY-VECTORS-v1
  examples: https://arky.foundation/specs/development/ARKY-EXAMPLES-v1
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public vectors
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/development/ARKY-SDK-v1
last_updated: 2025-10-15
---

# Arky — SDK Requirements & Conformance (v1)

**All sections are normative unless labeled *Informative*.**

---

## 1. Scope

This specification defines requirements for **official Arky SDKs** in TypeScript, Go, and Rust:

* **API Surface** (§4): Required modules and functions
* **Behavioral Guarantees** (§5): Determinism, validation pipeline, security
* **Conformance Levels** (§6): L1 (Core), L2 (Network), L3 (Full)
* **Testing Requirements** (§7): Vector compliance and CI obligations
* **Language-Specific Notes** (§8): Platform constraints and optimizations

**Out of scope:** UI components, CLIs, storage backends, business policy UX.

---

## 2. Target Languages & Runtimes

* **Languages:** TypeScript, Go, Rust (official). Others may mirror this spec.
* **Determinism:** All canonicalization/signature functions **MUST** be pure and locale-independent.
* **Crypto:** Ed25519 (JWS), SHA-256 (Multihash), Base58-BTC as defined by linked specs.
* **Encoding:** UTF-8 everywhere.

---

## 3. Data & Terms (References)

* **TIM** and **TIM Canonicalization**: per ARKY-TIM-v1 and ARKY-TIM-Canonicalization-v1
* **CID**: Base58-BTC(Multihash(SHA-256, canonical_bytes))
* **Execution Receipt (XR)**: per ARKY-SETTLERS-v1
* **AnchorObject**: per ARKY-NOTARY-v1
* **Policy Pack**: per ARKY-POLICY-PACKS-v1
* **Registries & Verbs**: per ARKY-REGISTRIES-v1

---

## 4. Required Modules & API Surface

Each SDK **MUST** provide these modules (names are conceptual; languages may adapt idiomatically):

### 4.1 `tim`

* `canonicalizeTim(body) -> canonical_bytes` — JCS per TIM-Canonicalization
* `computeCid(canonical_bytes) -> cid`
* `signTim(canonical_bytes, signing_key, kid?) -> jws_compact`
* `assembleTim(body, cid, sig) -> tim`
* `verifyTim(tim, jwks) ->  , errors[] `
* `lintTim(tim, policy) ->  , errors[] ` — units, method presence, privacy
* `validateProfiles(tim, profile_ids[]) ->  , errors[] `

**Requirements:** Reject non-finite numbers; forbid `null` placeholders; produce identical bytes across stacks.

### 4.2 `commitments`

* `canonicalize(body) -> canonical_bytes`
* `computeCid(canonical_bytes) -> cid`
* `sign(canonical_bytes, signing_key, kid?) -> jws_compact`
* `verify(commitment, jwks) ->  , errors[] `
* `evaluate(commitment, effective_policy, registries, tim_fetcher) -> Plan`

**Plan (logical contract):**
* `status`: `PASS | FAIL`
* `selected[]`: list of `{verb, rail?, args, idempotency_key}`
* `notary?`: `{targets[], deadline?, lamport?}`

### 4.3 `policy`

* `resolveEffectivePolicy(pack_ids[]) -> effective_policy` — root + overlays; most-restrictive
* `validateAgainstPolicy(object, effective_policy) ->  , errors[] `
* `claimHints(effective_policy, hints) -> hints` — min witnesses, finality

### 4.4 `registries`

* `fetchRegistry(namespace) -> registry_doc` — JWS-verified; cache by cid/ETag
* `resolveUrn(alias_or_urn) -> urn`
* `getVerbSchema(verb_urn) -> json_schema`

### 4.5 `discovery`

* `fetchKeys(base_url) -> jwks`
* `fetchIndex(base_url) -> index` — well-known endpoints
* `fetchDescriptor(url, jwks) -> descriptor` — JWS-verified, cid-pinned
* `selectServices(descriptors, required_levels) -> {notaries[], settlers[]}`

### 4.6 `notaryClient`

* `submit(tim_or_cid, canonical_bytes, options) ->  cid, witness_sig, batch_id `
* `status(cid) ->  cid, anchors[], order_index `
* `proof(cid) ->  cid, anchor `
* `policy() -> active_policy`

**Behavior:** Idempotent by `cid`; exponential backoff; respect Policy Pack finality.

### 4.7 `settlerClient`

* `execute(commitment_id, calls[], effective_policy) ->  xrs[] `
* `status(commitment_id) -> execution_state`
* `xr(cid) -> execution_receipt`

**Behavior:** Propagate idempotency keys; retries per rail semantics.

### 4.8 `canonicalization`

* JCS serialization, `cid` computation, JWS Ed25519 sign/verify

### 4.9 `assertions`

* Parse/evaluate Assertions v1; unit conversions via registries; tri-state results

### 4.10 `errors`

* Standard error codes per ARKY-ERRORS-v1; all APIs **MUST** return `{ok:false, code, message, details?}` on failure

**Module independence:** Each module **MUST** be shippable independently (tree-shakable or feature-gated).

---

## 5. Behavioral Guarantees

### 5.1 Validation Pipeline (Ordered)

Implementations **MUST** follow this sequence when evaluating a commitment:

1. Verify commitment signature and `cid`
2. Resolve **Effective Policy** (Root + overlays); clamp hints
3. Fetch and verify referenced TIM receipts (T1/T2/T3 as required)
4. Validate Profiles (if declared)
5. Evaluate assertions → compute `PASS/FAIL`
6. Validate verbs against Registries and Policy (allow-lists, limits)
7. Produce `Plan` with idempotency keys and optional Notary targets

### 5.2 Determinism

* **Canonicalization/signature functions:** Pure, locale-independent, bit-for-bit identical across OS/CPU
* **Time sources:** Overridable for testing
* **No silent fallback:** Unsupported algorithms/targets/verbs **MUST** error with registered codes
* **Assertion evaluation:** Deterministic across same language build

### 5.3 Caching

* **MUST** cache: keys, registries, descriptors, policy packs using ETag/TTL
* **MUST** be invalidatable
* Caches **MUST** be configurable with TTL/size limits

### 5.4 Security Defaults

* **HTTPS required** for all network operations
* **Signature verification on by default**
* **Refuse unsigned descriptors/registries**
* **Constant-time verification** where feasible
* **Key rotation support** (multiple `kid`s active)
* **No PHI/PII in public anchors** or error details

### 5.5 Idempotency

* Provide helper to derive idempotency keys from `(commitment_id, verb, args)`
* `notaryClient.submit` and `settlerClient.execute` **MUST** be idempotent given same key(s)

### 5.6 Concurrency & Backpressure

* Async/non-blocking APIs where language allows
* Default HTTP timeouts and retry policy **MUST** be documented
* Bounded in-flight request concurrency **REQUIRED** with sane defaults

---

## 6. Conformance Levels

SDK distribution **MUST** declare the highest level passed (per language build):

### Level 1 (L1) — Core

**Modules:** `tim` (T1/T2), `canonicalization` (C1/C2), `errors`, `registries` (read-only), basic `assertions` parsing/eval without series functions

**Capabilities:**
* Create/parse/validate TIM objects against ARKY-TIM-v1 schema
* Enforce required fields and numeric/unit rules
* JCS serialization, `cid` computation, JWS Ed25519 sign/verify
* Construct/parse ARKY-ERRORS-v1 envelopes

**Vectors:** Must pass TIM (T1/T2), Canonicalization (C1/C2)

### Level 2 (L2) — Network

**Modules:** L1 + `discovery` (D1/D2), `notary` client with inclusion-proof verify, `assertions` with series/convert, `policy` bind/read

**Capabilities:**
* Resolve Well-Known endpoints, fetch/verify ServiceDescriptors
* Notary client for Submit/Status/Proof; batch inclusion-proof verification
* Parse/evaluate Assertions v1; unit conversions via registries
* Bind and cache Policy Packs

**Vectors:** Must pass L1 + Discovery (D1/D2), Notary (N1/N2), Assertions

### Level 3 (L3) — Full

**Modules:** L2 + `settlers` client (S1/S2 semantics), XR verification/anchoring helpers, Policy enforcement hooks, DTN ordering verification

**Capabilities:**
* Settler client for Execute/Status/XR fetch; XR verification; rollback window logic
* Policy enforcement hooks for Notary/Settler clients
* Multi-anchor helpers with finality depth checking
* DTN ordering verification for Notary proofs

**Vectors:** Must pass L2 + Settlers (S1/S2/S3), Notary (N3), Policy enforcement

---

## 7. Testing Requirements

### 7.1 Vector Compliance

* SDK repos **MUST** run Foundation vectors for: TIM, Canonicalization, Discovery, Notary, Settlers, Assertions
* Results **MUST** be published as `/results/<lang>/<version>/<runid>.json` per ARKY-VECTORS-v1
* To claim a level: **100% pass rate, 0 skips** for that level and all lower levels
* Valid manifest hash verification required

### 7.2 CI Requirements

* Patch releases **MUST NOT** reduce a previously claimed level without deprecation notice
* Results **MUST** conform to ARKY-VECTORS-v1 §17.1 schema
* **MUST** report: implementation details, environment, suite coverage, per-case status/duration

### 7.3 Error Model Integration

All module errors **MUST** return ARKY-ERRORS-v1 envelopes (or language-idiomatic wrappers). Transport helpers **MUST** map HTTP/gRPC statuses per ARKY-ERRORS-v1 §6.

**Key SDK error codes:**
* **Validation:** `invalid_signature`, `cid_mismatch`, `missing_required`, `unit_mismatch`
* **Policy:** `witness_quorum_failed`, `privacy_violation`, `amount_cap_exceeded`, `policy_violation`
* **Execution:** `deadline_exceeded`, `unknown_verb`, `forbidden_rail`, `finality_unmet`
* **Network:** `network_error`, `timeout`, `rate_limited`

See ARKY-VECTORS-v1 §21 for complete taxonomy.

---

## 8. Language-Specific Notes

### 8.1 TypeScript

* **MUST** support Node LTS and modern browsers
* **MUST** provide ESM builds
* **MUST** expose tree-shakable modules
* **MUST** avoid Node-only crypto when targeting browsers
* WASM **MAY** be used for crypto/canonicalization acceleration

### 8.2 Go

* **MUST** support current and previous stable Go releases
* **MUST** avoid CGO by default
* Build tags **MAY** enable accelerated crypto
* Pure-Go implementations preferred for portability

### 8.3 Rust

* **MUST** support stable toolchain (current + previous)
* `no_std` support **SHOULD** be provided for embedded use where feasible
* Feature flags **SHOULD** gate optional modules

---

## 9. Performance & Limits

* Canonicalization throughput and memory ceilings **SHOULD** be documented
* Default evaluator limits (AST depth, series length) **MUST** be configurable
* Inclusion-proof verification **MUST** be linear in branch length; batch verify **MAY** be provided

---

## 10. Packaging & Versioning

* Semantic versioning per language ecosystem
* Spec compatibility matrix **MUST** be included in release notes (e.g., supports `ARKY-TIM-v1`, `ARKY-NOTARY-v1 N2`)
* Breaking API changes **MUST** bump major version

---

## 11. Constraints Table (Informative)

| Area | MUST | SHOULD |
|------|------|--------|
| Canonicalize | JCS exact, identical bytes across stacks | Zero-alloc/low-alloc fast path |
| Sign/Verify | Ed25519 JWS; `kid` routing | Detached payload for large bodies |
| Policy | Most-restrictive merge; clamp hints | Cache effective policy artifact |
| Discovery | Verify keys/descriptors; well-known endpoints | ETag/TTL caching |
| Registries | Signed docs; resolve URNs; verb schema retrieval | Offline cache with `cid` pinning |
| Notary client | Idempotent submit; inclusion proofs; finality | Configurable backoff & deadlines |
| Settler client | Idempotency; retries; XR retrieval and verification | XR anchoring if policy requires |
| Errors | Standardized codes (§7.3) | Localized messages (en, es-419, ...) |
| Crypto | JWS Ed25519, JCS canonicalization | BLAKE3 multihash support |
| Assertions | Tri-state eval; unit conversion via registries | Limits configurable |

---

## 12. Governance

* **Spec ID:** `ARKY-SDK-v1`
* Changes follow RFC with vectors; backwards compatibility **RECOMMENDED**
* Language-specific ergonomic layers **MAY** be added but **MUST NOT** alter semantics

---
