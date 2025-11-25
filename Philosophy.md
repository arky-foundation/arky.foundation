---
spec_id: ARKY-PHILOSOPHY
title: Arky - Philosophy
version: v1
status: stable
effective: 2025-10-15
doc_type: overview
normative_default: false  # Informative document
summary: >
  Arky in one page: the loop, the terms, and tiny examples
  you can copy. Normative rules live in the linked specs.
links:
  tim: specs/core/ARKY-TIM-v1.md
  notary: specs/core/ARKY-NOTARY-v1.md
  kernel: specs/core/ARKY-KERNEL-v1.md
  settlers: specs/core/ARKY-SETTLERS-v1.md
  discovery: specs/infrastructure/ARKY-DISCOVERY-v1.md
  registries: specs/infrastructure/ARKY-REGISTRIES-v1.md
  media: specs/infrastructure/ARKY-MEDIA-TYPES-v1.md
  wire: specs/infrastructure/ARKY-WIRE-v1.md
  keys: specs/security/ARKY-KEYS-v1.md
  revocations: specs/security/ARKY-REVOCATIONS-v1.md
  translog: specs/core/ARKY-TRANSLOG-v1.md
  policy: specs/core/ARKY-POLICY-PACKS-v1.md
  errors: specs/core/ARKY-ERRORS-v1.md
  vectors: specs/development/ARKY-VECTORS-v1.md
permalink: /philosophy
last_updated: 2025-10-15
---

# Arky - Philosophy

**One line:** Arky turns real-world evidence into deterministic, auditable actions across any rail.

**Context:** See `Mission.md` for the North Star and why this exists.

**The loop:** Measure (TIM) -> Notarize (Notary) -> Decide (Kernel) -> Settle (Settlers) -> Audit (Vectors)

**Note:** This page is Informative. Normative rules live in the linked specs.

---

## End-to-end by example

1) TIM (evidence)

```json
{
  "@type": "ARKY:TIM@v1",
  "subject": "arky:unit/temp.C",
  "value": 22.3,
  "time": "2025-01-02T03:04:05Z",
  "cid": "zBase58...",
  "sig": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXUyJ9..."
}
```
Terminology: TIM (specs/ARKY-TIM-v1.md), Units/URNs (specs/ARKY-REGISTRIES-v1.md)

2) Notary (witness + anchor)

```json
{
  "@type": "ARKY:NotaryReceipt@v1",
  "timCid": "zBase58...",
  "witnesses": ["did:key:z...", "did:web:example.org#1"],
  "anchor": {"rail": "eth:1", "txid": "0xabc..."}
}
```
Terminology: Notary (specs/ARKY-NOTARY-v1.md), Anchors (specs/ARKY-TRANSLOG-v1.md)

3) Decision (deterministic rule result)

```json
{
  "@type": "ARKY:Decision@v1",
  "rule": "arky:policy/cooling.on",
  "inputs": {"tim": "zBase58..."},
  "result": "ALLOW",
  "cid": "zBase58..."
}
```
Terminology: Kernel/Decision (specs/ARKY-KERNEL-v1.md), Policy Packs (specs/ARKY-POLICY-PACKS-v1.md)

4) Execution (settle a verb) -> receipt

```json
{
  "@type": "ARKY:ExecutionReceipt@v1",
  "verb": "arky:verb/evm.transfer",
  "params": {"to": "0x...", "value": "1"},
  "status": "SUCCESS",
  "anchors": [{"rail": "eth:1", "txid": "0xdef..."}]
}
```
Terminology: Settlers/Verbs (specs/ARKY-SETTLERS-v1.md), Verbs Registry (specs/ARKY-REGISTRIES-v1.md)

5) Discovery (well-known)

HTTP GET `/.well-known/arky/index.json` ->

```json
{
  "jwks": "/.well-known/arky/jwks.json",
  "services": [{"type": "notary", "href": "https://n.example/notary"}],
  "cid": "zBase58...",
  "sig": "eyJ..."
}
```
Terminology: Discovery (specs/ARKY-DISCOVERY-v1.md), Keys/JWKS (specs/ARKY-KEYS-v1.md)

