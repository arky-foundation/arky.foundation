---
spec_id: ARKY-GOVERNANCE-v1
title: Arky — Governance & RFC Process
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-TIM-v1
  - ARKY-REGISTRIES-v1
  - ARKY-VECTORS-v1
  - ARKY-DISCOVERY-v1
summary: >
  Defines roles, authorities, RFC lifecycle, voting, versioning, deprecation,
  registry admissions, conformance claims, release packaging, and security
  incident response for the Arky standards.
links:
  rfcs: https://arky.foundation/rfcs/
  vectors: https://arky.foundation/vectors/
  registries: https://arky.foundation/registries/
  security: https://arky.foundation/security/
governance:
  owner: Arky Foundation Board
  councils: [Technical Council, Policy Council]
  process: RFC with public review and conformance vectors
authors:
  - Arky Foundation Governance WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/ARKY-GOVERNANCE-v1
last_updated: 2025-10-15
---

# Arky — Governance & RFC Process (v1)

All sections are normative unless marked Informative.

## 1. Scope

Defines: governance bodies and authorities; RFC lifecycle; voting and quorum;
versioning and deprecation; registry admissions; conformance and certification;
release packaging/signing; security incident response. Out of scope: funding, HR, tax.

## 2. Roles & Authorities

- Foundation Board — appoints councils; resolves TC/PC escalations.
- Technical Council (TC) — authority for technical specs and registries.
- Policy Council (PC) — authority for Policy Packs and defaults.
- Editors — per‑spec maintainers; apply editorial/clarification changes.
- Working Groups (WGs) — chartered to deliver RFCs, vectors, or registries.
- Registry Editors — maintain official registries (units, verbs, rails, devices, attestations).
- PIRT — product incident response team (security intake/triage, advisories).

Conflicts of interest must be disclosed; conflicted members must recuse on binding votes.

## 3. Decision Classes

- Editorial — typos/format/clarifications. Editor approval; 24h public window.
- Minor Technical — additive, backward compatible. 7‑day review; TC simple majority.
- Major Technical — breaking semantics/wire; security‑relevant. 14‑day review; TC 2/3; vectors required.
- Policy Changes — PC simple majority (minor) or 2/3 (major).
- Emergency Security — PIRT fast‑track; TC simple‑majority ratification within 7 days.

## 4. RFC Lifecycle

States: Draft → Review → Last Call → Accepted → Implementing → Stable → Deprecated → Obsoleted.

Artifacts required by state:
- Draft — problem statement, proposed text, compatibility notes.
- Review — diffs vs prior, impact analysis, initial vectors/schemas.
- Last Call — frozen text; registry diffs; vectors ready.
- Accepted — spec_id assigned; version plan declared.
- Implementing — ≥2 independent implementations in progress.
- Stable — vectors published; ≥2 implementations pass.
- Deprecated — sunset date + migration path.
- Obsoleted — successor spec_id; archival notice.

All RFC materials must live under `/rfcs/<id>/` with public issues. Minutes and vote tallies must be published.

## 5. Voting & Quorum

- Quorum: ≥60% of seated TC/PC members.
- Thresholds: per Decision Class.
- Abstain: permitted; counts toward quorum.
- Tie: Chair breaks ties for minor; Board resolves for major.
- COI: declare and recuse where materially beneficial.

## 6. Versioning, Stability & Deprecation

- Spec IDs: `ARKY-<NAME>-v<major>`; breaking change ⇒ new major.
- Patch releases: editorial/errata only; no observable behavior change; tagged `spec/ID/<version>`.
- Compatibility matrix: editors maintain cross‑version notes per release.
- Deprecation windows: minimum 180 days; 9 months recommended. Security fixes may shorten with PIRT approval.
- Clients must refuse services advertising lower spec levels than configured minima (Discovery).

## 7. Registries (Admission & Change Control)

- URNs: `arky:<namespace>/<name>`; chains must use CAIP‑2; verbs may include namespace and version (`ns.verb@v1`).
- Additions: require semantics, JSON Schema (where applicable), vectors, and security notes.
- Breaking changes: require new versioned entry (`…@v2`); aliases must not create cycles.
- Publication: snapshots must be JCS‑canonicalized, JWS Ed25519‑signed, publish a `cid`, and be discoverable via well‑known Discovery indexes.

## 8. Conformance & Certification

- Conformance claims must cite: spec version(s), vector suite/level(s), results JSON, commit hashes.
- Foundation may publish a public conformance directory.
- Misrepresentation or known failures must be disclosed.

## 9. Releases & Signing

- Spec tags: `spec/<SPEC_ID>/<semver>`.
- Vectors: `vectors/RELEASES.json` with manifest hashes.
- Schemas: `$id` URLs must be stable and content‑addressable by `cid` when referenced from Discovery.

### 9.1 Release / Promotion Checklist

Before advancing any spec's lifecycle `status` (§4) or flipping a vector
manifest's `ready_for_production` to `true`, ALL of the following MUST hold and
be re-verifiable from the repository:

1. **Validation green** — `bun run validate` passes (JSON syntax, conformance
   verifier, kernel‑vs‑schema, link checker) at the release commit.
2. **Vectors published** — every advertised level for the component has ≥1
   executable vector that the verifier runs (not schema‑only), and each
   negative vector is negative‑tested.
3. **Two independent implementations pass** — `@arky/core` (TS) and `arky-core`
   (Rust) both pass the component's vectors, and `scripts/cross-check.sh` shows
   byte‑identical agreement (canonical bytes → cids → decisions → receipts) for
   the levels claimed.
4. **Status consistency** — the spec `status`, its manifest
   `ready_for_production`/`overall_coverage`, `vectors/RELEASES.json`, the
   Compatibility Matrix, `CONFORMANCE.md`, and the SDK READMEs all describe the
   SAME maturity. No document may claim a higher state than the others.
5. **Lifecycle honesty** — `stable` requires the §4 process (Last Call freeze,
   spec_id/version plan, TC vote meeting quorum, published minutes) IN ADDITION
   to the technical bar. A spec that meets only the technical bar (vectors + two
   implementations) is at most `implementing`; it MUST NOT be labelled `stable`
   without the recorded vote.
6. **Results artifact** — `bun run results` regenerates `vectors/RESULTS.json`,
   and the conformance claim cites spec version(s), level(s), and commit hash
   (§8).

Promotion to `stable` additionally requires the recorded TC decision per §5.

## 10. Security Incident Response

- Intake: security@arky.foundation encrypted or portal; 24h triage acknowledgment.
- Embargo: coordinated disclosure; emergency changes via PIRT fast‑track.
- Advisory: CVE where applicable; vectors updated; required timelines for remediation.