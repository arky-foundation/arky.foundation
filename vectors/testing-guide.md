# Developer Testing Guide

**Complete guide for testing Arky implementations with test vectors.**

## Quick Start

### 1. Install Test Tools
```bash
# Install the Arky test runner
npm install -g @arky-foundation/test-runner

# Or use the Python version
pip install arky-test-runner
```

### 2. Run Your First Test
```bash
# Test discovery implementation
arky-test --suite discovery --level D1

# Test attestation implementation
arky-test --suite attestations --level AT1
```

### 3. Check Results
```bash
# Generate coverage report
arky-test --all --report coverage.html

# Check compliance status
arky-test --all --compliance
```

## Testing Your Implementation

### Prerequisites

Before running tests, ensure you have:

1. **Implementation Ready**: Your code can process Arky data formats
2. **Test Environment**: Node.js 16+ or Python 3.8+
3. **Dependencies**: Required cryptographic libraries

### Basic Testing Workflow

#### Step 1: Identify Required Test Suites
```javascript
// Based on your implementation
const requiredSuites = [
  'discovery',    // If you implement service discovery
  'attestations', // If you handle attestations
  'tim'           // If you process TIMs
];
```

#### Step 2: Configure Test Runner
```json
// arky-test.config.json
{
  "implementation": {
    "name": "My Arky Implementation",
    "version": "1.0.0",
    "entry_point": "./src/index.js"
  },
  "test_suites": {
    "discovery": {
      "enabled": true,
      "endpoint": "http://localhost:3000/discovery"
    },
    "attestations": {
      "enabled": true,
      "verifier": "./src/attestation-verifier.js"
    }
  }
}
```

#### Step 3: Run Tests
```bash
# Run all enabled test suites
arky-test --config arky-test.config.json

# Run specific suite with details
arky-test --suite discovery --verbose
```

## Test Suite Details

### Discovery Tests

**What They Test**: Service discovery, descriptor validation, revocation handling

**Implementation Requirements**:
```javascript
class DiscoveryService {
  async validateRevocations(revocationsFile) {
    // Validate revocation list format
    // Check signature and timestamps
    // Return validation result
  }

  async validateDescriptor(descriptor) {
    // Validate service descriptor
    // Check capabilities and endpoints
    // Return validation result
  }
}
```

**Running Tests**:
```bash
# Test D1 (Well-knowns)
arky-test --suite discovery --level D1

# Test D2 (Descriptors)
arky-test --suite discovery --level D2

# Test all discovery levels
arky-test --suite discovery
```

**Expected Interface**:
```javascript
// Your implementation must expose this interface
module.exports = {
  validateRevocations: async (filePath) => {
    return {
      valid: boolean,
      errors: string[],
      metadata: object
    };
  },

  validateDescriptor: async (descriptor) => {
    return {
      valid: boolean,
      errors: string[],
      capabilities: string[]
    };
  }
};
```

### Attestation Tests

**What They Test**: Attestation format processing, signature verification, claim extraction

**Implementation Requirements**:
```javascript
class AttestationVerifier {
  async verifyAttestation(evidence) {
    // Parse attestation format
    // Verify cryptographic signatures
    // Extract device claims
    // Return verification result
  }
}
```

**Running Tests**:
```bash
# Test AT1 (Intake)
arky-test --suite attestations --level AT1

# Test specific attestation format
arky-test --suite attestations --format eat

# Test with verbose output
arky-test --suite attestations --verbose
```

**Expected Interface**:
```javascript
module.exports = {
  verifyAttestation: async (evidence) => {
    return {
      status: 'pass' | 'fail',
      bindings: {
        key: boolean,
        content: boolean
      },
      claims: {
        hw_vendor: string,
        hw_model: string,
        tee: string,
        // ... other claims
      }
    };
  }
};
```

### TIM Tests

**What They Test**: TIM structure validation, signature verification, witness processing

**Implementation Requirements**:
```javascript
class TIMProcessor {
  async validateTIM(timData) {
    // Validate TIM format
    // Verify witness signatures
    // Check causal relationships
    // Return validation result
  }
}
```

