---

spec_id: ARKY-MEDIA-TYPES-v1
title: Arky — Media Types & Content Negotiation
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
  - ARKY-ERRORS-v1
summary: >
  Registers Arky media types and defines strict HTTP content negotiation,
  charset, canonicalization signaling, and versioning rules for all Arky
  payloads.
links:
  specs: https://arky.foundation/specs/
  schemas: https://arky.foundation/schemas/
  vectors: https://arky.foundation/vectors/
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public review and conformance vectors
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/infrastructure/ARKY-MEDIA-TYPES-v1
last_updated: 2025-10-15

---

# Arky — Media Types & Content Negotiation (v1)

**All sections are normative unless labeled *Informative*.**

## 1. Scope

Defines registered media types for Arky artifacts, required HTTP negotiation behavior, canonicalization signaling, and versioning rules. Applies to all Arky servers and clients (Discovery, Notary, Settlers, Kernel evaluators, Registry/Policy publishers, SDKs).

Out of scope: transport authentication; payload schemas (see ARKY-SCHEMAS-v1).

---

## 2. Registered Media Types

The following `application` types are registered. Each is JSON with the `+json` structured suffix.

* `application/arky.tim+json` — TIM receipts (ARKY-TIM-v1)
* `application/arky.kernel+json` — Kernel commitments & Decisions (ARKY-KERNEL-v1)
* `application/arky.xr+json` — Execution Receipts (ARKY-SETTLERS-v1)
* `application/arky.anchor+json` — Notary Anchor Objects (ARKY-NOTARY-v1)
* `application/arky.policy-pack+json` — Policy Packs (ARKY-POLICY-PACKS-v1)
* `application/arky.registry+json` — Registry snapshots (ARKY-REGISTRIES-v1)
* `application/arky.descriptor+json` — Discovery ServiceDescriptor (ARKY-DISCOVERY-v1)
* `application/arky.error+json` — Error Envelope (ARKY-ERRORS-v1)
* `application/arky.revocations+json` — Revocation Lists (ARKY-REVOCATIONS-v1)

**Non-Arky** related:

* `application/jwk-set+json` (RFC 7517) is used for Discovery Keys; not re-registered by this spec.

### 2.1 Parameters

All Arky `+json` types **MUST** support these optional parameters:

* `profile` — URI identifying the governing schema/version (e.g., a `$id` from ARKY-SCHEMAS-v1).
  Behavior: if present, clients **MUST** validate against it; servers **SHOULD** emit it.
* `canon` — `"JCS"` indicates the payload bytes are already JCS-canonical (see §4).
  Behavior: if present and not `"JCS"`, clients **MUST** reject.

The `charset` parameter **MUST NOT** be used. Payloads **MUST** be UTF-8 (see §3).

---

## 3. JSON & Charset

* Payloads **MUST** be encoded in **UTF-8**.
* `charset` parameters on Arky `+json` types are **prohibited**.
* Duplicate JSON object member names **MUST** be rejected.
* Non-finite numbers (`NaN`, `Infinity`) **MUST NOT** appear.

---

## 4. Canonicalization Signaling

Canonicalization rules live in ARKY-TIM-Canonicalization-v1. Over the wire:

* Servers **MAY** send either canonical or non-canonical JSON.
* When a response is **canonical**, servers **SHOULD** include `;canon=JCS`.
* Clients **MUST** verify signatures/hashes by canonicalizing locally; they MUST NOT rely solely on `canon` signaling.
* Endpoints that advertise canonical payloads **MUST** be consistent within the lifetime of cache validators (ETag/Last-Modified).

---

## 5. Versioning

* Media type **subtypes are stable** across a major spec line; versioning occurs in the object content (fields and `$id`) and in the `profile` parameter.
* Breaking spec changes **MUST** use a new spec major (e.g., `…-v2`) and a new schema `$id`; media subtypes remain unchanged unless the wire format ceases to be JSON, in which case a new subtype is registered.

---

## 6. HTTP Content Negotiation

**6.1 Requests**

* Clients **MUST** send an `Accept` header listing supported Arky types for the endpoint.
* If no `Accept` is sent, servers **MAY** default to the endpoint’s primary type (see §8).
* When sending payloads, clients **MUST** set `Content-Type` to the exact Arky type; they SHOULD include `profile`.

**6.2 Responses**

