---

spec_id: ARKY-REGISTRIES-v1
title: Arky — Registries
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-Canonicalization-v1
  - ARKY-TIM-v1
  - ARKY-SETTLERS-v1
  - ARKY-NOTARY-v1
summary: >
  Defines canonical, signed registries for identifiers used across Arky: units/resources,
  settler verbs, rails/anchor targets, and device classes. Registries provide stable URNs
  and machine-readable metadata for implementers.
links:
  tim: https://arky.foundation/specs/core/ARKY-TIM-v1
  settlers: https://arky.foundation/specs/core/ARKY-SETTLERS-v1
  notary: https://arky.foundation/specs/core/ARKY-NOTARY-v1
  vectors: https://arky.foundation/vectors/
  rfcs: https://arky.foundation/rfcs/
  schema: https://arky.foundation/schemas/infrastructure/registries-v1.json
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public review and test vectors
authors:
  - Arky Foundation Dev WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/infrastructure/ARKY-REGISTRIES-v1
last_updated: 2025-10-15

---

# Arky — Registries (v1)

spec ID: ARKY-REGISTRIES-v1
Effective: 2025-10-15

All sections are normative unless labeled Informative. This document defines the structure, signing, discovery, and conformance rules for Arky registries.

---

## 1. Scope

* Provides signed, machine-readable catalogs for identifiers referenced by Arky specs:
  (a) Units & Resources, (b) Settler Verbs, (c) Rails & Anchor Targets, (d) Device Classes.
* Out of scope: policy defaults (see Policy Packs), domain code systems ownership (e.g., LOINC/GS1).

---

## 2. Terminology

* Registry: Signed JSON document mapping URNs → entries.
* URN: Stable identifier `arky:<namespace>/<name>` (e.g., `arky:unit/newton`).
* Entry: Machine-parseable object with `metadata`, `schema`, and optional `aliases`.

---

## 3. Common Registry Envelope

All registries MUST conform to this envelope (JSON schema authoritative).

```json
{
  "registry_id": "arky:registry:<ns>@v1",
  "name": "<human-readable>",
  "ts": "2025-10-15T00:00:00Z",
  "entries": { "<urn>": { /* entry object */ } },
  "aliases": { "<alias>": "<urn>" },
  "sig": "<jws-compact>"
}
```

**Rules**

* `sig` **MUST** be JWS Ed25519 over the JCS-canonicalized body.
* `aliases` **MUST NOT** create cycles; consumers **MUST** resolve aliases to canonical URNs.

---

## 4. Units & Resources Registry (`arky:registry:units@v1`)

### 4.1 URNs

* Units: `arky:unit/<si-or-domain>` (e.g., `arky:unit/newton`, `arky:unit/tflops`).
* Resource units (metered capacities): `arky:ru/<name>` (e.g., `arky:ru/tflops`, `arky:ru/kwh`, `arky:ru/mbps`).

### 4.2 Entry

```json
{
  "urn": "arky:unit/newton",
  "symbol": "N",
  "dimension": {"kg":1,"m":1,"s":-2},
  "si_prefix": true,
  "format": {"decimals_max": 9},
  "aliases": ["N"],
  "notes": "SI derived unit"
}
```

**Constraints**

* `dimension` **MUST** use SI base exponents; resource units **MUST** define `basis` (e.g., `flops * hours`).

---

## 5. Settler Verbs Registry (`arky:registry:verbs@v1`)

**Purpose:** Canonical Settler verb definitions (pay, refund, slash, control, etc.) with JSON schemas, safety classes, and rail compatibility.

**Complete specification:** See **[ARKY-REGISTRY-VERBS-v1.md](ARKY-REGISTRY-VERBS-v1.md)** for full details, including:
- URN patterns and versioning
- Complete entry schemas with `semantics`, `input_schema`, `safety`, `rails`
- Core verbs: pay, refund, slash, revoke, upgrade, signal, control
- Extension patterns for custom verbs
- Conformance requirements and test vectors

**Quick summary:**
- **Core verbs:** `arky:verb/pay@v1`, `arky:verb/refund@v1`, `arky:verb/slash@v1`, `arky:verb/revoke@v1`, `arky:verb/upgrade@v1`, `arky:verb/signal@v1`, `arky:verb/control@v1`
- **Extensions:** `arky:verb/<ns>.<name>@v<major>` (e.g., `arky:verb/custody.freeze@v1`)
- **Governance:** New verbs require RFC with JSON schema and test vectors

---

## 6. Rails & Anchor Targets Registry (`arky:registry:rails@v1`)

