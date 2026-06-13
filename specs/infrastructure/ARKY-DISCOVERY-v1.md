---
spec_id: ARKY-DISCOVERY-v1
title: Arky — Discovery & Service Metadata
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-NOTARY-v1
  - ARKY-SETTLERS-v1
  - ARKY-REGISTRIES-v1
  - ARKY-POLICY-PACKS-v1
  - ARKY-REVOCATIONS-v1
summary: >
  Defines well-known locations and signed service descriptors for discovering
  Arky services (Notaries, Settlers, Registries, Policy Packs), keys, and
  capabilities. Ensures deterministic bootstrapping and compatibility checks.
links:
  tim: https://arky.foundation/specs/core/ARKY-TIM-v1
  canonicalization: https://arky.foundation/specs/core/ARKY-TIM-Canonicalization-v1
  notary: https://arky.foundation/specs/core/ARKY-NOTARY-v1
  settlers: https://arky.foundation/specs/core/ARKY-SETTLERS-v1
  registries: https://arky.foundation/specs/infrastructure/ARKY-REGISTRIES-v1
  policies: https://arky.foundation/specs/core/ARKY-POLICY-PACKS-v1
  vectors: https://arky.foundation/specs/development/ARKY-VECTORS-v1
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public vectors
authors:
  - Arky Foundation Dev WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/infrastructure/ARKY-DISCOVERY-v1
last_updated: 2025-10-15

---

# Arky — Discovery & Service Metadata (v1)

**All sections are normative unless labeled *Informative*.**

## 1. Scope

Defines:

* well-known locations for Arky service discovery and key material,
* a signed ServiceDescriptor object for capabilities and policies,
* health/readiness signals,
* conformance levels.

Out of scope: UI, business policy content (see Policy Packs), transport authentication specifics.

## 2. Terminology

* Provider: Domain or entity hosting Arky services.
* Service: Notary, Settler, Registry, or Policy endpoint.
* Descriptor: Signed JSON describing a service and its capabilities.
* Well-known: Fixed URL path under a provider domain used for discovery.

## 3. Well-Known Resources

Providers **MUST** expose HTTP endpoints:

1. **Index**
   `GET /.well-known/arky/index.json`
   Returns an object listing available services and pointers to keys and packs.

2. **Keys**
   `GET /.well-known/arky/jwks.json`
   Returns a JWKS (OKP Ed25519 public keys) or a signed key set. Keys **MUST** include `kid` values used in JWS signatures across specs.

3. **Policy Index**
   `GET /.well-known/arky/policies`
   Returns a list of available Policy Pack locators (by `pack_id`), each retrievable as specified in ARKY-POLICY-PACKS-v1.

4. **Registries Index**
   `GET /.well-known/arky/registries`
   Returns locators for registries per ARKY-REGISTRIES-v1.

5. **Revocations**
   `GET /.well-known/arky/revocations.json`
   Returns a signed Revocation List per ARKY-REVOCATIONS-v1. Clients MAY fetch and cache this list to enforce key revocations offline. The Index MAY also include a `revocations` URL pointer for convenience.

These resources **MUST** be cacheable and **MUST** support ETag/Last-Modified. All responses **MUST** be UTF-8 JSON. Providers MUST set ETag and Cache-Control on all well-known responses; clients MUST revalidate when max-age elapses. Do not follow redirects across origins for well-known endpoints.

## 4. Service Descriptors

### 4.1 Descriptor Envelope

```
ServiceDescriptor := {
  service_id: string,            // required, stable URN or URL
  service_type: "notary"|"settler"|"registry"|"policy", // required
  version: string,               // required, implementation SemVer
  spec_ids: [string],            // required, sorted spec ids (e.g., ARKY-NOTARY-v1 N2)
  endpoints: [Endpoint],         // required
  capabilities: object,          // required, type-specific (§4.3/§4.4)
  policy_defaults?: object,      // optional, default policy_pack_id etc.
  security: SecurityDeclaration, // required
  ts: RFC3339,                   // required, descriptor issue time
  cid?: string,                  // optional but RECOMMENDED, canonical body hash
  sig: string                    // required, JWS Ed25519 over canonical body
}

Endpoint := {
  name: string,                  // required (e.g., "submit", "status", "execute")
  path: string,                  // required, absolute or relative path
  method: "GET"|"POST"|"PUT"|"DELETE"|"HEAD", // required
  media_types?: [string]         // optional (e.g., application/json)
}

SecurityDeclaration := {
  transport: ["https"],          // required; https only in v1
  auth: ["none"|"mtls"|"oauth2"|"apikey"], // required; exact values only
  rate_limits?: { per_minute?: integer, burst?: integer }  // optional
}
```

