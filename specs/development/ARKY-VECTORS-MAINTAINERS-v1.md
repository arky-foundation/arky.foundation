---
spec_id: ARKY-VECTORS-MAINTAINERS-v1
title: Arky — Vectors Maintainers Guide
version: v1
status: stable
effective: 2025-10-15
doc_type: guide
normative_default: false  # Informative; ARKY-VECTORS-v1 remains normative
depends_on:
  - ARKY-VECTOR-v1
summary: >
Operational guide for test suite maintainers: adding vectors, PR workflow,
manifest generation, signed releases, and CI automation.
permalink: /guides/ARKY-VECTOR-MAINTAINER-v1
last_updated: 2025-10-15
---

# Arky — Vectors Maintainers Guide (v1)

**Audience:** Test suite maintainers, Vectors WG members

**Purpose:** Day-to-day operational procedures for curating conformance vectors.

See also: `specs/development/ARKY-VECTORS-v1.md` for normative vector schema and harness requirements.

---

## 1. Roles

* Suite Maintainer: Curates a specific suite (TIM, Kernel, Notary, Settlers, etc.)
* Vectors WG: Coordinates cross-suite releases, signs manifests, enforces quality gates

---

## 2. Case Naming & IDs

**File naming:** `<level>-<number>.json`

**ID prefixes by suite:**

| Suite | Prefix | Example |
|-------|--------|---------|
| TIM | `t1-*`, `t2-*`, `t3-*` | `t1-001.json` |
| Canonicalization | `c1-*`, `c2-*`, `c3-*` | `c2-042.json` |
| Kernel | `k1-*`, `k2-*`, `k3-*` | `k1-005.json` |
| Notary | `n1-*`, `n2-*`, `n3-*` | `n2-013.json` |
| Settlers | `s1-*`, `s2-*`, `s3-*` | `s3-007.json` |
| Discovery | `d1-*`, `d2-*`, `d3-*` | `d1-keys-001.json` |
| Identity | `i1-*`, `i2-*`, `i3-*` | `i2-jws-001.json` |
| Attestations | `a1-*`, `a2-*`, `a3-*` | `a1-evidence-001.json` |
| Verbs | `v-<verb>-*` | `v-pay-001.json` |
| Policy | `p*-*` | `p2-finality-001.json` |
| Registries | `r*-*` | `r1-urns-001.json` |

**Requirements:**
- `id` field **MUST** match filename stem
- IDs **MUST** be globally unique within suite
- Version suffix for updates: `t1-001-v2.json`

---

## 3. Adding a New Vector

### Step 1: Create Vector File

1. Place JSON under `/vectors/<suite>/<level>/`
2. Follow schema from `specs/development/ARKY-VECTORS-v1.md#4-vector-file-schema-normative`
3. Ensure deterministic inputs (see `specs/development/ARKY-VECTORS-v1.md#5-determinism-context-normative`)

### Step 2: Quality Gates (local)

Run before opening PR:

```bash
# Schema validation
validate-vectors --file <path-to-vector>.json

# Determinism check
- [ ] No system time (use context.time)
- [ ] No network I/O (use fixtures)
- [ ] No secrets/PII
- [ ] Test keys only
- [ ] Finite numbers only (no NaN/Inf)
```

### Step 3: Open PR

Include in PR description:
- **Rationale:** Which spec clauses does this test?
- **Expected outcome:** Pass/fail with specific error codes
- **Coverage:** What gap does this fill?

### Step 4: Review Checklist