**Purpose.** Canonicalize anchor targets (chains, logs, etc.) for Notaries/Settlers, including default finality and proof profiles.

### 6.1 TargetURN Syntax

A **TargetURN** uniquely identifies an anchor target and **MUST** match one of:

1. **CAIP-2 blockchain**
   `caip2:<namespace>:<reference>`
   *Examples:* `caip2:eip155:1`, `caip2:cosmos:cosmoshub-4`.

2. **Solana cluster**
   `solana:<cluster>` with `<cluster> ∈ {mainnet, testnet, devnet}`.

3. **Bitcoin network**
   `btc:<network>` with `<network> ∈ {mainnet, testnet, signet, regtest}`.

4. **Transparency / audit log**
   `log:<authority>:<name>@<ver>`
   *Example:* `log:arky:transparency@v1`.

> Other schemes MUST be added via RFC and appear in this registry before use.

### 6.2 TargetEntry Schema

Each registered target **MUST** provide:

```json
{
  "urn": "string",                           // TargetURN (required)
  "kind": "blockchain" | "audit_log",        // required
  "network": "string",                       // e.g., "ethereum-mainnet" (required)
  "locator_schema": "string",                // e.g., "tx:<0xhex>", "sig:<base58>" (required)
  "proof_profile": "merkle-v1" | "merkle-blake3-v1",  // required
  "hash_alg": "sha256" | "blake3-256",      // required
  "leaf_encoding": "cid-bytes",              // required (v1 fixed)
  "default_finality": {                       // required for blockchains; optional for logs
    "depth": 64,                             // confirmations/blocks (integer)  (optional)
    "time": "PT2M"                           // ISO 8601 duration alternative    (optional)
  },
  "limits": {
    "max_batch_cids": 2048,                  // required
    "max_batch_bytes": 1048576               // required (1 MiB default suggestion)
  },
  "status": "active" | "deprecated" | "reserved" // required
}
```

**Notes**

* If both `depth` **and** `time` are present, implementations **MUST** honor the stricter.
* Registry values are **defaults**. Policy Packs may **raise** (never lower) them.
* Notaries apply the **maximum** of {registry default, Policy Pack, per-request override} before marking anchors *final*.

### 6.3 Algorithm Profiles

Profiles for Merkle/proofs. Notaries **MUST** implement `merkle-v1`.

* **`merkle-v1`**

  * Leaves: `cid` decoded to multihash bytes.
  * Node hash: `SHA-256(left || right)`.
  * Child order: **lexicographic by bytes** before hashing (stable roots).
  * Root encoding: multihash(SHA-256(root)) → multibase (Base58-BTC).
  * Path: array of multibase(mh) sibling hashes, bottom-up.

* **`merkle-blake3-v1`** (optional)

  * As above, but node hash `BLAKE3-256(left || right)` and root is multihash(BLAKE3-256(root)).

### 6.4 Initial Entries (v1)

Conservative defaults; raise via Policy Packs as needed.

| urn                      | kind       | network              | locator_schema | proof_profile | hash_alg | leaf_encoding | default_finality       | limits (cids/bytes) | status |
| ------------------------ | ---------- | -------------------- | -------------- | ------------- | --------- | ------------- | ---------------------- | ------------------- | ------ |
| caip2:eip155:1           | blockchain | ethereum-mainnet     | tx:<0xhex>     | merkle-v1     | sha256    | cid-bytes     | depth: 64              | 2048 / 1_048_576    | active |
| solana:mainnet           | blockchain | solana-mainnet       | sig:<base58>   | merkle-v1     | sha256    | cid-bytes     | depth: 150             | 4096 / 1_048_576    | active |
| btc:mainnet              | blockchain | bitcoin-mainnet      | txid:<hex>     | merkle-v1     | sha256    | cid-bytes     | depth: 6               | 1024 / 1_048_576    | active |
| log:arky:transparency@v1 | audit_log  | arky-transparency v1 | entry:<seqno>  | merkle-v1     | sha256    | cid-bytes     | time: PT0S (immediate) | 8192 / 1_048_576    | active |

### 6.5 Validation Rules

* TargetURN **MUST** match §6.1 schemes.
* `limits.max_batch_cids ≥ 1`; `limits.max_batch_bytes ≥ 65536`.
* For blockchains, at least one of `default_finality.depth` or `.time` **MUST** be set.
* `proof_profile` and `hash_alg` **MUST** be from §6.3.

---

## 7. Attestation Formats Registry (`arky:registry:attest-formats@v1`)

**Purpose.** Stable identifiers for the `fmt` field carried in Attestation Evidence, with parse/validation hints.