---

## Problems Arky solves (why)

- Evidence is messy (sensors, logs, claims) -> TIM makes facts portable and tamper-evident.
- Time/order drift across systems -> Notary witnesses, orders, and anchors for durable finality.
- Logic varies by domain/region -> Kernel separates decision from execution; Policy Packs encode defaults.
- Rails are fragmented (chains, banks, controllers) -> Settlers expose a small verb set with consistent receipts.
- Interop fails on names/endpoints -> Registries provide stable URNs; Discovery fixes well-known, signed descriptors.
- Postmortems are hand-wavy -> Everything is canonicalized, content-addressed, signed, and testable with Vectors.

---

## Design principles (non-negotiable)

1. Small, signed artifacts (JCS + cid + JWS).
2. Separation of concerns: Measure != Decide != Settle.
3. Determinism over ceremony; or return INDETERMINATE.
4. Verifiability over trust: anchors, receipts, vectors.
5. Stable names via Registries; no implicit magic.
6. Explicit Discovery: well-known, signed descriptors.
7. Pluggable policy via Policy Packs.
8. Minimal surface: verbs, errors, function grammar.
9. Vectors are the contract for conformance.
10. Privacy by default; no PHI/PII in public anchors.

---

## What Arky is / isn't

Is
- A compact protocol suite for verifiable machine action: receipts, decisions, execution, audit.
- A safe way to mix off-chain evidence with on-chain anchors and off-chain rails.
- A compatibility layer: Registries + Discovery + Schemas + Errors + Vectors.

Isn't
- A blockchain, wallet, KYC system, or monolithic platform.
- A policy engine dictating business rules; it only enforces declared Packs.
- A telemetry store; it carries just enough to prove claims.

---

## Trust model

- Cryptographic: JWS over canonical bytes; identities via DID/JWK/X.509; revocation and rotation.
- Temporal: Notary witnesses + anchors; finality per registry defaults or stricter Policy Packs.
- Operational: Witness independence, custody segregation, rollback windows, immutable audit logs (see ARKY-SECURITY-BPR-v1).

---


## Terminology (quick refs)

- TIM - signed, canonical evidence record: `specs/ARKY-TIM-v1.md`
- Notary - witness, order, and anchors: `specs/ARKY-NOTARY-v1.md`
- Kernel/Decision - deterministic rule outcome: `specs/ARKY-KERNEL-v1.md`
- Settlers - tiny verb set + receipts: `specs/ARKY-SETTLERS-v1.md`
- Registries - stable URNs for units/verbs/rails/devices: `specs/ARKY-REGISTRIES-v1.md`
- Discovery - well-known endpoints and signed descriptors: `specs/ARKY-DISCOVERY-v1.md`
- Policy Packs - defaults and constraints by region/domain: `specs/ARKY-POLICY-PACKS-v1.md`
- Errors - standard error envelope: `specs/ARKY-ERRORS-v1.md`
- Vectors - conformance suites: `specs/ARKY-VECTORS-v1.md`

---

## Minimal compliance checklist

- Emit TIM v1 with correct `cid` and signature (EdDSA).
- Use registered URNs (units/verbs/rails); reject unknown mandatory fields.
- Publish/consume Discovery (JWKS, descriptors) and verify signatures.
- Enforce declared Policy Pack constraints (witness/finality/privacy/rollback).
- Return standard Error envelopes with retry hints; pass relevant Vectors.

That's it. Copy the examples, swap your values, and link the specs above when in doubt.

---

## Adoption path

1. Emit TIM v1 correctly (cid + EdDSA signature).
2. Anchor via a Notary and verify inclusion.
3. Wrap your rule in a Kernel commitment -> produce a Decision.
4. Execute one Settler verb on one rail -> emit an Execution Receipt.
5. Wire Discovery and Errors; add a Policy Pack; pass Vectors.

---

## Versioning & governance stance

- Changes are RFC-driven; breaking changes bump `@v<major>` or `-v2`.
- Registries add entries with schemas + vectors; no silent rewrites.
- Security fixes keep a signed paper trail.

---

North-star: make correct behavior the path of least resistance.
