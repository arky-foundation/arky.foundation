# Arky Development Next Steps

This document captures the next practical development steps for moving Arky
from a coherent standards repository into a stronger conformance-ready project.

## Current Read

The project direction is sound: TIM evidence, Notary witnessing, Kernel
decisions, Settler execution, and signed receipts form a useful accountability
loop. The repository also has the right supporting structure: specs, schemas,
registries, examples, governance, and vectors.

The main gap is not concept. The main gap is consistency and proof. Prose,
schemas, vectors, examples, and CI need to agree tightly enough that an
independent implementer can build against the repo without guessing.

## Development Priorities

### 1. Restore Mechanical Cleanliness

Fix validation failures before adding more surface area.

- Repair broken links reported by `scripts/check-links.ts`, especially under
  `rfcs/templates/`.
- Replace the placeholder/attached witness JWS in
  `vectors/fixtures/tims/valid-tim-002.json` with a schema-valid detached JWS.
- Add the link checker to the standard validation path.
- Add a single top-level validation command in `package.json`, for example:
  `bun run validate`.

Definition of done:

- JSON syntax check passes.
- Schema validation passes.
- Link checker passes.
- Crypto/vector verification passes.
- `git diff --check` passes.

### 2. Align Specs, Schemas, and Examples

Treat schemas and vectors as the executable contract.

- Bring Policy Pack prose, schema, and `policies/*.json` into one shape.
- Decide whether Policy Pack v1 is the rich model from the spec or the compact
  `rules` model currently used by the schema.
- Tighten `schemas/core/kernel-v1.json` so `cid`, `sig`, `prev`, durations,
  deadlines, and verb names use shared definitions where possible.
- Update `examples/core/kernel.json` to use a registered verb URN in
  `consequence[].then[].name`.
- Normalize all registry-controlled identifiers to the chosen form, such as
  `arky:verb/pay@v1`, and remove stale colon-form examples.

Definition of done:

- Every example validates against its schema.
- Every normative shape in a spec has a matching schema or an explicit reason
  why it is prose-only.
- No example uses deprecated identifier syntax unless it is a negative vector.

### 3. Expand Conformance Coverage

The current verifier is useful but too narrow.

- Extend artifact verification beyond TIM and Kernel to include registries,
  policies, service descriptors, discovery indexes, revocation lists, execution
  receipts, and signed manifests.
- Validate witness signatures, not only issuer signatures.
- Add canonicalization vector verification for expected canonical JSON and
  bytes.
- Add Notary vectors for Merkle roots, inclusion proofs, finality depth, and
  reorg behavior.
- Add Settler vectors for idempotency, skipped verbs, rollback windows, and
  irreversible rails.
- Add Assertion vectors for parser behavior, tri-state logic, missing inputs,
  unit mismatch, numeric edge cases, and unsupported functions.

Definition of done:

- Each vector manifest has nonzero coverage for every advertised conformance
  level, or clearly marks unimplemented levels as future work.
- CI fails when any signed artifact, schema, example, or vector drifts.
- Conformance output can be saved as a results JSON artifact.

### 4. Reconcile Stability Claims

Governance says a spec becomes stable when vectors are published and at least
two independent implementations pass. Several specs currently say `stable`
while vector manifests still say `ready_for_production: false`.

- Decide which specs are actually stable today.
- Downgrade immature specs to draft/review, or add conformance evidence.
- Publish a compatibility matrix that references concrete vector releases,
  schema IDs, registry snapshots, and implementation results.
- Add a short release checklist for future spec changes.

Definition of done:

- `status` fields match the governance lifecycle.
- Stable claims cite vector levels and result artifacts.
- Production readiness is defined consistently across specs and manifests.

### 5. Build the First Reference Path

Avoid expanding all domains at once. Prove one small vertical end to end.

Recommended first path:

1. Emit a TIM for one measurement.
2. Notarize it.
3. Evaluate one Kernel commitment.
4. Execute one Settler verb.
5. Emit and verify an Execution Receipt.

Good candidate verticals:

- Autonomous payment approval from verifiable evidence.
- Device control with safety bounds.
- Cloud autoscaling with payment or audit settlement.

Definition of done:

- One complete flow has valid examples, schemas, vectors, signed artifacts, and
  a documented verifier command.
- A new implementer can reproduce the flow using only repo instructions.

### 6. Improve Developer Experience

Make the repo easier to use as a standard.

- Add `README` instructions for installing dependencies and running validation.
- Add `CONFORMANCE.md` with exact claims and commands.
- Add `SECURITY-TESTING.md` or extend `SECURITY.md` with key handling,
  revocation, and fixture-key warnings.
- Add a generated index of specs, schemas, registries, and vector suites.
- Keep examples small and copyable; move long explanations to guides.

Definition of done:

- A contributor can run all checks from one command.
- A reader can find the current authoritative schema for each artifact type.
- Fixture keys and non-production signatures are clearly labeled.

## Suggested Work Order

### Phase 0: Hygiene

- Fix broken links.
- Fix invalid TIM witness fixture.
- Add `validate` script.
- Wire link checking into CI.

### Phase 1: Contract Alignment

- Align Policy Pack model.
- Tighten Kernel schema.
- Normalize URNs across prose and examples.
- Ensure examples are schema-valid and semantically registered.

### Phase 2: Conformance Expansion

- Expand verifier to all top-level signed artifacts.
- Add canonicalization checks.
- Add witness verification.
- Add result artifact output.

### Phase 3: Production Readiness

- Update status fields.
- Publish compatibility matrix with concrete release data.
- Complete one end-to-end reference path.
- Require conformance evidence for stable claims.

## Non-Goals For Now

- Do not add more major protocol components until v1 consistency is strong.
- Do not optimize for every target domain at once.
- Do not publish production-ready claims without vector coverage and evidence.
- Do not introduce a token, network dependency, or centralized runtime.

## Validation Commands

Run these locally before proposing changes:

```sh
bun install
bun run verify
bun run scripts/validate-kernel-vectors.ts
bun run scripts/check-links.ts
git diff --check
```

After a `validate` script exists, prefer:

```sh
bun run validate
git diff --check
```