**Expected Interface**:
```javascript
module.exports = {
  validateTIM: async (timData) => {
    return {
      valid: boolean,
      errors: string[],
      witnesses: {
        count: number,
        valid: number,
        quorum_met: boolean
      }
    };
  }
};
```

## Test Result Interpretation

### Success Indicators
```
PASS - Your implementation correctly processes the test vector
COVERAGE - Your implementation handles all tested scenarios
COMPLIANCE - Your implementation meets specification requirements
```

### Failure Indicators
```
FAIL - Your implementation does not match expected output
ERROR - Your implementation threw an exception
TIMEOUT - Your implementation took too long to respond
MISSING - Required functionality not implemented
```

### Common Failure Patterns

#### Format Validation Failures
```bash
FAIL: discovery-d1-revocations-001
Expected: {valid: true, errors: []}
Actual:   {valid: false, errors: ["Invalid signature"]}
```
**Solution**: Check your signature validation logic

#### Missing Functionality
```bash
ERROR: attestations-a1-eat-001
NotImplementedError: verifyAttestation not implemented
```
**Solution**: Implement the required interface method

#### Performance Issues
```bash
TIMEOUT: tim-t1-basic-001
Execution time: 5000ms (limit: 1000ms)
```
**Solution**: Optimize your implementation or increase timeout

## Debugging Failed Tests

### Step-by-Step Debugging

#### 1. Isolate the Test
```bash
# Run single test with maximum verbosity
arky-test --vector attestations-a1-eat-001 --debug
```

#### 2. Examine Test Input
```javascript
// Load test vector manually
const test = require('./vectors/attest/a1-eat-001.json');
console.log('Test Input:', JSON.stringify(test.input, null, 2));
console.log('Expected:', JSON.stringify(test.expected, null, 2));
```

#### 3. Trace Your Implementation
```javascript
// Add debug logging to your implementation
class AttestationVerifier {
  async verifyAttestation(evidence) {
    console.log('Input evidence:', evidence);

    const parsed = this.parseEvidence(evidence);
    console.log('Parsed evidence:', parsed);

    const verified = await this.verifySignature(parsed);
    console.log('Signature verification:', verified);

    const claims = this.extractClaims(parsed);
    console.log('Extracted claims:', claims);

    return {
      status: verified ? 'pass' : 'fail',
      claims
    };
  }
}
```

#### 4. Compare Results
```javascript
// Detailed comparison function
function compareResults(actual, expected) {
  console.log('=== COMPARISON ===');
  console.log('Status:', actual.status, 'vs', expected.status);
  console.log('Claims:', actual.claims, 'vs', expected.claims);

  // Check each field
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];
    const match = JSON.stringify(actualValue) === JSON.stringify(expectedValue);
    console.log(`${key}: ${match ? 'OK' : 'MISMATCH'} ${actualValue} vs ${expectedValue}`);
  }
}
```

### Common Debugging Scenarios

#### Signature Verification Failures
```javascript
// Check your signature verification process
async debugSignature(evidence) {
  // 1. Check if you're using the right algorithm
  const algorithm = this.detectAlgorithm(evidence);
  console.log('Algorithm:', algorithm);

  // 2. Check if you have the right public key
  const publicKey = this.extractPublicKey(evidence);
  console.log('Public Key:', publicKey);

  // 3. Check if you're verifying the right data
  const signedData = this.extractSignedData(evidence);
  console.log('Signed Data:', signedData);

  // 4. Check signature format
  const signature = this.extractSignature(evidence);
  console.log('Signature:', signature);

  return this.verifySignature(signedData, signature, publicKey);
}
```

#### Data Extraction Issues
```javascript
// Debug claim extraction
async debugClaimExtraction(evidence) {
  // 1. Check if you're parsing the format correctly
  const parsed = this.parseEvidence(evidence);
  console.log('Parsed structure:', Object.keys(parsed));

  // 2. Check if you're using the right JSON paths
  const claimsMap = this.getClaimsMap(evidence.type);
  console.log('Claims map:', claimsMap);

  // 3. Extract each claim step by step
  for (const [claim, path] of Object.entries(claimsMap)) {
    const value = this.getJsonPath(parsed, path);
    console.log(`${claim}: ${value} (from ${path})`);
  }

  return this.extractClaims(parsed, claimsMap);
}
```

