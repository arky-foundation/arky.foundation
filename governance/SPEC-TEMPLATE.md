---
spec_id: ARKY-<NAME>-v1
title: Arky — <Title>
version: v1
status: draft
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-TIM-v1
summary: >
  One‑sentence summary of scope and impact.
links:
  home: https://arky.foundation/specs/
  schemas: https://arky.foundation/schemas/
governance:
  owner: Arky Foundation <WG/Council>
  process: RFC with public vectors
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/ARKY-<NAME>-v1
last_updated: 2025-10-15
---

# Arky — <Title> (v1)

All sections are normative unless marked Informative.

## 1. Scope
State what this spec covers and excludes (out of scope). Keep concise.

## 2. Terminology
Define key terms used throughout. Make identifiers precise and stable.

## 3. Data Model
Provide canonical JSON shapes and constraints. Reference or include the
JSON Schema `$id` if one exists or is added in this change.

```json
{
  "example": true
}
```

Constraints:
- List MUST/SHOULD rules that aren’t in the schema (cross‑object constraints).

## 4. Behavior & Interfaces
Describe functional rules, ordering, idempotency, and any wire endpoints (HTTP/gRPC)
referencing ARKY‑WIRE‑v1 and ARKY‑MEDIA‑TYPES‑v1.

## 5. Security & Privacy
Document mandatory protections (keys, revocations, no PII/PHI, replay, finality, etc.).

## 6. Conformance
Define levels (e.g., 1/2/3), what must be implemented or satisfied, and
references to relevant vectors.

## 7. Versioning & Governance
Note spec_id, change process, backward‑compatibility guidance.

## Quick Reference (Informative)

| Topic | MUST | SHOULD | Notes |
| ----- | ---- | ------ | ----- |
| …     | …    | …      | …     |