**Entry (authoritative shape)**

```json
{
  "fmt_id": "<attest-format-id>",               // e.g., "eat-cbor", "sgx-quote"
  "container": "jws" | "cose" | "tpm2" | "other",
  "serialization": "cbor" | "der" | "json" | "bin",
  "schema_ref": "arky:schema/<id>@v<major>",    // structural validation reference
  "jose_header_keys": ["<key>"],                // if container=jws
  "cose_labels": ["<int-or-label>"],            // if container=cose
  "tpm_struct": "<tpm-struct-id>",              // if container=tpm2
  "digest_rules": {"payload_field": "<path>", "hash": "sha-256" | "blake3-256"}
}
```

**Rules**

* `fmt_id` **MUST** be globally unique and referenced by Attestation Types (§8).
* `schema_ref` **MUST** resolve to an ARKY-SCHEMA-v1 definition.
* Detection hints (`jose_header_keys` / `cose_labels` / `tpm_struct`) **SHOULD** allow unambiguous identification.
* Breaking changes **MUST** publish a new `fmt_id` or bump `@v<major>` in the referenced schema.

---

## 8. Attestation Types Registry (`arky:registry:attest-types@v1`)

**Purpose.** Canonical list of permitted attestation types (`arky:attest/<scheme>@v<major>`), their bindings, freshness, trust anchors, revocation, and normalized-claims mapping.

**Entry (authoritative shape)**

```json
{
  "urn": "arky:attest/<scheme>@v<major>",

  "container": "jws" | "cose" | "tpm2" | "other",
  "fmts": ["<attest-format-id>"],               // from §7

  "bindings": {
    "required": ["key","content"],              // subset of "key","content","account"
    "optional": ["account"]
  },

  "freshness": {
    "max_age_ms": 0,                            // verifier acceptance bound
    "accept_skew_ms": 0                         // tolerated clock skew
  },

  "trust_anchors": {
    "model": "x509" | "vendor" | "embedded",
    "root_ids": ["<stable-root-id>"],           // resolvable identifiers
    "distribution": "jws" | "pem" | "bin",
    "policy": "hard" | "soft"                    // soft = fail-open on network unavailability
  },

  "revocation": {
    "methods": ["ocsp","crl","list","none"],
    "cache_ttl_ms": 0,
    "soft_fail": false
  },

  "claims_map": {
    "hw_vendor": "<path>",
    "hw_model": "<path>",
    "tee": "<path>",
    "sw_measurement": "<path>",
    "debug": "<path>",
    "anti_rollback": "<path>",
    "boot_state": "<path>",
    "key_class": "<path>",
    "origin": "<path>",
    "extensions": {"ns:key": "<path>"}
  },

  "reference_values": {
    "measurements": ["<ref-urn-or-hash>"],
    "policy_predicates": ["<ref-urn>"]
  },

  "hash_algs": ["sha-256","blake3-256"],

  "detection": {
    "markers": {"jose": ["<hdr>"], "cose": ["<label>"], "tpm2": ["<tag>"]}
  },

  "vectors": ["/vectors/attest/<id>.json"],
  "deprecation": {"replaced_by": "arky:attest/...@v<major>", "sunset": "RFC3339"}
}
```

**Rules**

* `urn` **MUST** be unique and versioned; breaking semantics require `@v<major+1>`.
* `fmts[]` **MUST** reference existing **Attestation Formats** entries (§7).
* `bindings.required` **MUST** include at least one of `key` or `content`.
* `claims_map` **MUST NOT** redefine normalized claim semantics; absent claims are omitted (never `null`).
* `trust_anchors`/`revocation` **MUST** be sufficient for verifier chain building; behavior **MUST** match Attestations v1.
* `vectors[]` **MUST** exist before an entry is marked "stable".

---

## 9. Device Classes Registry (`arky:registry:devices@v1`)

### 9.1 URNs

* `arky:device/<class>` (e.g., `arky:device/camera.rgb`, `arky:device/thruster.t4`).

### 9.2 Entry

```json
{
  "urn": "arky:device/camera.rgb",
  "description": "RGB camera sensor",
  "fields": {"fov_deg": "number", "sn": "string"},
  "attestation": {"recommended": true}
}
```

**Constraints**

* Device fields **SHOULD** be minimal and generic; domain specifics belong in profiles.

---

## 10. Discovery & Distribution

* **Index:** `GET /.well-known/arky/registries` → list of registry locators.
* **Fetch:** `GET /registries/<ns>@v1.json` → registry JSON with `sig`.
* **Caching:** Registries **SHOULD** include `cid` and `ETag`; clients **SHOULD** cache with TTL.

