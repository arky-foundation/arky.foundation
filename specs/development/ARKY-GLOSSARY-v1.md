---
spec_id: ARKY-GLOSSARY-v1
title: Arky — Terminology & Style Guide
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - RFC 2119
  - RFC 8785
summary: >
  Standardized terminology, capitalization rules, field naming conventions,
  and style guidelines for all Arky specifications, documentation, and implementations.

links:
style_examples: https://arky.foundation/examples/style/
naming_tool: https://arky.foundation/tools/naming/

references:
  - RFC 2119  # Key words for use in RFCs to Indicate Requirement Levels
  - RFC 8785  # JSON Canonicalization Scheme (JCS)

governance:
  owner: Arky Foundation Technical Council
  process: RFC with public review and community feedback
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/ARKY-GLOSSARY-v1
last_updated: 2025-10-15
---

# Arky Terminology & Style Guide

**Version:** 1.0
**Last Updated:** 2025-10-15
**Status:** Normative for all Arky specifications

This document defines standard terminology, capitalization, and usage conventions for all Arky specifications, documentation, and implementations.

## Core Terminology

### Artifacts & Objects

| Term | Usage | Notes |
|---|---|---|
| **TIM** or **TIM receipt** | Preferred in prose | Not "receipt", "tim", or "TIM Receipt" |
| **cid** | Always lowercase in technical text | Not "CID", "Cid", or "content_id" |
| **XR** | In code, schemas, APIs | Short for ExecutionReceipt |
| **ExecutionReceipt** | In prose, documentation | Formal name; XR is the shorthand |
| **Commitment** | Capitalized when referring to the Kernel object | Generic "commitment" is lowercase |
| **Decision** | Capitalized when referring to the Kernel output | Generic "decision" is lowercase |
| **WitnessReceipt** | One word, capitalized | Not "Witness Receipt" or "witness-receipt" |
| **AnchorRecord** | One word, capitalized | Not "Anchor Record" |
| **InclusionProof** | One word, capitalized | Not "inclusion proof" in schemas |

### Components & Services

| Term | Usage | Notes |
|---|---|---|
| **Notary** | Capitalized when referring to the service | Generic "notary" is lowercase |
| **Kernel** | Capitalized when referring to the component | Generic "kernel" is lowercase |
| **Settler** | Capitalized when referring to the component | Not "Settlement Service" |
| **Rail** | Capitalized when referring to execution infrastructure | e.g., "ACH Rail", "Ethereum Rail" |
| **Policy Pack** | Two words, both capitalized | Not "PolicyPack" or "policy pack" |

### Technical Terms

| Term | Usage | Notes |
|---|---|---|
| **JCS** | All caps, no periods | JSON Canonicalization Scheme (RFC 8785) |
| **JWS** | All caps | JSON Web Signature |
| **DID** | All caps | Decentralized Identifier |
| **URN** | All caps | Uniform Resource Name |
| **CID** | All caps when explaining the acronym | Use lowercase "cid" in technical usage |
| **multibase** | One word, lowercase | Not "multi-base" or "MultiBase" |
| **multihash** | One word, lowercase | Not "multi-hash" or "MultiHash" |

### Fields & Properties

| Term | Usage | Notes |
|---|---|---|
| **cid** | Lowercase in JSON fields | `"cid": "zQm..."` |
| **sig** | Lowercase, short form | Not "signature" in JSON |
| **ts** | Lowercase, short form | Not "timestamp" in JSON |
| **rev** | Lowercase | For causal chain references |
| **commitment_cid** | snake_case with lowercase cid | Not "commitmentCid" or "commitment_CID" |
| **kernel_cid** | snake_case with lowercase cid | Not "kernelCid" |
| **request_id** | snake_case | Not "requestId" |
| **verb** | Lowercase | e.g., `"verb": "arky:verb/pay@v1"` |

### Error Codes

| Term | Usage | Notes |
|---|---|---|
| **Error codes** | Lowercase with dots | e.g., `settler.insufficient_funds` |
| **Error namespaces** | Lowercase | `common.*`, `tim.*`, `settler.*` |
| **Error Envelope** | Capitalized | When referring to the object type |

### Protocols & Standards

| Term | Usage | Notes |
|---|---|---|
| **Arky** | Always capitalized | Project name |
| **ARKY-TIM-v1** | All caps, hyphenated | Spec ID format |
| **RFC 8785** | "RFC" all caps, space before number | Not "rfc8785" or "RFC-8785" |
| **Ed25519** | Capital E, lowercase d | Signature algorithm |
| **EdDSA** | Capital E, d, DA | Not "EDDA" or "eddsa" |
| **SHA-256** | All caps, hyphen | Not "sha256" or "SHA256" |

---

## Verb Naming

### Standard Format

```
urn:arky:verb:<name>@v<version>
```

**Examples:**
- `arky:verb/pay@v1`
- `arky:verb/refund@v1`
- `arky:verb/control@v1`

**Rules:**
- Verb names are lowercase
- Use `@v1` version suffix
- No underscores or hyphens in verb names
- Keep names concise (1 word preferred)

---

## Capitalization Rules

### When to Capitalize

