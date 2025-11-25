# Versioning Policy

## Specs
- Major lines use `v<major>` in `spec_id` (e.g., `ARKY-TIM-v1`).
- Backwards‑compatible clarifications do not change `v<major>`.
- Breaking changes require a new `v<major+1>` and updated vectors/schemas.

## Schemas
- `$id` MUST change on breaking structural changes.
- Minor schema additions may reuse `$id` if not breaking; otherwise increment version.

## Registries
- Use `@v<major>` in `registry_id` and URNs where appropriate.
- Breaking entry semantics require a major bump.

## Vectors
- Vector format lives in `ARKY-VECTORS-v1`. Manifests and `RELEASES.json` pin hashes.

## Tags
- `spec/<SPEC_ID>/<semver>` (e.g., `spec/ARKY-TIM-v1/1.0.0`).
