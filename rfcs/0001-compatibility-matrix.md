# RFC-0001: Compatibility Matrix (v1)

Status: Accepted
Authors: Spec WG
Tracing: specs/ARKY-COMPAT-MATRIX-v1.md

## Summary
Publish an explicit cross-version compatibility matrix for v1 specs.

## Motivation
Prevent downgrade and mismatch issues across independent implementations.

## Proposal
Add `specs/governance/ARKY-COMPAT-MATRIX-v1.md` with normative tuples for v1.

## Compatibility
No breaking changes; documentation of current expectations.

## Security & Privacy
Improves client ability to reject incompatible services (anti-downgrade).

## Rollout
Land spec and link from Discovery and SDK docs.