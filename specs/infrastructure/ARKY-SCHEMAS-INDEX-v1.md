---
spec_id: ARKY-SCHEMAS-INDEX-v1
title: Arky — Schemas Index Manifest
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-ERROR-v1
summary: >
  Signed, canonical index mapping schema names to versions and content-addressed CIDs.
  Enables SDKs and tools to pin exact validation sets and verify drift.
links:
  schemas: https://arky.foundation/schemas/meta/schemas-index-v1.json
permalink: /specs/infrastructure/ARKY-SCHEMAS-INDEX-v1
last_updated: 2025-10-15
---

# Arky — Schemas Index Manifest (v1)

All sections are normative unless labeled Informative.

## 1. Scope

Defines a signed manifest that lists official JSON schema artifacts with stable CIDs.

## 2. Manifest Shape

```
schemasIndex := {
  index_id: "arky:schemas:index@v1",   // required
  ts: RFC3339,                          // required
  schemas: {                           // required
    "tim-v1.json":  { "v1": { "cid": "...", "url": "..." } },
    "kernel-v1.json":  { "v1": { "cid": "...", "url": "..." } }
  },
  cid?: string,                         // recommended; hash of body without cid/sig
  sig: string                           // required; JWS Ed25519 over canonical body
}
```

Rules:

- `schemas` maps schema filename → version label → object with `cid` (required) and optional `url`.
- Canonicalization uses JCS; `cid` and `sig` omitted from the preimage.
- Sign with a key discoverable via Foundation JWKS.

## 3. Distribution

- Published at `/schemas/index.json` and listed in `/.well-known/arky/registries` or equivalent index.
- MUST be cacheable with `ETag`; clients MUST revalidate.

## 4. Conformance

- **I1 — Publish:** schema file list is accurate; manifest is signed and canonicalized; `cid` is correct.
- **I2 — Consume:** Clients verify signature and `cid`; on mismatch, reject and error `discovery.unverified_descriptor`.

End of ARKY-SCHEMAS-INDEX-v1.