---

spec_id: ARKY-SCHEMAS-v1
title: Arky — Schemas
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:

* ARKY-TIM-v1
* ARKY-KERNEL-v1
* ARKY-NOTARY-v1
* ARKY-SETTLER-v1
* ARKY-REGISTRIES-v1
* ARKY-POLICY-PACK-v1
  summary: >
  Machine-readable JSON Schemas for core Arky artifacts: TIM, Kernel, Execution Receipt,
  Notary Anchor Objects, Policy Packs, and Registries. These schemas enable validation,
  codegen, and conformance vector automation.
  links:
  tim: [https://arky.foundation/specs/core/ARKY-TIM-v1](https://arky.foundation/specs/core/ARKY-TIM-v1)
  kernel: [https://arky.foundation/specs/core/ARKY-KERNEL-v1](https://arky.foundation/specs/core/ARKY-KERNEL-v1)
  notary: [https://arky.foundation/specs/core/ARKY-NOTARY-v1](https://arky.foundation/specs/core/ARKY-NOTARY-v1)
  settlers: [https://arky.foundation/specs/core/ARKY-SETTLER-v1](https://arky.foundation/specs/core/ARKY-SETTLER-v1)
  policy_packs: [https://arky.foundation/specs/core/ARKY-POLICY-PACK-v1](https://arky.foundation/specs/core/ARKY-POLICY-PACK-v1)
  registries: [https://arky.foundation/specs/infrastructure/ARKY-REGISTRIES-v1](https://arky.foundation/specs/infrastructure/ARKY-REGISTRIES-v1)
  vectors: [https://arky.foundation/vectors/](https://arky.foundation/vectors/)
  authors:
* Arky Foundation Spec WG
  license:
  text: CC-BY-4.0
  code: Apache-2.0
  permalink: /schemas/ARKY-SCHEMAS-v1
  last_updated: 2025-10-15

---

# Arky — Schemas (v1)

> **Note:** These schemas validate *structure*. Canonicalization, hashing/signatures, and domain semantics are enforced by their respective specs.

---

## 1) TIM Core — `tim-v1.json`

```json
{
  "$id": "https://arky.foundation/schemas/tim-v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["time", "identity", "measurement", "cid", "sig"],
  "properties": {
    "time": {
      "type": "object",
      "additionalProperties": false,
      "required": ["ts"],
      "properties": {
        "ts": {"$ref": "https://arky.foundation/schemas/common-defs-v1.json#/$defs/Rfc3339"},
        "witnesses": {"type": "array", "items": {"$ref": "https://arky.foundation/schemas/common-defs-v1.json#/$defs/JwsCompact"}},
        "ordering": {"type": "object", "additionalProperties": true}
      }
    },
    "identity": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id"],
      "properties": {
        "id": {"type": "string"},
        "claims": {"type": "array", "items": {"type": "string"}},
        "proofs": {"type": "array", "items": {"type": "string"}}
      }
    },
    "measurement": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "value", "method"],
      "properties": {
        "name": {"type": "string"},
        "value": {},
        "unit": {"type": "string"},
        "method": {"type": "string"},
        "device": {"type": "string"},
        "error": {"type": "string"},
        "code": {"type": "string"},
        "provenance": {"type": "object"}
      },
      "allOf": [
        {
          "if": {"properties": {"value": {"type": "number"}}, "required": ["value"]},
          "then": {"required": ["unit"]}
        }
      ]
    },
    "prev": {"$ref": "https://arky.foundation/schemas/common-defs-v1.json#/$defs/Cid"},
    "cid": {"$ref": "https://arky.foundation/schemas/common-defs-v1.json#/$defs/Cid"},
    "nonce": {"type": "string"},
    "exp": {"$ref": "https://arky.foundation/schemas/common-defs-v1.json#/$defs/Rfc3339"},
    "sig": {"$ref": "https://arky.foundation/schemas/common-defs-v1.json#/$defs/JwsCompact"}
  }
}
```

---

## 2) Kernel — `kernel-v1.json`

```json
{
  "$id": "https://arky.foundation/schemas/kernel-v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["scope", "actor", "intent", "measure", "consequence", "cid", "sig"],
  "properties": {
    "scope": {"type": "string"},
    "actor": {"type": "string"},
    "intent": {
      "type": "object",
      "additionalProperties": false,
      "required": ["do"],
      "properties": {
        "do": {"type": "string", "minLength": 1},
        "budget": {"$ref": "#/$defs/Amount"},
        "rate": {"type": "string"},
        "geofence": {"type": "string"},
        "approvals": {"type": "array", "items": {"type": "string"}}
      }
    },
    "measure": {
      "type": "array",
      "minItems": 1,
      "items": {"$ref": "#/$defs/MeasureSpec"}
    },
    "consequence": {
      "type": "array",
      "minItems": 1,
      "items": {"$ref": "#/$defs/ConsequenceSpec"}
    },
    "clock": {"$ref": "#/$defs/ClockSpec"},
    "policy": {"$ref": "#/$defs/PolicyHints"},
    "locale": {"type": "string"},
    "prev": {"type": "string"},
    "cid": {"type": "string"},
    "nonce": {"type": "string"},
    "exp": {"type": "string", "format": "date-time"},
    "sig": {"type": "string"}
  },
  "$defs": {
    "Amount": {
      "type": "object",
      "additionalProperties": false,
      "required": ["value", "unit"],
      "properties": {"value": {"type": "number"}, "unit": {"type": "string"}}
    },
    "MeasureSpec": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "assert"],
      "properties": {
        "name": {"type": "string"},
        "from": {"type": "string"},
        "window": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "start": {"type": "string"},
            "end": {"type": "string"},
            "max_age": {"type": "string"}
          }
        },
        "assert": {"type": "string"},
        "profile": {"type": "string"},
        "require": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "min_witnesses": {"type": "integer", "minimum": 0},
            "device_class": {"type": "array", "items": {"type": "string"}},
            "code": {"type": "array", "items": {"type": "string"}}
          }
        }
      }
    },
    "Verb": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "args"],
      "properties": {"name": {"type": "string"}, "args": {"type": "object"}}
    },
    "Limits": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "amount_max": {"$ref": "#/$defs/Amount"},
        "retries_max": {"type": "integer", "minimum": 0},
        "expiry": {"type": "string", "format": "date-time"}
      }
    },
    "ConsequenceSpec": {
      "type": "object",
      "additionalProperties": false,
      "required": ["if", "then"],
      "properties": {
        "if": {"type": ["string"]},
        "then": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/Verb"}},
        "limits": {"$ref": "#/$defs/Limits"}
      }
    },
    "ClockSpec": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "notarize": {"type": "array", "items": {"type": "string"}},
        "deadline": {"type": "string", "format": "date-time"},
        "ordering": {"type": "object", "properties": {"lamport": {"type": "integer", "minimum": 0}}, "additionalProperties": false}
      }
    },
    "PolicyHints": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "rollback_window": {"type": "string"},
        "two_person": {"type": "boolean"},
        "quarantine_skew": {"type": "string"}
      }
    }
  }
}
```

---

## 3) Execution Receipt — `execution-receipt-v1.json`

```json
{
  "$id": "https://arky.foundation/schemas/execution-receipt-v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["commitment_id", "verb", "rail", "inputs_cids", "status", "ts_exec", "cid", "sig"],
  "properties": {
    "commitment_id": {"type": "string"},
    "verb": {"type": "string"},
    "rail": {"type": "string"},
    "inputs_cids": {"type": "array", "items": {"type": "string"}},
    "tx_ref": {"type": "string"},
    "status": {"type": "string", "enum": ["success", "partial", "failed", "rolled_back"]},
    "ts_exec": {"type": "string", "format": "date-time"},
    "details": {"type": "object"},
    "prev": {"type": "string"},
    "cid": {"type": "string"},
    "sig": {"type": "string"}
  }
}
```

---

## 4) Notary Anchor Object — `anchor-object-v1.json`

```json
{
  "$id": "https://arky.foundation/schemas/anchor-object-v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["cid_root", "target", "ts_anchor", "finality"],
  "properties": {
    "cid_root": {"type": "string", "pattern": "^z[1-9A-HJ-NP-Za-km-z]+$"},
    "target": {"type": "string"},
    "locator": {"type": "string"},
    "ts_anchor": {"type": "string", "format": "date-time"},
    "finality": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status"],
      "properties": {
        "depth": {"type": "integer", "minimum": 0},
        "status": {"type": "string", "enum": ["pending", "final"]}
      }
    },
    "proof": {
      "type": "object",
      "additionalProperties": false,
      "required": ["scheme", "branch"],
      "properties": {
        "scheme": {"type": "string", "enum": ["merkle-v1", "merkle-blake3-v1"]},
        "branch": {"type": "array", "items": {"type": "string"}}
      }
    }
  }
}
```

---

## 5) Policy Pack — `policy-pack-v1.json`

```json
{
  "$id": "https://arky.foundation/schemas/policy-pack-v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["pack_id", "name", "region", "metadata", "identity_roots", "privacy", "witness_policy", "finality_policy", "rollback_policy", "dispute", "logging", "sig"],
  "properties": {
    "pack_id": {"type": "string"},
    "name": {"type": "string"},
    "region": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "locales": {"type": "array", "items": {"type": "string"}},
        "jurisdictions": {"type": "array", "items": {"type": "string"}},
        "sector": {"type": "array", "items": {"type": "string"}}
      }
    },
    "metadata": {
      "type": "object",
      "additionalProperties": false,
      "required": ["version", "issuer", "ts"],
      "properties": {
        "version": {"type": "string"},
        "issuer": {"type": "string"},
        "ts": {"type": "string", "format": "date-time"}
      }
    },
    "identity_roots": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "allowed_methods": {"type": "array", "items": {"type": "string"}},
        "account_ids": {"type": "array", "items": {"type": "string"}},
        "credential_profiles": {"type": "array", "items": {"type": "string"}}
      }
    },
    "privacy": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "selective_disclosure": {"type": "boolean"},
        "public_anchor_fields": {"type": "array", "items": {"type": "string"}},
        "redaction_rules": {"type": "array", "items": {"type": "string"}},
        "retention_days": {"type": "integer", "minimum": 0}
      }
    },
    "residency": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "store_in": {"type": "array", "items": {"type": "string"}},
        "share_out": {"type": "array", "items": {"type": "string"}},
        "legal_basis": {"type": "array", "items": {"type": "string"}}
      }
    },
    "witness_policy": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "min_witnesses": {"type": "integer", "minimum": 0},
        "classes": {"type": "array", "items": {"type": "string"}},
        "independence": {"type": "boolean"}
      }
    },
    "finality_policy": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "chains": {
          "type": "object",
          "additionalProperties": {"type": "object", "properties": {"depth": {"type": "integer", "minimum": 0}}, "additionalProperties": false}
        }
      }
    },
    "rollback_policy": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "rails": {"type": "object", "additionalProperties": {"type": "object", "properties": {"window": {"type": "string"}}, "additionalProperties": false}}
      }
    },
    "dispute": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "venues": {"type": "array", "items": {"type": "string"}},
        "arb_rules": {"type": "array", "items": {"type": "string"}}
      }
    },
    "export_controls": {"type": "object", "additionalProperties": true},
    "logging": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "immutable_journal": {"type": "boolean"},
        "public_transparency": {"type": "boolean"}
      }
    },
    "extends": {"type": "string"},
    "sig": {"type": "string"}
  }
}
```

---

## 6) Registries — `registries-v1.json`

```json
{
  "$id": "https://arky.foundation/schemas/registries-v1.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["registry_id", "name", "ts", "entries", "sig"],
  "properties": {
    "registry_id": {"type": "string"},
    "name": {"type": "string"},
    "ts": {"type": "string", "format": "date-time"},
    "entries": {"type": "object", "additionalProperties": true},
    "aliases": {"type": "object", "additionalProperties": {"type": "string"}},
    "sig": {"type": "string"}
  }
}
```

---

## 7) Common Definitions — `common-defs-v1.json`

Shared reusable definitions referenced by other schemas.

*File: [`/schemas/core/common-defs-v1.json`](./core/common-defs-v1.json)*

Contains: `Rfc3339`, `IsoDuration`, `Cid`, `JwsCompact`, `Caip2`, `Uri`, `Semver`.

---

## 8) Service Descriptor — `service-descriptor-v1.json`

Schema for ARKY-DISCOVERY-v1 ServiceDescriptor objects.

*File: [`/schemas/core/service-descriptor-v1.json`](./core/service-descriptor-v1.json)*

References common-defs-v1.json and includes type-specific capabilities for:
- Notary (anchor_targets, finality_defaults, batch_limits, etc.)
- Settler (rails_supported, verbs_supported, rollback_support, etc.)
- Registry (namespaces, schema_uris, max_payload_bytes)
- Policy (pack_ids, storage_residency)

---

## 9) Discovery Index — `discovery-index-v1.json`

Schema for ARKY-DISCOVERY-v1 well-known endpoint responses.

*File: [`/schemas/infrastructure/discovery-index-v1.json`](./infrastructure/discovery-index-v1.json)*

Contains ServiceRef, PolicyRef, and RegistryRef definitions for discovery.

---

## 10) Revocations — `revocations-v1.json`

Schema for ARKY-REVOCATIONS-v1 revocation lists and individual revocation objects.

*File: [`/schemas/infrastructure/revocations-v1.json`](./infrastructure/revocations-v1.json)*

Supports key revocation, credential revocation, and registry entry revocation.

---

## 11) Schemas Index — `schemas-index-v1.json`

Meta-schema defining the structure of schema index documents.

*File: [`/schemas/meta/schemas-index-v1.json`](./meta/schemas-index-v1.json)*

Used internally for schema discovery and versioning.

---

## 12) Vector Manifests — `vector-manifest-v1.json` & `vector-suite-manifest-v1.json`

Schemas for ARKY-VECTORS-v1 conformance test suites and manifests.

*Files:*
- [`/schemas/testing/vector-manifest-v1.json`](./testing/vector-manifest-v1.json) - Individual vector file structure
- [`/schemas/testing/vector-suite-manifest-v1.json`](./testing/vector-suite-manifest-v1.json) - Suite-level manifest
- [`/schemas/testing/vectors-releases-v1.json`](./testing/vectors-releases-v1.json) - Release index with hashes

Used for conformance testing and vector distribution.

---

**End of Schemas (v1).**
