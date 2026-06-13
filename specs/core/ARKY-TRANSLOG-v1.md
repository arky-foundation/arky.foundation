---
spec_id: ARKY-TRANSLOG-v1
title: Arky — Transparency Log
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-TIM-Canonicalization-v1
  - ARKY-ERRORS-v1
summary: >
  Defines an append-only Transparency Log with signed tree heads, inclusion and
  consistency proofs (CT-style) for audit and anchoring. Notaries and auditors
  interoperate by this spec when using `log:arky:transparency@v1` targets.
permalink: /specs/core/ARKY-TRANSLOG-v1
last_updated: 2025-10-15
---

# Arky — Transparency Log (v1)

All sections are normative unless labeled Informative.

## 1. Scope

Append-only log for content-addressed objects (e.g., CIDs, Merkle roots). Provides verifiable inclusion and consistency proofs and a signed Tree Head (TH) API.

## 2. Data structures

```
Entry := { index: uint64, leaf_hash: multibase, data: { cid?: string, root?: string }, ts: RFC3339 }
TH := { size: uint64, root_hash: multibase, ts: RFC3339, sig: JWS }
InclusionProof := { leaf_hash: multibase, tree_size: uint64, path: [multibase], alg: "merkle-v1" }
ConsistencyProof := { first: uint64, second: uint64, path: [multibase], alg: "merkle-v1" }
```

Hashing: `merkle-v1` per ARKY-REGISTRIES-v1 (§6.3). Leaves are `leaf_hash = MH(SHA-256(canonical_leaf_bytes))`.

## 3. HTTP API

- `GET /log/v1/sth` → `TH`
- `GET /log/v1/entries?start=<n>&limit=<m>` → `[Entry]` (bounded, cursor via `Link` headers)
- `GET /log/v1/proof/inclusion?leaf=<multibase>&size=<n>` → `InclusionProof`
- `GET /log/v1/proof/consistency?first=<n>&second=<n>` → `ConsistencyProof`
- `POST /log/v1/add` body: `{ cid?: string, root?: string }` → `{ index, leaf_hash }`

Rules:

- `add` is idempotent by leaf contents; duplicate adds return the existing index.
- TH is signed; clients MUST verify signature before trusting `root_hash`.
- Proof verification MUST follow `merkle-v1` ordering and hashing rules.

## 4. Security

- Append-only: operators MUST retain historical THs; auditors verify monotonic growth with consistency proofs.
- Rate limiting and auth MAY be applied to `add`; reads SHOULD be public.

## 5. Conformance

- **TL1 — Server:** Produces valid THs, entries, and proofs; enforces append-only; idempotent add.
- **TL2 — Client:** Verifies TH signature and proofs; rejects mismatches (`common.invalid_argument`).

End of ARKY-TRANSLOG-v1.

