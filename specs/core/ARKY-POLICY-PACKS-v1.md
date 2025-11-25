---

spec_id: ARKY-POLICY-PACKS-v1
title: Arky — Policy Packs Framework
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
  - ARKY-NOTARY-v1
  - ARKY-SETTLERS-v1
summary: >
  Defines machine-verifiable Policy Packs that encode regional/legal defaults
  for identity proofs, privacy, residency, witness/finality/rollback policies,
  and dispute venues. Packs are referenced by implementations to ensure
  predictable behavior across jurisdictions.
links:
  core: https://arky.foundation/specs/core/ARKY-TIM-v1
  notary: https://arky.foundation/specs/core/ARKY-NOTARY-v1
  settlers: https://arky.foundation/specs/core/ARKY-SETTLERS-v1
  schema: https://arky.foundation/schemas/core/policy-pack-v1.json
  rfcs: https://arky.foundation/rfcs/
  registries: https://arky.foundation/registries/
governance:
  owner: Arky Foundation Policy Council
  process: RFC with regional review and public vectors
authors:
  - Arky Foundation Policy WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/core/ARKY-POLICY-PACKS-v1
last_updated: 2025-10-15

---

# Arky — Policy Packs Framework (v1)

spec ID: ARKY-POLICY-PACKS-v1
Effective: 2025-10-15

**All sections are normative unless labeled *Informative*.** This specification defines the structure, signing, and conformance requirements for **Policy Packs** used by Notaries, Settlers, and applications.

---

## 1. Scope

* Applies to Arky components that enforce region/legal defaults.
* Defines: pack structure, inheritance/overrides, signing & discovery, and conformance levels.
* Out of scope: domain business logic, UI, and private bilateral agreements.

---

## 2. Terminology

* **Policy Pack (Pack):** A signed JSON document declaring normative parameters for a jurisdiction or sector.
* **Root Pack:** Baseline Pack published by the Foundation.
* **Overlay Pack:** Organization-specific Pack that extends a Root Pack via additive/override rules.
* **Effective Policy:** The resolved result of applying overlays on a root (see §4).

---

## 3. Pack Model

A Pack **MUST** conform to the following model. JSON schema is authoritative.

```json
{
  "pack_id": "arky:policy:<region>@v1",
  "name": "<human-readable>",
  "region": {
    "locales": ["en-US", "es-419"],
    "jurisdictions": ["US", "CA"],
    "sector": ["general"]
  },
  "metadata": {
    "version": "1.0.0",
    "issuer": "did:web:arky.foundation",
    "ts": "2025-10-15T00:00:00Z"
  },
  "identity_proofs": {
    "allowed_methods": ["did:web", "did:key", "x509"],
    "account_ids": ["caip10"],
    "credential_profiles": ["w3c-vc", "sd-jwt"]
  },
  "privacy": {
    "selective_disclosure": true,
    "public_anchor_fields": ["cid"],
    "redaction_rules": ["no-phi", "no-pii"],
    "retention_days": 365
  },
  "residency": {
    "store_in": ["US"],
    "share_out": ["US", "EU"],
    "legal_basis": ["contract", "consent"]
  },
  "witness_policy": {
    "min_witnesses": 2,
    "classes": ["notary", "auditor"],
    "independence": true
  },
  "finality_policy": {
    "chains": {
      "eip155:1": {"depth": 64},
      "solana:mainnet": {"depth": 150}
    }
  },
  "rollback_policy": {
    "rails": {
      "sepa:eu": {"window": "P2D"},
      "ach:us": {"window": "P2D"},
      "eip155:*": {"window": "P0D"}
    }
  },
  "dispute": {
    "venues": ["icc", "court"],
    "arb_rules": ["uncitral"]
  },
  "export_controls": {
    "restricted": ["ITAR"],
    "require_screening": true
  },
  "logging": {
    "immutable_journal": true,
    "public_transparency": false
  },
  "time_policy": {
    "clock_skew_max": "PT90S",
    "freshness_max": "PT10M",
    "accept_exp_default": "PT2H"
  },
  "anchoring": {
    "targets": ["caip2:eip155:1", "solana:mainnet", "log:arky:transparency@v1"],
    "multi_anchor_required": true
  },
  "verbs_rails": {
    "allowed_verbs": ["arky:verb/pay","arky:verb/refund","arky:verb/slash","arky:verb/revoke","arky:verb/upgrade","arky:verb/signal","arky:verb/control"],
    "allowed_rails": ["caip2:*","sepa:eu","ach:us","custody:*","hw:*"],
    "experimental_verbs_allowlist": ["arky:verb/x-contracts.freeze@v1"]
  },
  "limits": {
    "amount_caps": [
      {"verb": "arky:verb/pay", "rail": "sepa:eu", "asset": "EUR", "max": 50000}
    ],
    "rate_limits": {"per_minute": 120, "burst": 240},
    "two_person_control": ["arky:verb/slash","arky:verb/revoke"]
  },
  "extends": "arky:policy:global@v1",
  "sig": "<jws-compact>"
}
```

**Constraints**

