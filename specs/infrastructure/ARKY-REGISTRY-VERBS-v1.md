---

spec_id: ARKY-REGISTRY-VERBS-v1
title: Arky — Verbs Registry
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-SETTLERS-v1
  - ARKY-KERNEL-v1
  - ARKY-REGISTRIES-v1
summary: >
  Canonical definitions and JSON schemas for Arky core settler verbs. Provides
  URNs, semantics, safety class, and input argument schemas to ensure
  deterministic execution across rails.
links:
  settlers: https://arky.foundation/specs/core/ARKY-SETTLERS-v1
  kernel: https://arky.foundation/specs/core/ARKY-KERNEL-v1
  registries: https://arky.foundation/specs/infrastructure/ARKY-REGISTRIES-v1
  vectors: https://arky.foundation/vectors/
  rfcs: https://arky.foundation/rfcs/
governance:
  owner: Arky Foundation Technical Council
  process: RFC required for additions/changes; test vectors mandatory
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/infrastructure/ARKY-REGISTRY-VERBS-v1
last_updated: 2025-10-15

---

# Arky — Verbs Registry (v1)

Spec ID: ARKY-REGISTRY-VERBS-v1
Effective: 2025-10-15

**All sections are normative unless labeled *Informative*.** This document defines the **core** cross-rail verbs, their URNs, semantics, safety classes, and **argument schemas**. Implementations **MUST** validate verb arguments against these schemas before execution.

---

## 1. Scope

* Applies to **Settlers** and **Kernel** evaluators authorizing `then: [Verb]` lists.
* Out of scope: rail-specific transport fields (handled by settlers per rail).

---

## 2. Versioning & Namespacing

* **URNs:** Core verbs use explicit major versions: `arky:verb/<name>@v<major>`. Current set is `@v1`.
* **Breaking changes:** introduce a new major URN (e.g., `arky:verb/pay@v2`). Old URNs remain valid until deprecation window closes.
* **Extensions:** `arky:verb/<ns>.<name>@v<major>` (e.g., `arky:verb/custody.freeze@v1`).
* **Experimental:** `arky:verb/x-<org>.<name>@v<major>`; not for production unless allow-listed by policy.

---

## 3. Common Types

**Amount**

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["value", "unit"],
  "properties": { "value": { "type": "number" }, "unit": { "type": "string" } }
}
```

**PartyId** (rail-agnostic identifier)

```json
{ "type": "string" }    
# DID, CAIP-10, IBAN, enterprise id, or device id depending on rail
```

---

## 4. Verb: `arky:verb/pay@v1`

**Semantics**: Transfer `amount` from the settlement context to `to`. Rail selection is policy/settler-specific.
**Safety class**: `funds`.

**Input schema** (`https://arky.foundation/schemas/verbs/pay@v1.json`)

```json
{
  "$id": "https://arky.foundation/schemas/verbs/pay@v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object", "additionalProperties": false,
  "required": ["to", "amount"],
  "properties": {
    "to": { "$ref": "#/$defs/PartyId" },
    "amount": { "$ref": "#/$defs/Amount" },
    "rail": { "type": "string" },
    "reference": { "type": "string" },
    "metadata": { "type": "object" }
  },
  "$defs": {
    "Amount": { "type": "object", "required": ["value","unit"], "properties": { "value": { "type": "number" }, "unit": { "type": "string" } }, "additionalProperties": false },
    "PartyId": { "type": "string" }
  }
}
```

**Constraints**

* `amount.unit` **MUST** be an ISO-4217 code or CAIP-19 asset unit.
* If `rail` present, it **MUST** be known to the settler (see Rails Registry).
* Idempotency is enforced at the settler interface, not within args.

---

## 5. Verb: `arky:verb/refund@v1`

**Semantics**: Return funds associated with a prior execution.
**Safety class**: `funds`.

**Input schema** (`https://arky.foundation/schemas/verbs/refund@v1.json`)

```json
{
  "$id": "https://arky.foundation/schemas/verbs/refund@v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object", "additionalProperties": false,
  "required": ["original"],
  "properties": {
    "original": { "type": "string" },
    "amount": { "$ref": "#/$defs/Amount" },
    "to": { "$ref": "#/$defs/PartyId" },
    "reason": { "type": "string" }
  },
  "$defs": {
    "Amount": { "type": "object", "required": ["value","unit"], "properties": { "value": { "type": "number" }, "unit": { "type": "string" } }, "additionalProperties": false },
    "PartyId": { "type": "string" }
  }
}
```

**Constraints**

* `original` **MUST** be an Execution Receipt `cid` or rail `tx_ref`.
* If `amount` omitted → full remaining refundable amount.
* Rail **SHOULD** follow the original execution unless policy allows otherwise.

---

## 6. Verb: `arky:verb/slash@v1`