* Servers **MUST** select a response type compatible with `Accept`; otherwise MUST return 406 Not Acceptable with `application/arky.error+json`.
* Servers **MUST** set `Content-Type` to the selected Arky type; they SHOULD include `profile`.
* Error responses **MUST** use `application/arky.error+json` regardless of the requested type.

**6.3 Content-Encoding**

* Servers **MAY** use `Content-Encoding: gzip` or `zstd`.
* Clients **MUST** accept identity; SHOULD accept gzip; MAY accept zstd.
* Canonicalization is applied before transport encodings during verification.

---

## 7. Caching & Integrity

* Responses **SHOULD** include strong validators (`ETag`) and `Cache-Control` appropriate to mutability.
* Where artifacts are content-addressed (`cid` present), servers **SHOULD** expose an immutable URL and/or `ETag` derived from `cid`.
* If a response includes a `cid`, clients **MUST** verify that the object canonicalizes to that `cid`.

---

## 8. Type Assignments by Spec

Servers **MUST** use these types on the corresponding endpoints:

* **Discovery**:
  - Index → `application/json` (schema: discovery-index-v1.json)
  - Keys → `application/jwk-set+json`
  - ServiceDescriptor → `application/arky.descriptor+json`
  - Revocations → `application/arky.revocations+json`
* **Notary**: submit/status/proof → `application/arky.tim+json` (submit body) and `application/arky.anchor+json` (anchor/proof responses).
* **Settlers**: execute/status/XR fetch → requests carry `application/arky.kernel+json` (commitment or decision plan where applicable) and responses use `application/arky.xr+json`.
* **Registries/Policy**: registry snapshots → `application/arky.registry+json`; policy packs → `application/arky.policy-pack+json`.
* **Errors**: all components return `application/arky.error+json` on failure.

---

## 9. IANA Considerations

The following registrations are supplied to IANA:

**Type name:** application
**Subtype name:** arky.tim+json
**Required parameters:** none
**Optional parameters:** `profile`, `canon`
**Encoding considerations:** binary; UTF-8 JSON
**Security considerations:** carries signed, verifiable receipts; see referenced specs
**Interoperability considerations:** JSON; RFC 8785 canonicalization applies
**Published specification:** this document and ARKY-TIM-v1
**Applications that use this media type:** Arky TIM issuers, Notaries, SDKs
**Fragment identifier considerations:** none
**Additional information:** file extensions none; magic none
**Person & email address to contact for further information:** Arky Foundation
**Intended usage:** COMMON
**Restrictions on usage:** none
**Author/Change controller:** Arky Foundation

(Identical template entries apply for: `arky.kernel+json`, `arky.xr+json`, `arky.anchor+json`, `arky.policy-pack+json`, `arky.registry+json`, `arky.descriptor+json`, `arky.error+json`; each references its governing spec in “Published specification”.)

---

## 10. Conformance

* **M1 — Producer:** Emits correct `Content-Type` with optional `profile`; obeys UTF-8; honors `Accept` and returns 406 on mismatch; error responses use `application/arky.error+json`.
* **M2 — Consumer:** Sends `Accept`/`Content-Type`; enforces UTF-8; rejects unknown parameters or non‑UTF‑8; validates against `profile` when present.
* **M3 — Canonicalization:** Verifies signatures/hashes via canonicalization irrespective of wire formatting; handles `canon=JCS` consistently.

Claims of `ARKY-MEDIA-TYPES-v1 M1/M2/M3` require passing Foundation vectors.

---

## 11. Constraints Table *(Informative)*

| Area              | MUST                                     | SHOULD                               |
| ----------------- | ---------------------------------------- | ------------------------------------ |
| Charset           | UTF-8; no `charset` param                | —                                    |
| Negotiation       | honor `Accept`; 406 on mismatch          | include `profile`                    |
| Canonicalization  | verify via JCS regardless of wire form   | mark canonical payloads with `canon` |
| Errors            | `application/arky.error+json` everywhere | include retry hints per ERROR spec  |
| Compression       | accept identity; gzip recommended        | zstd optional                        |
| Caching/Integrity | use ETag; verify `cid` when present      | immutable URLs for content-addressed |

---

## 12. Versioning & Governance

**Spec ID:** `ARKY-MEDIA-TYPES-v1`. Changes follow the Governance RFC process; backwards compatibility RECOMMENDED; new types added via Minor Technical decisions; removals or wire-format changes require Major Technical.

---

End of Media Types & Content Negotiation (v1).