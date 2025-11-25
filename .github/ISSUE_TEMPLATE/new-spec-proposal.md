---
name: New Spec Proposal (RFC)
about: Propose a new Arky specification or major change
title: "RFC: ARKY-<NAME>-v1 — <Title>"
labels: ["spec:proposal", "rfc"]
assignees: []
---

## Summary
One paragraph explaining the change and why it matters.

## Motivation
What problem is being solved? Who benefits? Prior art?

## Proposal
- Scope and out-of-scope
- Data model (JSON shapes) and `$id` for new schemas (if applicable)
- Behavior & interfaces (HTTP/gRPC media types, idempotency)
- Security & privacy (keys, revocations, PII/PHI, finality)

## Compatibility
- Cross-version impact; required updates to other specs
- Migration path for implementers

## Registries & Vectors
- New/updated registry entries (units/verbs/rails/attest-types)
- Conformance vectors needed/updated (suite/levels)

## Rollout
- Owners, milestones, draft → stable timeline

## Appendix (optional)
- Examples (move to examples/ in PR)