**Semantics**: Deduct `amount` from a bonded/staked position or posted guarantee.
**Safety class**: `custody`.

**Input schema** (`https://arky.foundation/schemas/verbs/slash@v1.json`)

```json
{
  "$id": "https://arky.foundation/schemas/verbs/slash@v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object", "additionalProperties": false,
  "required": ["bond", "amount", "reason_code"],
  "properties": {
    "bond": { "type": "string" },
    "amount": { "$ref": "#/$defs/Amount" },
    "reason_code": { "type": "string" },
    "policy_ref": { "type": "string" }
  },
  "$defs": {
    "Amount": { "type": "object", "required": ["value","unit"], "properties": { "value": { "type": "number" }, "unit": { "type": "string" } }, "additionalProperties": false }
  }
}
```

**Constraints**

* `bond` **MUST** identify the custodial/staking position in the target rail.
* Settler **MUST** log and anchor the resulting Execution Receipt.

---

## 7. Verb: `arky:verb/revoke@v1`

**Semantics**: Revoke a capability/license/credential.
**Safety class**: `authz`.

**Input schema** (`https://arky.foundation/schemas/verbs/revoke@v1.json`)

```json
{
  "$id": "https://arky.foundation/schemas/verbs/revoke@v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object", "additionalProperties": false,
  "required": ["subject", "capability_id"],
  "properties": {
    "subject": { "$ref": "#/$defs/PartyId" },
    "capability_id": { "type": "string" },
    "reason": { "type": "string" }
  },
  "$defs": { "PartyId": { "type": "string" } }
}
```

**Constraints**

* `capability_id` **SHOULD** be a VC id/DID URL or registry URN.

---

## 8. Verb: `arky:verb/upgrade@v1`

**Semantics**: Upgrade a capability/license/plan in place.
**Safety class**: `authz`.

**Input schema** (`https://arky.foundation/schemas/verbs/upgrade@v1.json`)

```json
{
  "$id": "https://arky.foundation/schemas/verbs/upgrade@v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object", "additionalProperties": false,
  "required": ["subject", "capability_id", "to"],
  "properties": {
    "subject": { "$ref": "#/$defs/PartyId" },
    "capability_id": { "type": "string" },
    "to": { "type": "string" },
    "effective_at": { "type": "string", "format": "date-time" }
  },
  "$defs": { "PartyId": { "type": "string" } }
}
```

**Constraints**

* `to` **MUST** be a valid target version/plan id per registry/policy.

---

## 9. Verb: `arky:verb/signal@v1`

**Semantics**: Emit a signed, anchorable signal (e.g., event/notice) to subscribed systems.
**Safety class**: `informational`.

**Input schema** (`https://arky.foundation/schemas/verbs/signal@v1.json`)

```json
{
  "$id": "https://arky.foundation/schemas/verbs/signal@v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object", "additionalProperties": false,
  "required": ["channel", "message"],
  "properties": {
    "channel": { "type": "string" },
    "message": { "type": "string" },
    "severity": { "type": "string", "enum": ["info","warn","error"] }
  }
}
```

**Constraints**

* Signals **MUST NOT** be treated as authorizations to move funds or control devices.

---

## 10. Verb: `arky:verb/control@v1`

**Semantics**: Issue a **high-risk** control command to a registered device/system via the appropriate rail.
**Safety class**: `control` (requires policy gating).

**Input schema** (`https://arky.foundation/schemas/verbs/control@v1.json`)

```json
{
  "$id": "https://arky.foundation/schemas/verbs/control@v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object", "additionalProperties": false,
  "required": ["target", "action"],
  "properties": {
    "target": { "type": "string" },
    "action": { "type": "string" },
    "params": { "type": "object" },
    "safety": { "type": "object", "additionalProperties": false,
      "properties": {
        "two_person": { "type": "boolean" },
        "rollback_window": { "type": "string" }
      }
    }
  }
}
```

**Constraints**

* `control` **MUST** respect Policy Packs (two-person control, rollback, export controls).
* Settlers **MUST** verify device class/allowlist before execution.

---

## 11. Constraints Table (Informative)

| Area       | MUST                                  | SHOULD                                    |
| ---------- | ------------------------------------- | ----------------------------------------- |
| Validation | schema-validate verb args             | link to registries for rails/units        |
| Safety     | enforce policy (two-person, rollback) | anchor Execution Receipts                 |
| Versioning | new URN for breaking change           | use namespaced `@v<major>` for extensions |
| Funds      | ISO-4217/CAIP-19 in `amount.unit`     | match rail to policy defaults             |
| Control    | device allowlist & class checks       | add attestation proofs                    |

---

## 12. Governance

* Additions/changes require RFC, argument schema, vectors, and security review.
* Deprecations announced with migration guidance; old URNs remain valid until EOL window closes.

---

**End of Core Verbs Registry (v1).**