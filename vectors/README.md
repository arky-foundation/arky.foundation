# Arky Test Vectors

Standardized test cases to validate implementations against Arky specifications.

## Quick Links
- Testing Guide: `vectors/testing-guide.md`
- TIM manifest: `vectors/manifests/tim.json`
- Canonicalization manifest: `vectors/manifests/canonicalization.json`
- Kernel manifest: `vectors/manifests/kernel.json`
- Notary manifest: `vectors/manifests/notary.json`
- Settlers manifest: `vectors/manifests/settlers.json`
- Discovery manifest: `vectors/manifests/discovery.json`
- Attestations manifest: `vectors/manifests/attestations.json`
- Releases index: `vectors/RELEASES.json`

## Suites (status)
| Suite | Spec | L1 | L2 | L3 | Total | Status |
|-------|------|----|----|----|----|--------|
| TIM | ARKY-TIM-v1 | 7 | 0 | 0 | 7 | basic |
| Canonicalization | ARKY-TIM-Canonicalization-v1 | 6 | 0 | 0 | 6 | basic |
| Kernel | ARKY-KERNEL-v1 | 10 | 0 | 0 | 10 | basic |
| Notary | ARKY-NOTARY-v1 | 8 | 0 | 0 | 8 | basic |
| Settlers | ARKY-SETTLERS-v1 | 10 | 0 | 0 | 10 | basic |
| Discovery | ARKY-DISCOVERY-v1 | 6 | 1 | 0 | 7 | partial |
| Attestations | ARKY-ATTESTATION-v1 | 2 | 0 | 0 | 2 | basic |
| **Total** | | **49** | **1** | **0** | **50** | |

## Layout
```
vectors/
  manifests/          # Consolidated suite manifests
  fixtures/           # Shared test data
    keys/             # Ed25519 test keys
    tims/             # Sample TIM objects
    rails/            # Mock rail configurations
    accounts/         # Test accounts
  tim/                # TIM vectors (T1/T2/T3)
  canonicalization/   # Canonicalization vectors (C1/C2/C3)
  kernel/             # Kernel vectors (K1/K2/K3)
  notary/             # Notary vectors (N1/N2/N3)
  settlers/           # Settler vectors (S1/S2/S3)
  discovery/          # Discovery vectors (D1/D2/D3)
  attest/             # Attestation vectors (AT1/AT2/AT3)
  testing-guide.md    # How to run vectors
  RELEASES.json       # Suite release tracking
```

## Test Vector Format

All vectors follow the ARKY-VECTORS-v1 schema:

```json
{
  "id": "t1-001",
  "spec": "ARKY-TIM-v1",
  "level": "T1",
  "description": "Valid minimal TIM with all required fields",
  "context": {
    "time": "2025-10-15T12:00:00Z",
    "fixtures": {
      "signing_key": "fixtures/keys/ed25519-test-01.json"
    }
  },
  "inputs": { ... },
  "expect": {
    "valid": true,
    "errors": []
  }
}
```

## Running Tests

```bash
# Install the Arky test runner
npm install -g @arky-foundation/test-runner

# Run all vectors
arky-test --suite all

# Run specific suite at specific level
arky-test --suite tim --level T1

# Generate compliance report
arky-test --all --compliance --report coverage.html
```

## Contributing
- Add a vector under the appropriate suite folder
- Reference it in the suite manifest in `vectors/manifests/`
- Update `vectors/RELEASES.json` when publishing a release
- Format and requirements are defined in `specs/development/ARKY-VECTORS-v1.md`

## CI Integration

```yaml
name: Arky Conformance
on: [push, pull_request]
jobs:
  test-vectors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run test vectors
        run: arky-test --suite all --report=coverage.xml
```

## Reference Implementations

### Official Test Tools
- **[arky-test-runner]**: CLI tool for running test vectors
- **[arky-test-validator]**: Library for validating vector format
- **[arky-test-generator]**: Tool for generating new test vectors

### Compatible Implementations
- **[arky-go]**: Go implementation with full test coverage
- **[arky-rust]**: Rust implementation with performance tests
- **[arky-typescript]**: TypeScript implementation for Node.js

## Troubleshooting

### Common Issues

**Vector Fails with Unexpected Error**
- Check if your implementation meets specification version requirements
- Verify input data is processed correctly
- Compare output with expected results step by step

**Test Runner Cannot Find Vectors**
- Ensure directory structure matches expected format
- Check vector file naming conventions
- Verify manifest.json files are valid

**Coverage Report Shows Gaps**
- Review missing test cases in each level
- Consider adding edge case tests
- Check if all specification features are covered

### Getting Help

- **[GitHub Issues]**: Report bugs or request new vectors
- **[Discord Community]**: Get help from other developers
- **[Specification Docs]**: Review detailed requirements
- **[Reference Implementations]**: Study working examples

## Releases

Version tracking and release history is maintained in [RELEASES.json](RELEASES.json).

**Current Version:** 0.1.0 (2025-10-15)

**Release Process:**
1. Add new vectors to appropriate directories
2. Update manifests with new vector references
3. Update RELEASES.json with new version
4. Create signed release tag
5. Update documentation

---

**Related Resources:**
- [Core Specifications](../specs/) - Complete specification documents
- [Registry Documentation](../registries/) - Registry definitions and examples
- [Implementation Examples](../examples/) - Code examples and tutorials
- [Security Guidelines](../examples/security/) - Security best practices
