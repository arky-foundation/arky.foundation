---
spec_id: ARKY-VECTORS-v1
title: Arky — Conformance Vectors
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-ERRORS-v1
  - ARKY-KERNEL-v1
  - ARKY-NOTARY-v1
  - ARKY-SETTLERS-v1
  - ARKY-REGISTRIES-v1
  - ARKY-POLICY-PACKS-v1
summary: >
  Defines machine-readable test vector schema, harness requirements, result formats,
  and error taxonomy for cross-implementation conformance testing across all Arky
  specifications.
links:
  schemas: https://arky.foundation/schemas/
  examples: https://arky.foundation/specs/development/ARKY-EXAMPLES-v1
governance:
  owner: Arky Foundation Technical Council
  process: RFC; vectors evolve with specs; minor patches allowed for corrections
authors:
  - Arky Foundation Dev WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/ARKY-VECTORS-v1
last_updated: 2025-10-15
---

# Arky — Conformance Vectors (v1)

**All sections are normative unless marked *Informative*.**

This document standardizes vector **formats**, **harness requirements**, **results schema**, and **error codes** so independent implementations can run identical CI.

---

## 1. Scope & Coverage

**Test suites:**

* **TIM Core** (T1/T2/T3) — Validation, completeness, witnessing
* **TIM Canonicalization** (C1/C2/C3) — JCS, CID, signature coverage
* **Kernel** (K1/K2/K3) — Deterministic evaluation, policy gating, conflicts
* **Notary** (N1/N2/N3) — Inclusion proofs, finality, multi-anchor
* **Settlers** (S1/S2/S3) — Success paths, failure modes, rollback
* **Discovery** (D1/D2/D3) — Well-known endpoints, descriptors, compatibility
* **Identity Bindings** (I1/I2/I3) — Resolution, key selection, revocation
* **Attestations** (A1/A2/A3) — Evidence validation, nonce binding, freshness
* **Verbs** (V-*) — Argument validation per verb schema
* **Policy Packs** (P-*) — Enforcement of constraints
* **Registries** (R-*) — URN resolution, alias handling

**Out of scope:** Performance benchmarks, stress tests, UI/UX testing.

**Note:** Concrete vector examples are provided in **ARKY-EXAMPLES-v1** for learning and reference.

---

## 2. Repository Layout (Informative)

```
/vectors/
  tim/               # T1, T2, T3 test cases
  canonicalization/  # C1, C2, C3
  kernel/            # K1, K2, K3
  notary/            # N1, N2, N3
  settlers/          # S1, S2, S3
  discovery/         # D1, D2, D3
  identity/          # I1, I2, I3
  attestations/      # A1, A2, A3
  verbs/             # V-*
  policy/            # P-*
  registries/        # R-*
  fixtures/          # Reusable test data (keys, rails, accounts)
  RELEASES.json      # Signed releases manifest
results-schema.json  # JSON schema for test results
```

---

## 3. Common Conventions

* **Encoding:** UTF-8 JSON, newline-terminated files
* **Determinism:** Input field order irrelevant; canonicalization defines hashing order
* **Numbers:** Finite IEEE-754 only; no NaN/Inf
* **IDs:** `cid` = Base58-BTC(Multihash(SHA-256, canonical_bytes))
* **Error codes:** Namespaced dot notation per ARKY-ERROR-v1 (e.g., `tim.invalid_signature`)

---

## 4. Vector File Schema (Normative)

