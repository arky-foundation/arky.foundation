# Arky RFCs

Structured proposals for changes to specs, schemas, registries, and processes.

## When To Use an RFC
- New spec or breaking change to an existing spec
- Structural schema changes (new `$id`) or registry semantics changes
- Changes spanning multiple areas (e.g., Discovery + Media Types)
- Process/governance updates

Use a regular PR (no RFC) for typos, non‑breaking clarifications, CI/config, or minor example fixes.

## Categories & Templates
- Specification — `rfcs/templates/spec-template.md`
- Registry — `rfcs/templates/registry-template.md`
- Process — `rfcs/templates/process-template.md`
- Security — `rfcs/templates/security-template.md`

## Lifecycle (Lightweight)
- Draft: propose with context and goals
- Review: technical, security, and compatibility feedback
- Decision: accept/reject/defer with rationale
- Implement: update specs/schemas/vectors and docs

## How To Submit
- Create from a template: copy the right file from `rfcs/templates/`
- Open a PR with title: `RFC-XXXX: <concise title>`
- Link the PR to the RFC file and any tracking issue
- Iterate with reviewers; update status in the RFC header

## Current RFCs
- `rfcs/0001-compatibility-matrix.md` — Compatibility Matrix (v1)