* `pack_id` **MUST** be globally unique and versioned.
* `sig` **MUST** be a JWS (Ed25519) over the canonical JSON (JCS).
* `finality_policy.chains` **MUST** use **CAIP‑2** identifiers.
* `rollback_policy.rails` **MUST** use registered rail identifiers.
* `privacy.public_anchor_fields` **MUST NOT** allow PHI/PII fields.

---

## 4. Inheritance & Overrides

* Packs **MAY** declare `extends`.
* **Resolution order:** start with Root Pack → apply overlays in listed order → **last write wins** per key path.
* **Forbidden overrides:** An Overlay **MUST NOT** weaken `privacy.redaction_rules` or `witness_policy.min_witnesses` below the Root Pack.
* Effective Policy **MUST** be serializable and signed when distributed.

### 4.1 Activation & Precedence

**Activation sources (in order):** deployment default → scope default → explicit `policy_pack_id` on commitment/request.
**Precedence/merge:** later overrides earlier; conflict resolution = **most-restrictive wins**:
privacy/residency (stricter), finality (higher), witnesses (higher), caps/limits (lower), retention (shorter). Unknown **major** versions are rejected.

---

## 5. Discovery & Distribution

* **Well‑known URL:** `/.well-known/arky/policy/<pack_id>` **MUST** resolve to the Pack JSON.
* **DID service:** Issuer DIDs **SHOULD** publish a service endpoint `arkyPolicy` with pack locators.
* **Hash addressing:** Distributors **SHOULD** publish pack `cid` for pinning and tamper evidence.

---

## 6. Enforcement Hooks

Implementations **MUST** expose a way to bind a Pack:

* **Notary:** Accept `policy_pack_id` in submission or via server policy; enforce witness/finality/residency.
* **Settler:** Accept `policy_pack_id` with commitments; enforce rollback windows, custody segregation, and export controls.
* **Apps:** Include `policy_pack_id` in commitments/scopes for auditability.

### 6.1 Deterministic Evaluation

Given Pack set `P = [global, regional*, scope?, explicit?]`:

1. Validate signature/expiry/schema for each.
2. Merge with precedence rule above.
3. Clamp any **PolicyHints** / **ClockSpec** (below) to Pack bounds.
4. Emit `effective_policy` artifact `{id, sections, ts}` (cacheable).

### 6.2 Recognized Policy Hints (from commitments/requests)

```
PolicyHints := {
  rollback_window?: string,       // ISO 8601; MUST be ≤ rail cap
  two_person?: boolean,           // MAY require stronger control; cannot disable required control
  quarantine_skew?: string        // MUST be ≤ clock_skew_max
}
```

### 6.3 ClockSpec Interop (Notary)

```
ClockSpec := {
  notarize?: [string],            // allowed targets subset (CAIP-2/log URNs)
  deadline?: string,              // RFC3339; MUST be ≤ accept_exp_default unless allowed
  ordering?: {lamport?: number}   // DTN hint; may be ignored if out of policy
}
```

---

## 7. Conformance

Levels for Packs and Implementers:

* **P1 — Pack Validity:** JCS canonicalization; JWS signature valid; schema conformant; allowed IDs/rails.
* **P2 — Enforcement:** Implementer enforces privacy/witness/finality/rollback as specified.
* **P3 — Auditability:** Implementer emits verifiable logs of decisions tied to the Pack and retains them for ≥ `privacy.retention_days`.

A Pack or implementation **MAY** claim `Policy Packs v1 P1/P2/P3` only if vectors pass.

---

## 8. Security & Privacy

* Do not publish sensitive fields in Packs.
* Treat `extends` chains as untrusted until every link is verified.
* Use key rotation; publish revocation lists for compromised issuers.

---

## 9. Constraints Table (Informative)

| Area           | MUST                                      | SHOULD                          |
| -------------- | ----------------------------------------- | ------------------------------- |
| Identity proofs | explicit allowed methods; resolvable keys | VC/SD‑JWT profiles listed       |
| Finality       | CAIP‑2 chain ids; numeric depths          | per‑chain rationale documented  |
| Rollback       | rail identifiers; ISO‑8601 duration       | compensating actions documented |
| Privacy        | no PHI/PII in public anchors              | tokenization/ZKP enabled         |
| Witness        | `min_witnesses` ≥ root; independence      | class diversification           |
| Residency      | `store_in`/`share_out` lists              | legal basis references          |
| Signing        | JCS + JWS Ed25519; unique `pack_id`       | publish `cid`                   |

---

## 10. Versioning & Governance

* **Spec ID:** `ARKY-POLICY-PACKS-v1`.
* Changes via RFC with regional review. Backwards compatibility **RECOMMENDED**; migrations documented.

### 10.1 Error Codes (aligned with Vectors/Notary/Settlers)

`unknown_policy`, `expired_policy`, `policy_violation`, `witness_quorum_failed`, `finality_unmet`, `forbidden_rail`, `forbidden_verb`, `amount_cap_exceeded`, `residency_violation`, `privacy_violation`, `deadline_exceeded`.

---

**End of Policy Packs Framework (v1).**