**Capitalize when:**
- Referring to a specific Arky component (Kernel, Notary, Settler)
- Referring to a specific object type (TIM, Commitment, Decision, ExecutionReceipt)
- Starting a sentence
- In titles and headers

**Lowercase when:**
- Using as a generic term ("the kernel evaluates")
- In code, JSON, or technical examples
- In field names (`cid`, `sig`, `ts`)

### Examples

|  Correct |  Incorrect |
|---|---|
| "The Kernel evaluates assertions" | "The kernel Evaluates assertions" |
| "A TIM receipt contains a cid" | "A tim Receipt contains a CID" |
| "The ExecutionReceipt (XR) has a status" | "The Execution Receipt (xr) has a status" |
| "Settlers execute verbs on rails" | "settlers Execute Verbs on Rails" |

---

## Abbreviations & Acronyms

### Preferred Abbreviations

| Full Term | Abbreviation | Usage |
|---|---|---|
| ExecutionReceipt | XR | Code, schemas, APIs |
| Time, Identity, Measurement | TIM | Always |
| Content Identifier | cid | Technical text (lowercase) |
| JSON Canonicalization Scheme | JCS | Always |
| JSON Web Signature | JWS | Always |
| Decentralized Identifier | DID | Always |
| Request for Comments | RFC | Always (with number) |

### When NOT to Abbreviate

- First usage in a document (spell out, then abbreviate)
- User-facing documentation (prefer full terms)
- Error messages (use clear descriptions)

---

## Common Mistakes to Avoid

|  Avoid |  Use Instead |
|---|---|
| "TIM Receipt" | "TIM" or "TIM receipt" |
| "CID" (in code) | "cid" |
| "execution receipt" | "ExecutionReceipt" or "XR" |
| "tim.missing_required" | `tim.missing_required` (in code formatting) |
| "Witness Receipt" | "WitnessReceipt" |
| "commitment_CID" | "commitment_cid" |
| "SettlementReceipt" | "ExecutionReceipt" |
| "multi-hash" | "multihash" |
| "kernel_CID" | "kernel_cid" |
| "Pay Verb" | "pay verb" or "`pay@v1`" |

---

## Pluralization

| Singular | Plural | Notes |
|---|---|---|
| TIM | TIMs | Not "TIM's" |
| cid | cids | Lowercase |
| Receipt | Receipts | Standard |
| Witness | Witnesses | Standard |
| Policy Pack | Policy Packs | Not "PolicyPacks" |

---

## Section References

### Cross-references in Specs

**Format:** `§<number>` or `§<number>.<number>`

**Examples:**
- "See §4.2 for details"
- "Per ARKY-TIM-v1 §6.1"
- "Validation rules in §3"

**Not:**
- "See section 4.2"
- "Per §4.2.0"
- "See 4.2"

---

## URN Format

### Standard Pattern

```
urn:arky:<type>:<name>@v<version>
```

**Examples:**
- `arky:verb/pay@v1`
- `arky:rail/ach:us@v1`
- `arky:scope/treasury@v1`
- `arky:policy/witness-quorum@v1`

**Rules:**
- All lowercase
- Use colons for hierarchy
- Use `@v<n>` for versioning
- Hyphens in names are allowed (e.g., `witness-quorum`)

---

## Field Naming Conventions

**JSON fields:**
- Multi-word fields: snake_case (e.g., `commitment_cid`, `request_id`)
- Lowercase "cid" in all contexts
- Lowercase "id" in all contexts

**Markdown documentation:**
- Inline code: `` `cid` ``, `` `sig` ``, `` `pay@v1` ``
- Field names: Always in code formatting (`` `measurement.value` ``)
- Error codes: Always in code formatting (`` `settler.insufficient_funds` ``)

---

## Consistency Checklist

When writing or reviewing Arky documentation:

- [ ] "cid" is lowercase in all technical contexts
- [ ] "TIM" or "TIM receipt" used consistently (not "receipt")
- [ ] "XR" used in code, "ExecutionReceipt" in prose
- [ ] Component names are capitalized (Kernel, Notary, Settler)
- [ ] Field names are in snake_case with lowercase cid/id
- [ ] Error codes are in lowercase dot notation
- [ ] URNs follow the `urn:arky:<type>:<name>@v<version>` pattern
- [ ] Section references use the §<number> format
- [ ] Acronyms (JCS, JWS, DID) are all caps
- [ ] "multihash" and "multibase" are one word, lowercase

See **ARKY-EXAMPLES-v1** for usage examples and common style pitfalls.

---

## Enforcement

This glossary is **normative** for:
- All specifications in `/specs/`
- All documentation in this repository
- Reference implementations
- API documentation
- Error messages

**Non-normative** for:
- Marketing materials (may use friendlier terms)
- User interfaces (may simplify)
- Informal discussions

---

## Updates

This glossary follows semantic versioning:
- **Major:** Breaking terminology changes (avoid)
- **Minor:** New terms added
- **Patch:** Clarifications, typo fixes

Changes require RFC approval from the Arky Foundation Technical Council.

**Last Review:** 2025-10-15
**Next Review:** 2026-01-15