All vector files **MUST** conform to:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://arky.foundation/schemas/testing/vector-v1.json",
  "type": "object",
  "required": ["id", "spec", "level", "inputs", "expect"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9]+-[0-9]{3}(-v[0-9]+)?$",
      "description": "Unique vector ID (e.g., t1-001, s2-042-v2)"
    },
    "spec": {
      "type": "string",
      "pattern": "^ARKY-[A-Z-]+-v[0-9]+$",
      "description": "Target specification ID"
    },
    "level": {
      "type": "string",
      "pattern": "^[A-Z][0-9]?$",
      "description": "Conformance level (T1, C1, K1, etc.)"
    },
    "context": {
      "type": "object",
      "properties": {
        "time": {
          "type": "string",
          "format": "date-time",
          "description": "Fixed current time for deterministic execution"
        },
        "seed": {
          "type": "string",
          "description": "RNG seed for deterministic randomness"
        },
        "fixtures": {
          "type": "object",
          "additionalProperties": { "type": "string" },
          "description": "Map of fixture names to file paths"
        }
      }
    },
    "inputs": {
      "type": "object",
      "description": "Test inputs (spec-specific schema)"
    },
    "expect": {
      "type": "object",
      "required": ["errors"],
      "properties": {
        "valid": { "type": "boolean" },
        "errors": {
          "type": "array",
          "items": { "type": "string", "pattern": "^[a-z_]+\.[a-z_]+$" }
        }
      },
      "description": "Expected outputs (spec-specific schema)"
    },
    "deprecated": { "type": "boolean" },
    "deprecated_reason": { "type": "string" },
    "replaces": { "type": "string" }
  },
  "additionalProperties": false
}
```

**Field definitions:**

- **id**: Unique identifier `level-number` (e.g., `t1-001`), optional version suffix (`t1-001-v2`)
- **spec**: Target specification (e.g., `ARKY-TIM-v1`)
- **level**: Conformance level being tested (T1, T2, S1, etc.)
- **context**: Optional determinism controls (see §5)
- **inputs**: Spec-specific test inputs
- **expect**: Spec-specific expected outputs
  - **errors**: Array of expected error codes (empty if success expected)

---

## 5. Determinism Context (Normative)

The optional `context` object provides a deterministic execution environment:

```json
{
  "time": "2025-10-15T14:30:00Z",
  "seed": "test-seed-12345",
  "fixtures": {
    "test_key": "fixtures/keys/ed25519-test-01.json",
    "mock_rail": "fixtures/rails/ach-us-mock.json"
  }
}
```

**Harness requirements:**
- **time**: Harness **MUST** override `Date.now()` / `time.Now()` to return this value
- **seed**: Harness **MUST** seed RNG with this value (if crypto operations need deterministic randomness)
- **fixtures**: Harness **MUST** load referenced files from the vector repository (see §6)

**When to use:**
- Use `time` when testing expiry, deadlines, or rollback windows
- Use `seed` when signatures/nonces need reproducibility
- Use `fixtures` when referencing external data (keys, mock responses)

---

## 6. Fixture Mechanism (Normative)

Fixtures are external data files referenced by vectors to avoid duplication.

### 6.1 Directory Structure

```
/vectors/
  fixtures/
    keys/
      ed25519-test-01.json
      ed25519-test-02.json
    rails/
      ach-us-mock.json
      ethereum-mainnet-mock.json
    accounts/
      test-accounts.json
    tims/
      valid-tim-001.json