* `/.well-known/arky/registries` **MUST** list locators for:

  * `arky:registry:attest-formats@v1`
  * `arky:registry:attest-types@v1`
* Providers **SHOULD** include `cid` and `ETag` on both registries; clients **SHOULD** cache with TTL.

---

## 11. Conformance

* **R1 — Provider:** publish signed registries; resolve aliases; version correctly; RFC path for changes.
* **R2 — Consumer:** resolve aliases; validate signatures; enforce version/namespace rules; reject unknown required fields.
* **R3 — Extender:** when adding entries, provide JSON schemas and vectors; bump versions on breaking changes.
* **R-AT1 — Formats:** `attest-formats@v1` snapshot is signed, schema-valid, and referenced by types.
* **R-AT2 — Types:** `attest-types@v1` snapshot is signed, schema-valid, references valid formats, and ships vectors.
* **R-AT3 — Consumers:** Clients validate that Evidence `fmt ∈ attest-formats` and `type ∈ attest-types`; alias cycles **MUST NOT** be accepted.

---

## 12. Constraints Matrix (Informative)

| Area         | MUST                                    | SHOULD                            |
| ------------ | --------------------------------------- | --------------------------------- |
| Signing      | JCS + JWS Ed25519                       | publish `cid`                     |
| URNs         | `arky:<ns>/<name>` or CAIP-2 for chains | alias with care                   |
| Versioning   | `@v<major>` for breaking changes        | semver metadata in entry          |
| Distribution | well-known endpoints; HTTP             | ETag/TTL caching                  |
| Proofs       | use registered `proof_profile` + `hash_alg`; **lexicographic Merkle** ordering | |
| Finality     | encode depth/time in entry; Notary uses **max(registry, policy, override)** | |
| Compliance   | RFC for additions; vectors for verbs    | minimal fields, avoid duplication |
| Attestation  | validate fmt/type against registries   | enforce binding requirements     |

---

## 13. Cross-Spec References (Informative)

* **ARKY-ATTESTATIONS-v1:** `Evidence.fmt` and `Evidence.type` **MUST** resolve to Attestation Formats (§7) and Attestation Types (§8) registries.
* **Discovery:** ServiceDescriptors **SHOULD** declare `capabilities.attestation.required` and `capabilities.attestation.types` using `arky:attest/*` URNs.

---

## 14. Versioning & Governance

* **Spec ID:** `ARKY-REGISTRIES-v1`.
* Changes follow RFC with public vectors where applicable (verbs). Backwards compatibility **RECOMMENDED**.

---

## Appendix A — TargetURN Regex (Informative)

```
CAIP2:        ^caip2:[a-z0-9]+:[A-Za-z0-9._-]+$
SOLANA:       ^solana:(mainnet|testnet|devnet)$
BTC:          ^btc:(mainnet|testnet|signet|regtest)$
LOG:          ^log:[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*@v[0-9]+$
ATTEST_FMT:   ^arky:attest:[a-z0-9._-]+@[v][0-9]+$
ATTEST_TYPE:  ^arky:attest:[a-z0-9._-]+@[v][0-9]+$
```

---

## Quick Reference (Informative)

| Registry | Purpose | Key URNs | Validation |
|----------|---------|----------|------------|
| **Units** | Standardized units & resources | `arky:unit:currency@v1`, `arky:unit:data@v1` | Fixed enums, no decimals |
| **Verbs** | Settler operation semantics | `arky:verb:pay@v1`, `arky:verb:refund@v1`, `arky:verb:slash@v1` | Registry-controlled namespacing |
| **Rails** | Execution targets & algorithms | `arky:rail:ach:us@v1`, `caip2:eip155:1` | Chain-specific, algorithm profiles |
| **Attest Formats** | Credential format types | `arky:attest:jwt@v1`, `arky:attest:ld@v1`, `arky:attest:jws@v1` | IETF/W3C standard alignment |
| **Attest Types** | Credential semantics | `arky:attest:kyc@v1`, `arky:attest:device-cert@v1` | Registry-controlled vocabulary |
| **Devices** | Hardware class identifiers | `arky:device:temp.ds18b20`, `arky:device:gps.trimble-r10` | Manufacturer.model pattern |

**Common Envelope:** All registries use JWS over JCS with `registry_id`, `name`, `ts`, `entries`, `aliases`, `sig`.

**URN Pattern:** `arky:<type>:<name>@v<version>` for registry-controlled identifiers.

---

**End of Registries (v1).**
