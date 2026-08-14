---

spec_id: ARKY-COMPLIANCE-MAP-v1
title: Arky - Regulatory and Framework Mapping
version: v1
status: review
effective: 2026-08-14
doc_type: guide
normative_default: false  # Informative document
depends_on:
  - ARKY-TIM-v1
  - ARKY-NOTARY-v1
  - ARKY-KERNEL-v1
  - ARKY-SETTLERS-v1
  - ARKY-VECTORS-v1
summary: >
  How Arky artifacts map to the record-keeping, traceability, and
  accountability expectations of the EU AI Act, NIST AI RMF, ISO/IEC 42001,
  and adjacent regimes. Arky provides technical evidence; it does not by
  itself make a system compliant.
governance:
  owner: Arky Foundation Technical Council
  process: Maintained alongside specs; additive updates via RFC
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /guides/ARKY-COMPLIANCE-MAP-v1
last_updated: 2026-08-14
---

# Arky - Regulatory and Framework Mapping

**Scope and disclaimer.** This guide is Informative and is not legal advice.
Compliance is a property of a deployed system and its organization, never of a
protocol. What Arky provides is the strongest available *form* of the records
these regimes demand: signed, content-addressed, independently replayable
artifacts instead of mutable, trusted-source logs. Article and clause
references reflect the texts as publicly available at the time of writing;
verify against the current official versions before relying on them.

## 1. The four audit questions

Auditors of autonomous and agentic systems converge on four questions. Each
maps to exactly one Arky artifact:

| Question | Arky artifact | Why it is sufficient evidence |
| --- | --- | --- |
| Who authorized this action? | **Commitment** (Kernel) + identity proofs in **TIM** | The commitment declares actor, scope, intent, and policy before the action; it is signed and content-addressed, so it cannot be backdated or edited. |
| What context did the system have? | **TIM** receipts cited by the Decision | Every input the Kernel used is a signed evidence record; the Decision lists their cids (`assertions[].inputs`), so the exact context is enumerable and tamper-evident. |
| What did it decide, and when? | **Decision** + **Notary** witness/anchor | The decision is a deterministic function of commitment + evidence: an auditor re-runs the Kernel and must obtain the identical result. Notary receipts fix time and order. |
| Was execution consistent with the decision? | **XR** (Execution Receipt) | The XR links the executed verb, args hash, rail, and outcome to the decision's cid; a mismatch is mechanically detectable. |

The recurring enterprise gap is *intent observability*: logs show what an
agent did but not why. The Commitment + Decision pair is the "why", in
replayable form.

## 2. EU AI Act

Timing note: general application phases through 2025-2027; the main wave of
high-risk obligations applies from 2 August 2026.

| Obligation | Where | What is required | Arky mapping |
| --- | --- | --- | --- |
| Record-keeping | Art. 12 | High-risk AI systems must technically allow automatic recording of events (logs) over the system lifetime, enabling traceability of the system's functioning | Emit a TIM per relevant event and an XR per action. Content addressing + signatures exceed the integrity bar of conventional logging; `prev` chaining and Notary anchoring establish completeness and order. |
| Log retention | Art. 19, Art. 26 | Providers and deployers keep automatically generated logs under their control (minimum six months, subject to other law) | Arky artifacts are small canonical JSON, cheap to retain and to hand to an auditor; their validity is independent of the storage system's trustworthiness. |
| Human oversight | Art. 14 | Systems designed so natural persons can effectively oversee them | Policy Packs and Kernel commitments are the machine-enforced form of declared oversight: limits, required evidence, and consequence rules are explicit, versioned artifacts a human approved in advance. |
| Transparency to deployers | Art. 13 | Operation sufficiently transparent to interpret output and use it appropriately | A Decision enumerates every assertion, its input value, its evidence cids, and its tri-state result - interpretable by construction. |
| Post-market monitoring / incident reporting | Art. 72-73 | Providers monitor and report serious incidents | Incident reconstruction = replaying the signed chain. Disputes reduce to re-verification, not competing log excerpts. |

## 3. NIST AI RMF (1.x)

| Function | Expectation (abridged) | Arky mapping |
| --- | --- | --- |
| **Govern** | Accountability structures, roles, and policies are established and transparent | Commitments and Policy Packs are policies-as-artifacts: signed, versioned, attributable to an actor and scope. |
| **Map** | Context, capabilities, and limits are documented | Registries (units, verbs, rails) and Discovery descriptors declare the system's action surface explicitly. |
| **Measure** | Systems are tested with repeatable, documented methods (TEVV) | Conformance vectors are executable, negative-tested measurements; `RESULTS.json` is the reproducible test evidence. |
| **Manage** | Risks are monitored, and responses are documented | The TIM->Decision->XR chain is the response record; INDETERMINATE outcomes surface evidence gaps instead of silently proceeding. |

## 4. ISO/IEC 42001 (AI management systems)

42001 audits ask for documented, operating controls around AI lifecycle
events - logging, traceability of decisions, and records of human-defined
constraints. Arky artifacts serve as the *records* layer of such a management
system: each control claim ("agent spend is limited", "actions require fresh
evidence") corresponds to a commitment clause whose enforcement leaves a
signed trail. Procurement teams verifying a vendor against 42001 can be
handed a replayable bundle instead of a screenshot of a dashboard.

## 5. Financial regimes (second-priority tier)

- **DORA** (EU financial ICT resilience): incident records and traceability of
  ICT-supported transactions - XR chains with Notary anchors provide
  tamper-evident transaction trails across rails.
- **SOC 2**: change-management and processing-integrity criteria benefit from
  deterministic decision replay; auditor sampling becomes verification.
- **Existing payments audit trails** (e.g. PSD2/AML contexts): Arky does not
  replace regulated records; it binds them - a rail's native reference lands
  in `XR.anchors` and `locator`.

## 6. What Arky does not do

Arky does not classify your system's risk tier, satisfy notification duties,
perform data-protection impact assessments, or store personal data safely on
your behalf (public artifacts must carry no PHI/PII - see
`ARKY-SECURITY-BPR-v1`). Use this mapping to shorten the evidence portion of
an audit, not to skip the rest of it.
