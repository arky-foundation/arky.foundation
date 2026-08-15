# Security Policy

## Scope

- The Arky specifications, JSON schemas, registries, and conformance vectors:
  report issues that could mislead implementers or weaken cryptographic,
  identity, or privacy requirements.
- The reference implementations (`packages/core`, `packages/core-rs`,
  `packages/mcp`): report verification bypasses, signature or canonicalization
  divergence, denial-of-service on hostile input, and similar defects. Known
  limits and the adversarial review record are documented in
  `packages/SECURITY-REVIEW.md`.

## Reporting

- Email: security@arky.foundation
- Include: affected spec/schema/package, description, impact, reproduction,
  references.
- We acknowledge within 5 business days and provide a resolution plan.

## Handling

- We track issues privately until a coordinated fix is ready.
- Fixes ship as spec errata, schema updates, registry advisories, or package
  releases — with regression vectors where the defect is testable.

## No secrets

- Do not include secrets, PII, or production material in examples or vectors.
- All fixture keys under `vectors/fixtures/keys/` are published test keys and
  must never be used in production.
