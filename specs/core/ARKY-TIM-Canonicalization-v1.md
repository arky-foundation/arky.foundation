---

spec_id: ARKY-TIM-Canonicalization-v1
title: Arky — TIM Canonicalization
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
summary: >
  Defines the canonical serialization required to compute TIM content IDs (cid)
  and to verify signatures and witness proofs deterministically across implementations.
links:
  core: https://arky.foundation/specs/core/ARKY-TIM-v1
  schema: https://arky.foundation/schemas/core/tim-v1.json
  vectors: https://arky.foundation/vectors/
  rfcs: https://arky.foundation/rfcs/
references:
  - RFC 8785  # JSON Canonicalization Scheme (JCS)
  - RFC 8259  # The JSON Data Interchange Syntax
  - RFC 7515  # JSON Web Signature (JWS)
  - RFC 8037  # CFRG Elliptic Curve Algorithms (EdDSA)
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public review and test vectors
authors:
  - Arky Foundation Dev WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/core/ARKY-TIM-Canonicalization-v1
last_updated: 2025-10-15

---

# Arky — TIM Canonicalization (v1)

spec ID: ARKY-TIM-Canonicalization-v1
Effective: 2025-10-15

**All sections are normative unless labeled *Informative*.** This specification defines the canonical JSON serialization, hashing, and signature envelope for **TIM Core (v1)**.

---

## 1. Scope

* Applies to TIM Core (v1) receipts.
* Defines the **canonical body** used for `cid` computation and for signatures/witnesses.
* Out of scope: domain semantics, settlers, notary behavior (covered by respective specs).

---

## 2. Canonical Body

* The **canonical body** is the unsigned TIM object **with the fields `cid` and `sig` removed**.
* Implementations **MUST** serialize the canonical body as **canonical JSON** per §3 before hashing and signing.

---

## 3. Canonical JSON (JCS profile)

TIM uses **RFC 8785 (JCS)** with the following constraints:

1. **Object key ordering**: lexicographic (bytewise) by UTF‑8 code units.
2. **Unique keys**: duplicate member names **MUST NOT** appear.
3. **Whitespace**: no insignificant whitespace.
4. **Strings**: UTF‑8; no Unicode normalization beyond JSON escapes; escape per RFC 8259 only.
5. **Numbers**: finite IEEE‑754 values only. Formatting per JCS:

   * no leading `+`, no leading zeros (except `0`), no `-0`
   * use minimal decimal form; exponent form only as needed; case‑insensitive `e` normalized to lowercase
   * `NaN`, `Infinity`, `-Infinity` **MUST NOT** appear (encode as strings if needed).
6. **Booleans/null**: `true`, `false`, `null` as in RFC 8259.
7. **Arrays**: element order preserved.
8. **Encoding**: UTF‑8 **without BOM**; reject comments/trailing commas (strict RFC 8259).

**Non‑goals**: No additional normalization (e.g., Unicode NFC) is applied by this spec.

---

## 4. Content ID (cid)

* Compute `cid` over the canonical bytes:

```
cid = multibase('z', Base58-BTC(Multihash(SHA-256, canonical_bytes)))
```

* `canonical_bytes` are exactly the bytes emitted by §3.
* The multihash is `0x12 0x20` ‖ the 32-byte SHA-256 digest; the result is
  base58btc-encoded and prefixed with the multibase code `z`. This is **not** an
  IPFS CID (see ARKY-TIM-v1 §5).
* `cid` **MUST** be included in the signed TIM (outside the canonical body) after signing.

---

## 5. Signature & Witness Envelope

* **Signature (`sig`)**: **JWS (compact)** using **Ed25519/EdDSA** over `canonical_bytes`, with a **detached payload** (RFC 7797).
* **Protected header** **MUST** include: `{"alg": "EdDSA", "b64": false, "crit": ["b64"]}`. A `kid` **SHOULD** reference the public key (e.g., DID key id).
* The JWS payload is `canonical_bytes` and **MUST NOT** be embedded: the compact serialization is `<protected_header>..<signature>` (empty middle segment). Verifiers supply `canonical_bytes` as the detached payload when verifying.
* **Witnesses**: `time.witnesses[]` **MUST** be detached-payload JWS (Ed25519) over the **same** `canonical_bytes`; each **SHOULD** include `kid` resolvable from its identity method.

---

## 6. Field Inclusion Rules

* The canonical body **MUST** contain every field present in the TIM except `cid` and `sig`.
* Optional fields **MUST** be omitted entirely if absent; no `null` placeholders.
* Empty arrays/objects **MUST** be serialized if present.
* Implementations **MUST** reject receipts containing unknown top‑level fields unless a Profile explicitly allows them.

---

## 7. Determinism & Interop

* All implementations **MUST** produce identical `canonical_bytes` for the same logical TIM body.
* Hash and signature verification **MUST** succeed across independent stacks.
* The Foundation **WILL** publish **conformance vectors** with canonical byte hex, `cid`, and JWS for cross‑testing.

---

## 8. Security Considerations

* Do not reinterpret numbers across languages (e.g., integer vs. float widening). Use the exact JCS formatting.
* Ensure JSON libraries do not reorder keys or insert whitespace in canonical mode.
* Reject non‑finite numbers.
* Treat key comparators as bytewise UTF‑8; locale‑dependent collation **MUST NOT** be used.

---

## 9. Conformance

* **C1 — Canonicalize:** produce `canonical_bytes` from a given TIM body per §3.
* **C2 — Hash & Sign:** compute `cid` per §4 and sign/verify JWS per §5.
* **C3 — Cross‑verify:** verify vectors from at least two independent stacks.

An implementation **MAY** claim `TIM-Canonicalization v1 C1/C2/C3` only if it passes the Foundation vectors.

### 9.1 Error Codes (Canonicalization)

```
invalid_json
duplicate_member
bad_encoding_bom
invalid_number
non_finite_number
negative_zero
forbidden_field
cid_mismatch
invalid_signature
```

---

## 10. Versioning & Governance

* **Spec ID:** `ARKY-TIM-Canonicalization-v1`.
* Changes follow RFC with public vectors. Backwards compatibility **RECOMMENDED**; migrations documented.

---

**End of TIM Canonicalization (v1).**