Suite Maintainer verifies:
- [ ] Maps to explicit spec clause (cite §X.Y)
- [ ] Adds coverage (not redundant)
- [ ] Uses correct error codes (from [ARKY-VECTORS-v1 §12](ARKY-VECTORS-v1.md#12-error-codes-normative))
- [ ] Schema valid
- [ ] Deterministic fixtures

### Step 5: Update Manifest

After merge:

```bash
# Compute hash
sha256sum <suite>/<level>/<vector>.json

# Add to manifest.json

  "files": [
    "path": "<suite>/<level>/<vector>.json", "sha256": "<hash>"
  ]

```

---

## 4. Modifying an Existing Vector

### For Corrections (typos, wrong expected values)

1. **DO NOT** edit in place
2. Create new file: `<id>-v2.json`
3. Add to original vector:
   ```json
   {
     "deprecated": true,
     "deprecated_reason": "Typo in expected cid",
     "replaced_by": "<id>-v2"
   }
   ```
4. Bump patch version (v1.0.0 → v1.0.1)

### For Semantic Changes

1. Create new vector with new ID
2. Mark old vector as deprecated (maintain for ≥6 months)
3. Bump major version if breaking (v1 → v2)

See `specs/development/ARKY-VECTORS-v1.md#141-vector-evolution-policy` for versioning policy.

---

## 5. Manifest & Release Process

### Per-suite Manifest

**Location:** `/vectors/<suite>/manifest.json`

**Schema:**
```json

  "suite": "tim",
  "version": "v1.2.0",
  "level_coverage": { "t1": 12, "t2": 8, "t3": 6 },
  "files": [
    "path": "t1-verify/t1-001.json", "sha256": "abc123..."
  ],
  "ts": "2025-10-15T00:00:00Z",
  "cid": "zQm...",
  "sig": "eyJ..."

```

**Generate:**
```bash
# 1. Compute hashes for all vectors
find <suite> -name "*.json" -exec sha256sum {} \;

# 2. Update manifest.json with hashes and timestamp
# 3. Canonicalize and compute CID
jcs-canonicalize manifest.json | sha256sum

# 4. Sign with Vectors WG key
jws-sign --key <wg-key> manifest.json
```

### Top-Level RELEASES.json

**Location:** `/vectors/RELEASES.json`

**Schema:**
```json

  "version": "v1.2.0",
  "release_date": "2025-10-15",
  "suites": {
    "tim": { "manifest_hash": "sha256:xyz789..." },
    "kernel": { "manifest_hash": "sha256:abc456..." }
  },
  "signature": "<jws>"

```

**Update on release:**
1. Bump version (semver)
2. Add/update suite manifest hashes
3. Sign entire RELEASES.json
4. Tag release: `git tag v1.2.0`

---

## 6. CI Automation

### On Pull Request

Automated checks:
- [ ] schema validation (vector files)
- [ ] manifest integrity (hashes match)
- [ ] no network references (except allowed fixtures)
- [ ] no large binaries (>1MB)
- [ ] determinism checks (no Date.now(); use context)

### On Release Tag

Automated workflow:
1. Re-hash all vectors in changed suites
2. Generate/update suite `manifest.json`
3. Compute manifest CID
4. Sign manifest with Vectors WG key
5. Update top-level `RELEASES.json`
6. Sign `RELEASES.json`
7. Create GitHub release with artifacts

---

## 7. Suite Seed Vectors

**Initial minimum set** for each suite (for bootstrapping CI):

| Suite | Seeds | Purpose |
|-------|-------|---------|
| **Canonicalization** | `c1-001`, `c2-001`, `c3-001` | Byte ordering, CID, cross-verify |
| **TIM** | `t1-001`, `t2-001`, `t3-001` | Signature, unit requirement, quorum |
| **Notary** | `n1-001`, `n2-001`, `n3-001` | Inclusion proof, finality, multi-anchor |
| **Settlers** | `s1-001`, `s2-001`, `s3-001` | Success, failure, rollback |
| **Discovery** | `d1-001`, `d2-001`, `d3-001` | JWK, descriptor, compatibility |
| **Kernel** | `k1-001`, `k2-001`, `k3-001` | Deterministic eval, policy, conflicts |

Each seed **MUST** cite exact spec clauses tested.

---

## 8. Quick Reference

**Add vector:** Create JSON → Validate → Open PR → Update manifest after merge

**Modify vector:** Never edit in place → Create v2 → Deprecate original → Bump version

**Release:** Update manifests → Compute CIDs → Sign → Tag release → Publish results

**Naming:** `<level>-<number>.json` (e.g., `t1-001.json`, `s2-042-v2.json`)

**Commit style:** Conventional commits, 50 char max (`feat(vectors): add d1 revocations`)

---

**See [ARKY-VECTORS-v1](ARKY-VECTORS-v1.md) for:**
- Vector file schema (§4)
- Fixture mechanism (§6)
- Harness requirements (§8)
- Results schema (§9)
- Pass criteria (§11)
- Error taxonomy (§12)
