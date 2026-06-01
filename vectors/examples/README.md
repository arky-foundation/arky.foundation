# Vector Examples

Simplified pointers and tips for using test vectors during development.

## Quick Links
- Discovery: `vectors/discovery/`
- Attestation: `vectors/attest/`
- Manifests: `vectors/manifests/`
- Testing guide: `vectors/testing-guide.md`

## How To Use
- Load a vector file, run it through your implementation, and compare results to `expected`.
- Use suite manifests under `vectors/manifests/` to batch-run tests and track coverage.
- Follow result format and pass criteria defined in `specs/development/ARKY-VECTORS-v1.md`.

## Example Flow (pseudo)
```typescript
// Load a vector
const vector = load('vectors/discovery/fixtures/revocations-001.json');

// Run implementation
const result = await impl.process(vector.input);

// Compare to expectations
assertMatches(result, vector.expected);
```

## Tips
- Keep vectors deterministic and self-contained
- Include both success and failure cases
- Reference fixtures rather than inlining large payloads
- Update suite manifests when adding vectors