**Canonicalization & signing:** Remove `cid`/`sig`, JCS-serialize, hash per Canonicalization v1, sign with Ed25519 JWS. `kid` SHOULD match a key from `/.well-known/arky/jwks.json`. Clients SHOULD verify cid when present.

**Constraints:** `security.auth` MUST use only allowed values: `["none","mtls","oauth2","apikey"]`. Unknown values MUST be rejected unless a Profile explicitly extends them. `kid` MUST resolve via the same origin's JWKS endpoint.

### 4.2 Descriptor Fetch

Clients **MUST** obtain descriptors via the Index and verify the signature using a key from the provider’s Keys endpoint. Unsigned or unverifiable descriptors MUST be rejected.

Clients SHOULD also fetch Revocations and enforce key revocation locally when verifying descriptors and service responses.

### 4.3 Type-specific Capabilities — Notary

For `service_type="notary"`, `capabilities` **MUST** include:

```
NotaryCaps := {
  anchor_targets: [string],          // CAIP-2/chain URNs allowed by this Notary
  finality_defaults: object,         // per-target depths
  batch_limits: { max_count: int, max_bytes: int, max_dwell_ms: int },
  witness_algorithms: ["Ed25519"],   // algorithms supported
  dtn_ordering: true|false,          // deterministic offline ordering support
  policy_required: true|false        // requires explicit policy_pack_id
}
```

### 4.4 Type-specific Capabilities — Settler

For `service_type="settler"`, `capabilities` **MUST** include:

```
SettlerCaps := {
  rails_supported: [string],         // e.g., cai2:*, sepa:eu, ach:us, controller:*
  verbs_supported: [string],         // verb URNs (with versions where applicable)
  rollback_support: object,          // per-rail rollback windows supported
  cross_anchor: "required"|"optional"|"unsupported",
  idempotency: "keyed"|"none"
}
```

### 4.5 Type-specific Capabilities — Registry/Policy

* **Registry:** namespaces provided, schema URIs, max payloads.
* **Policy:** pack_ids served, inheritance rules, residency of pack storage.

## 5. Health & Readiness

Providers **MUST** implement:

* `GET /health` → `{ status: "ok"|"degraded"|"down", ts, version }`
* `GET /ready` → `{ ready: true|false, ts }`

These endpoints **MUST NOT** require authentication.

## 6. Discovery Flow (Deterministic)

Given a provider domain:

1. Fetch Keys; cache by `kid`.
2. Fetch **Index**; load service locator list.
3. For each service, fetch its ServiceDescriptor; verify JWS with Keys; verify `cid`.
4. Validate `spec_ids` compatibility with the client’s required levels (e.g., Notary N2, Settler S2).
5. Bind **policy_pack_id**: use explicit request → scope default → provider default from `policy_defaults`, enforcing **most-restrictive-wins** precedence (as defined in Policy Packs).
6. Cache descriptors with ETag; refresh on expiry or `sig`/`cid` mismatch.

Unverifiable keys, unsigned descriptors, or incompatible spec levels **MUST** abort discovery for that service.

## 7. Security Requirements

* HTTPS only. HTTP/2 or HTTP/3 allowed.
* Key rotation: `/.well-known/arky/jwks.json` **MUST** support multiple keys; descriptors SHOULD rotate `kid` before key expiry.
* Anti-downgrade: Clients **MUST** refuse services advertising lower security levels than a configured minimum.
* No PHI/PII in descriptors or well-known payloads.
* Rate-limit disclosure **MAY** be truncated; enforcement remains server-side.

## 8. Conformance

* **D1 — Publish:** Provider publishes Index, Keys, and signed ServiceDescriptors with valid JWS and canonicalization.
* **D2 — Validate:** Client verifies Keys and Descriptors, enforces spec compatibility and policy precedence.
* **D3 — Operate:** Health/Ready endpoints are present; descriptors accurately reflect live capabilities (verbs/rails/targets).

An implementation **MAY** claim `ARKY-DISCOVERY-v1 D1/D2/D3` only if it passes the Foundation vectors.

## 9. Constraints Table (Informative)

| Area          | MUST                                        | SHOULD                            |
| ------------- | ------------------------------------------- | --------------------------------- |
| Transport     | HTTPS                                       | HTTP/2 or HTTP/3                  |
| Keys          | JWKS OKP Ed25519 with `kid`                 | multiple active keys for rotation |
| Signing       | JCS + JWS Ed25519 over Descriptor           | publish Descriptor `cid`          |
| Index         | JSON listing services, policies, registries | ETag/TTL caching                  |
| Health        | `/health`, `/ready`                         | —                                 |
| Compatibility | enforce `spec_ids` levels                   | cache descriptors with ETag       |

## 10. Versioning & Governance

* **Spec ID:** `ARKY-DISCOVERY-v1`.
* Changes via RFC with vectors. Backwards compatibility **RECOMMENDED**; migrations documented.

---