## Continuous Integration

### GitHub Actions Configuration
```yaml
# .github/workflows/test-vectors.yml
name: Arky Test Vectors

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test-vectors:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Install test runner
      run: npm install -g @arky-foundation/test-runner

    - name: Run test vectors
      run: |
        arky-test --all --report coverage.xml --compliance

    - name: Upload coverage report
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml

    - name: Check compliance
      run: |
        if ! arky-test --all --compliance --quiet; then
          echo "Implementation is not compliant with Arky specifications"
          exit 1
        fi
```

### Local CI Setup
```bash
# Install pre-commit hooks
npm install -g husky
npx husky add .husky/pre-commit "arky-test --all --quiet"

# Run tests before every commit
git commit -m "feat: add new feature"
# Tests will run automatically
```

## Performance Testing

### Benchmarking Your Implementation
```bash
# Run performance benchmarks
arky-test --suite attestations --benchmark

# Compare with reference implementations
arky-test --suite discovery --compare-with arky-go

# Generate performance report
arky-test --all --performance --report performance.html
```

### Performance Optimization

#### Measurement Points
```javascript
class PerformanceProfiler {
  async verifyAttestation(evidence) {
    const start = performance.now();

    const result = await this.actualVerification(evidence);

    const end = performance.now();
    const duration = end - start;

    console.log(`Verification took ${duration}ms`);

    if (duration > 1000) {
      console.warn('Slow verification detected');
    }

    return result;
  }
}
```

#### Common Performance Issues
- **Excessive Memory Allocation**: Reuse buffers and objects
- **Synchronous Crypto**: Use async cryptographic operations
- **Redundant Parsing**: Parse once, cache results
- **Large Object Copies**: Use references instead of copying

## Compliance Certification

### Achieving Compliance
```bash
# Run full compliance suite
arky-test --all --compliance --certification

# Generate compliance report
arky-test --all --compliance --report compliance.pdf

# Submit for certification
arky-test --submit-compliance --token YOUR_API_TOKEN
```

### Compliance Checklist

#### Functional Requirements
- [ ] All required test suites pass
- [ ] All test levels have adequate coverage
- [ ] Error handling matches specification
- [ ] Security properties are enforced

#### Performance Requirements
- [ ] Response times under specified limits
- [ ] Memory usage within acceptable bounds
- [ ] Scalability under load

#### Documentation Requirements
- [ ] API documentation complete
- [ ] Security considerations documented
- [ ] Deployment guides provided
- [ ] Troubleshooting guides available

### Maintaining Compliance

#### Regression Testing
```bash
# Run regression tests on every change
arky-test --all --regression

# Check for specification updates
arky-test --check-updates

# Update test vectors as needed
arky-test --update-vectors
```

#### Monitoring in Production
```javascript
// Add compliance monitoring
class ComplianceMonitor {
  async validateOperation(operation) {
    const result = await this.processOperation(operation);

    // Log compliance metrics
    this.logMetrics({
      operation: operation.type,
      success: result.success,
      duration: result.duration,
      compliance: result.compliant
    });

    // Alert on compliance failures
    if (!result.compliant) {
      this.alertComplianceFailure(operation, result);
    }

    return result;
  }
}
```

## Getting Help

### Resources
- **[Documentation](README.md)**: Complete vector documentation
- **[Examples](examples/)**: Simplified examples and tutorials
- **[Manifests](manifests/)**: Test suite structure and coverage
- **[Specifications](../specs/)**: Detailed specification requirements

### Community
- **GitHub Issues**: Report bugs or request help
- **Discord Server**: Chat with other developers
- **Working Group Meetings**: Join specification discussions
- **Office Hours**: Get help from maintainers

### Support Channels
- **Documentation**: Check README and examples first
- **GitHub Issues**: For bug reports and feature requests
- **Discord**: For real-time help and discussion
- **Email**: For security issues and confidential matters

Remember: Test vectors are your friend! They help ensure your implementation is correct, secure, and interoperable with other Arky systems.