```

### 6.2 Reference Syntax

**Simple path reference:**
```json
{
  "inputs": {
    "signing_key": { "$ref": "fixtures/keys/ed25519-test-01.json" }
  }
}
```

**JSON Pointer reference:**
```json
{
  "inputs": {
    "public_key": { "$ref": "fixtures/keys/ed25519-test-01.json#/publicKey" }
  }
}
```

**Context fixture map:**
```json
{
  "context": {
    "fixtures": { "key1": "fixtures/keys/ed25519-test-01.json" }
  },
  "inputs": { "signing_key": { "$ref": "key1" } }
}
```

### 6.3 Resolution Algorithm

```typescript
function resolveFixture(ref: string, context: Context): any {
  const [path, pointer] = ref.split('#');
  const fixturePath = context.fixtures?.[path] || path;
  const fixture = loadJSON(`/vectors/${fixturePath}`);

  if (pointer) {
    return applyJSONPointer(fixture, pointer);
  }

  return fixture;
}
```

### 6.4 Fixture Immutability

- Fixture files **MUST NOT** be modified after vectors reference them
- Changes **MUST** create a new fixture file with an incremented name
- Fixtures **MUST** be included in manifest hash verification

---

## 7. Suite Coverage Overview (Informative)

| Suite | Levels | Key Test Areas |
|---|---|---|
| **TIM** | T1/T2/T3 | Signature validity, completeness, witness quorum |
| **Canonicalization** | C1/C2/C3 | Byte ordering, CID computation, signature coverage |
| **Kernel** | K1/K2/K3 | Deterministic evaluation, policy enforcement, conflict detection |
| **Notary** | N1/N2/N3 | Inclusion proofs, finality depth, multi-anchor coordination |
| **Settlers** | S1/S2/S3 | Successful execution, failure classification, rollback handling |
| **Discovery** | D1/D2/D3 | Well-known endpoints, descriptor validation, compatibility checks |
| **Identity** | I1/I2/I3 | DID resolution, key selection, revocation handling |
| **Attestations** | A1/A2/A3 | Evidence validation, nonce binding, freshness policies |
| **Verbs** | V-* | Argument schema validation per verb type |
| **Policy** | P-* | Constraint enforcement, finality requirements |
| **Registries** | R-* | URN resolution, alias handling, cycle detection |

See **ARKY-EXAMPLES-v1** for concrete vector examples across all suites.

---

## 8. Harness Requirements (Normative)

### 8.1 Isolation

Test harnesses **MUST** run with no network access unless a vector explicitly declares a local stub. All external dependencies **MUST** be replaced with local fixtures.

### 8.2 Determinism

Harnesses **MUST**:
- Support fixed time when provided by vector context
- Seed RNG deterministically when required
- Produce identical results for the same vector across runs

Non-deterministic outputs **MUST NOT** be allowed in CI environments.

### 8.3 Strict JSON

Implementations **MUST**:
- Reject JSON with duplicate keys
- Reject non-finite numbers (NaN, Infinity)
- Use strict JSON parsing

### 8.4 Byte Fidelity

No re-encoding of binary fixtures is permitted. Implementations **MUST** preserve exact byte sequences for signatures, hashes, and encoded data.

### 8.5 Skip Policy

**When skipping is valid:**
- Optional features not implemented (vector marked `"optional": true`)
- Missing dependencies (external service unavailable)
- Platform limitations (OS-specific features)
- Experimental vectors (marked `"experimental": true`)

**When skipping is INVALID:**
- Core required features (JCS, Ed25519, etc.)
- Lower conformance levels when claiming a higher level
- Vectors without `"optional"` or `"experimental"` flags

**Skip reporting:**
```json
{
  "id": "t2-005",
  "status": "skip",
  "reason": "DID-JWT not implemented (optional feature)",
  "duration_ms": 0
}
```

**Pass criteria impact:**
- To claim level X: **MUST** have 0 skips for levels ≤ X
- Skips for level X+1 are allowed
- Optional feature skips **MUST** be documented in the implementation manifest

### 8.6 Harness CLI Interface

Test harnesses **MUST** implement:

**Command:** `arky-harness run [options] <vector-path-or-suite>`

**Options:**
- `--suite <name>` — Run a specific suite
- `--level <X>` — Run a specific level
- `--output <path>` — Output file path
- `--format <json|tap|junit>` — Output format
- `--verbose` — Detailed logging
- `--fail-fast` — Stop on first failure

**Exit codes:**
- 0 = pass
- 1 = fail
- 2 = error
- 3 = malformed vector

**Output:** Results JSON per §9 schema

---

## 9. Results Schema (Normative)

All test results **MUST** conform to:

```json
{
  "$id": "https://arky.foundation/schemas/testing/results-schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["implementation", "environment", "suite", "cases", "totals"],
  "properties": {
    "implementation": {
      "type": "object",
      "required": ["name", "version", "language", "commit"],
      "properties": {
        "name": { "type": "string" },
        "version": { "type": "string" },
        "language": { "type": "string" },
        "commit": { "type": "string" }
      }
    },
    "environment": {
      "type": "object",
      "required": ["os", "arch", "runtime", "timestamp"],
      "properties": {
        "os": { "type": "string" },
        "arch": { "type": "string" },
        "runtime": { "type": "string" },
        "timestamp": { "type": "string", "format": "date-time" }
      }
    },
    "suite": {
      "type": "object",
      "required": ["spec_id", "level", "manifest_hash"],
      "properties": {
        "spec_id": { "type": "string" },
        "level": { "type": "string" },
        "manifest_hash": { "type": "string" }
      }
    },
    "cases": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "status", "duration_ms"],
        "properties": {
          "id": { "type": "string" },
          "status": { "type": "string", "enum": ["pass", "fail", "skip"] },
          "reason": {
            "type": "string",
            "description": "Human-readable failure/skip reason (REQUIRED if status != pass)"
          },
          "error_envelope": {
            "type": "object",
            "description": "Full ARKY-ERROR-v1 Error Envelope (OPTIONAL)",
            "properties": {
              "type": { "type": "string" },
              "code": { "type": "string" },
              "title": { "type": "string" },
              "detail": { "type": "string" },
              "status": { "type": "integer" },
              "instance": { "type": "string" },
              "severity": { "type": "string", "enum": ["error", "fatal", "warning"] },
              "ts": { "type": "string", "format": "date-time" }
            }
          },
          "duration_ms": { "type": "integer" }
        }
      }
    },
    "totals": {
      "type": "object",
      "required": ["passed", "failed", "skipped", "total"],
      "properties": {
        "passed": { "type": "integer" },
        "failed": { "type": "integer" },
        "skipped": { "type": "integer" },
        "total": { "type": "integer" }
      }
    }
  }
}
```

### 9.1 Result Example

```json
{
  "implementation": {
    "name": "arky-ts",
    "version": "1.0.0",
    "language": "TypeScript",
    "commit": "abc123"
  },
  "environment": {
    "os": "Linux",
    "arch": "x86_64",
    "runtime": "Node.js v20.10.0",
    "timestamp": "2025-10-15T14:30:00Z"
  },
  "suite": {
    "spec_id": "ARKY-TIM-v1",
    "level": "T1",
    "manifest_hash": "sha256:..."
  },
  "cases": [
    {
      "id": "t1-001",
      "status": "pass",
      "duration_ms": 42
    },
    {
      "id": "t1-002",
      "status": "fail",
      "reason": "Expected cid_mismatch error, got none",
      "duration_ms": 38
    }
  ],
  "totals": {
    "passed": 1,
    "failed": 1,
    "skipped": 0,
    "total": 2
  }
}
```

### 9.2 Failure Reason Format

The `reason` field **MUST** be present when `status` is `fail` or `skip`.

**For failures:**
- `"Expected cid 'zQmAbc...', got 'zQmXyz...'"`
- `"Expected error 'tim.invalid_signature', got no errors"`
- `"Signature verification failed: invalid Ed25519 signature"`

**For skips:**
- `"DID-JWT not implemented (optional feature)"`
- `"DID resolution service unavailable"`
- `"Platform limitation: Windows-only test"`

---

## 10. Manifest & Release Hygiene

### 10.1 Per-Suite Manifests

Each suite directory **MUST** contain `manifest.json` with SHA-256 hashes:

```json
{
  "suite": "tim",
  "version": "v1.0.0",
  "level_coverage": { "t1": 12, "t2": 8, "t3": 6 },
  "files": [
    { "path": "t1-verify/t1-001.json", "sha256": "abc123..." }
  ],
  "ts": "2025-10-15T00:00:00Z",
  "cid": "zQm...",
  "sig": "eyJ..."
}
```

### 10.2 Signed Releases

A top-level `RELEASES.json` **MUST** list suite versions with hashes:

```json
{
  "version": "v1.2.0",
  "release_date": "2025-10-15",
  "suites": {
    "tim": { "manifest_hash": "sha256:xyz789..." },
    "discovery": { "manifest_hash": "sha256:uvw456..." }
  },
  "signature": "<jws>"
}
```

---

## 11. Pass Criteria & Publication

### 11.1 Conformance Claims

To claim a level, implementations **MUST** achieve:
- 100% pass rate for that level
- 0 skips for that level and all lower levels in the suite
- Valid manifest hash verification

### 11.2 Results Publication

Implementations **SHOULD** publish results at `/results/<implementation>/<version>/<runId>.json` and link from Governance badges.

---

## 12. Error Codes (Normative)

All CI results **MUST** use the ARKY-ERROR-v1 Error Envelope format with namespaced codes:

**Complete taxonomy:**
* **discovery.***: `well_known_failed`, `descriptor_invalid`, `compatibility_failed`
* **identity.***: `resolution_failed`, `unknown_id`, `key_revoked`
* **attestation.***: `evidence_invalid`, `nonce_mismatch`, `freshness_failed`, `policy_violation`
* **tim.***: `cid_mismatch`, `signature_invalid`, `missing_unit`, `witness_quorum_failed`, `timestamp_skew_quarantine`, `missing_required`
* **kernel.***: `parse_error`, `unknown_function`, `unknown_unit`, `policy_denied`, `unauthorized`, `conflict`
* **notary.***: `anchor_pending`, `anchor_reorged`, `finality_unmet`, `proof_invalid`, `policy_violation`, `rate_limited`, `witness_quorum_failed`
* **settler.***: `unknown_verb`, `unsupported_rail`, `policy_denied`, `invalid_args`, `insufficient_funds`, `counterparty_reject`, `timeout`, `rate_limited`, `finality_unmet`, `anchor_reorg`, `irreversible`, `rollback_window_closed`, `deadline_exceeded`, `prior_verb_failed`
* **policy.***: `violation`, `pack_missing`
* **registry.***: `unknown_urn`, `alias_cycle`
* **vectors.***: `test_failed`, `unsupported_case`

Implementations **MUST** use these namespaced codes in CI results and include Error Envelope fields.

---

## 13. Security Notes

### 13.1 Content Restrictions

Vector files **MUST NOT** contain:
- PHI (Protected Health Information) or PII
- Live secrets or production credentials
- Real account balances or transaction data

### 13.2 Test Keys Only

All cryptographic keys in vectors **MUST** be test keys only. Ephemeral keys **MUST NOT** be reused across different suites.

### 13.3 Safe Handling

Implementations running vectors **MUST** ensure:
- No network access to external services unless explicitly declared
- Isolation from production systems
- Secure disposal of temporary data

---

## 14. Versioning & Governance

### 14.1 Vector Evolution Policy

**Addition of new vectors:**
- New vectors **MAY** be added via a minor version bump (v1.1.0 → v1.2.0)
- New vectors **MUST** include an updated manifest with new hashes
- Implementations **SHOULD** pass new vectors within 30 days

**Modification of existing vectors:**
- Corrections (typos, wrong values) **MUST** bump the patch version (v1.2.0 → v1.2.1)
- Semantic changes (new fields, different behavior) **MUST** bump the major version (v1 → v2)
- Modified vectors **MUST** update their vector ID (t1-001 → t1-001-v2)

**Deprecation:**
- Vectors **MAY** be marked `"deprecated": true` with a `"deprecated_reason"`
- Deprecated vectors **SHOULD** be maintained for ≥6 months
- A replacement vector **MUST** be provided with `"replaces": "old-vector-id"`

**Breaking changes:**
- v2 is required for: different canonicalization, incompatible schema changes, removed levels
- v2 vectors **MUST** live in a separate directory: `/vectors-v2/`
- Implementations **MAY** support multiple vector versions

### 14.2 Semantic Versioning

- **Major** (v1 → v2): Breaking changes requiring implementation updates
- **Minor** (v1.1 → v1.2): New vectors, backward-compatible additions
- **Patch** (v1.2.0 → v1.2.1): Error corrections, clarifications

### 14.3 Governance Process

* **Spec ID:** `ARKY-VECTORS-v1`
* Vector changes follow the RFC process
* Minor patches fix errors without changing semantics
* Breaking changes require a new major version (v2)

---