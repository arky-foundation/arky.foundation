# Attestations Registry - Simple Examples

## Core Concepts

Attestations define **security proof formats** and schemes that verify device identity and trustworthiness. Think of them as digital passports for hardware and software components.

## Simple Examples

### Basic Device Attestation

```json
{
  "urn": "arky:attest/basic.device@v1",
  "name": "Basic Device Identity",
  "description": "Simple proof that a device is what it claims to be",
  "simple_flow": {
    "device": "my-camera-001",
    "proof": "I am a Sony IMX586 camera",
    "verification": "Check with Sony's certificate"
  }
}
```

**Real-world use:** Proving a webcam is genuine, confirming router identity, basic device trust.

---

### Software Integrity Check

```json
{
  "urn": "arky:attest/software.integrity@v1",
  "name": "Software Hash Verification",
  "description": "Proof that software hasn't been tampered with",
  "simple_flow": {
    "software": "firmware-v2.1.3.bin",
    "hash": "sha256:abc123...",
    "verification": "Compare with expected hash"
  }
}
```

**Real-world use:** Firmware updates, container image verification, code signing.

---

### TPM Quote

```json
{
  "urn": "arky:attest/tpm2.quote@v1",
  "name": "TPM2 Hardware Quote",
  "description": "Hardware security module attestation",
  "simple_flow": {
    "device": "platform-tpm2",
    "pcr_values": "boot_state + measurements",
    "signature": "TPM private key signature",
    "verification": "Validate with TPM certificate"
  }
}
```

**Real-world use:** Secure boot validation, platform integrity, BitLocker disk encryption.

---

## Complex Examples

### Intel SGX Enclave Attestation

```json
{
  "urn": "arky:attest/tee.intel.sgx@v1",
  "name": "Intel SGX Enclave Attestation",
  "description": "Confidential computing environment verification",
  "category": "tee",
  "container": "other",
  "format": {
    "fmt_id": "sgx-quote",
    "serialization": "bin",
    "schema_ref": "arky:schema/attest/sgx-quote@v1"
  },
  "bindings": {
    "required": ["key"],
    "optional": ["content"]
  },
  "freshness": {
    "max_age_ms": 600000,
    "accept_skew_ms": 60000
  },
  "trust_anchors": {
    "model": "vendor",
    "root_ids": ["intel-sgx-root-1"],
    "distribution": "pem",
    "policy": "hard"
  },
  "claims_map": {
    "hw_vendor": "$.platform.vendor",
    "hw_model": "$.platform.model",
    "tee": "$.tee",
    "sw_measurement": "$.mr_enclave",
    "debug": "$.debug",
    "anti_rollback": "$.isv_svn_ok"
  },
  "use_cases": [
    "Secure AI model inference",
    "Confidential data processing",
    "Privacy-preserving computation"
  ]
}
```

**Real-world use:** Privacy-preserving AI, secure financial calculations, confidential health data processing.

---

### RATS Entity Attestation Token

```json
{
  "urn": "arky:attest/rats.eat@v1",
  "name": "RATS Entity Attestation Token",
  "description": "Standardized attestation for remote device verification",
  "category": "tee",
  "container": "cose",
  "format": {
    "fmt_id": "eat-cbor",
    "serialization": "cbor",
    "schema_ref": "arky:schema/attest/eat@v1",
    "cose_labels": ["eat_profile", "cnf"]
  },
  "trust_anchors": {
    "model": "vendor",
    "root_ids": ["rats-eat-root-1"],
    "distribution": "jwks",
    "policy": "hard"
  },
  "claims_map": {
    "hw_vendor": "$.ueid.vendor",
    "hw_model": "$.ueid.model",
    "tee": "$.tee",
    "sw_measurement": "$.meas.code",
    "debug": "$.dbg",
    "location": "$.location",
    "uptime": "$.uptime"
  },
  "revocation": {
    "methods": ["list"],
    "cache_ttl_ms": 600000,
    "soft_fail": false
  },
  "use_cases": [
    "Zero-trust device onboarding",
    "IoT device identity verification",
    "Supply chain security"
  ]
}
```

**Real-world use:** IoT device management, zero-trust networks, supply chain verification.

---

## Attestation Workflows

### Simple Device Onboarding

```json
{
  "workflow": "device_onboarding",
  "steps": [
    {
      "step": 1,
      "action": "device_boot",
      "description": "Device starts and generates attestation"
    },
    {
      "step": 2,
      "action": "submit_attestation",
      "description": "Device sends proof to verification service"
    },
    {
      "step": 3,
      "action": "verify_identity",
      "description": "Service validates device certificate chain"
    },
    {
      "step": 4,
      "action": "grant_access",
      "description": "Device receives network access and credentials"
    }
  ],
  "security_requirements": {
    "attestation_format": "arky:attest/rats.eat@v1",
    "freshness": "10 minutes",
    "revocation_check": "required"
  }
}
```

### Medical Device Compliance

```json
{
  "workflow": "medical_device_compliance",
  "regulations": ["FDA", "HIPAA", "IEC 62304"],
  "attestation_layers": [
    {
      "layer": "hardware_identity",
      "format": "arky:attest/tpm2.quote@v1",
      "purpose": "Verify genuine hardware"
    },
    {
      "layer": "firmware_integrity",
      "format": "arky:attest/software.integrity@v1",
      "purpose": "Ensure approved firmware version"
    },
    {
      "layer": "configuration_state",
      "format": "arky:attest/rats.eat@v1",
      "purpose": "Validate secure configuration"
    }
  ],
  "verification_timeline": {
    "on_boot": "required",
    "daily": "automatic",
    "on_update": "mandatory"
  }
}
```

---

## Integration Examples

### TypeScript Attestation Verification

```typescript
interface AttestationData {
  format: string;
  payload: any;
  signature: string;
  certificates: string[];
}

interface VerificationResult {
  valid: boolean;
  device_id?: string;
  claims?: Record<string, any>;
  errors?: string[];
}

class AttestationVerifier {
  private registries = new RegistryClient();

  async verifyAttestation(data: AttestationData): Promise<VerificationResult> {
    try {
      // Get attestation format definition
      const format = await this.registries.getAttestationFormat(data.format);
      if (!format) {
        return { valid: false, errors: [`Unknown format: ${data.format}`] };
      }

      // Verify certificate chain
      const certValid = await this.verifyCertificateChain(
        data.certificates,
        format.trust_anchors
      );
      if (!certValid) {
        return { valid: false, errors: ['Invalid certificate chain'] };
      }

      // Verify signature
      const signatureValid = await this.verifySignature(
        data.payload,
        data.signature,
        data.certificates[0]
      );
      if (!signatureValid) {
        return { valid: false, errors: ['Invalid signature'] };
      }

      // Extract claims using format's claims map
      const claims = this.extractClaims(data.payload, format.claims_map);

      // Check freshness
      const fresh = this.checkFreshness(claims, format.freshness);
      if (!fresh) {
        return { valid: false, errors: ['Attestation expired'] };
      }

      // Check revocation
      const notRevoked = await this.checkRevocation(claims, format.revocation);
      if (!notRevoked) {
        return { valid: false, errors: ['Attestation revoked'] };
      }

      return {
        valid: true,
        device_id: claims.device_id,
        claims
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`Verification failed: ${error.message}`]
      };
    }
  }

  private extractClaims(payload: any, claimsMap: Record<string, string>): Record<string, any> {
    const claims: Record<string, any> = {};

    for (const [claimName, jsonPath] of Object.entries(claimsMap)) {
      try {
        const value = this.getJsonPath(payload, jsonPath);
        if (value !== undefined) {
          claims[claimName] = value;
        }
      } catch (error) {
        console.warn(`Failed to extract claim ${claimName}: ${error.message}`);
      }
    }

    return claims;
  }

  private getJsonPath(obj: any, path: string): any {
    // Simple JSONPath implementation for $.pattern
    const cleanPath = path.replace(/^\$\.?/, '');
    return cleanPath.split('.').reduce((current, key) => current?.[key], obj);
  }

  private checkFreshness(claims: Record<string, any>, freshness: any): boolean {
    if (!freshness) return true;

    const maxAge = freshness.max_age_ms || 300000;
    const timestamp = claims.timestamp || claims.time || claims.ts;

    if (!timestamp) return false;

    const age = Date.now() - new Date(timestamp).getTime();
    return age <= maxAge;
  }

  private async verifyCertificateChain(
    certificates: string[],
    trustAnchors: any
  ): Promise<boolean> {
    // Simplified certificate chain verification
    // Real implementation would validate against trust anchors
    return certificates.length > 0;
  }

  private async verifySignature(
    payload: any,
    signature: string,
    certificate: string
  ): Promise<boolean> {
    // Simplified signature verification
    // Real implementation would use appropriate crypto libraries
    return signature.length > 0;
  }

  private async checkRevocation(claims: Record<string, any>, revocation: any): Promise<boolean> {
    if (!revocation) return true;

    // Check revocation status based on method (list, crl, ocsp)
    // Simplified implementation
    return true;
  }
}

// Usage
const verifier = new AttestationVerifier();

const attestation: AttestationData = {
  format: "arky:attest/rats.eat@v1",
  payload: {
    ueid: { vendor: "AcmeCorp", model: "IoT-Device-v1" },
    tee: "none",
    timestamp: "2025-10-15T14:30:00Z"
  },
  signature: "eyJ...",
  certificates: ["-----BEGIN CERTIFICATE-----..."]
};

const result = await verifier.verifyAttestation(attestation);
console.log(`Attestation valid: ${result.valid}`);
if (result.valid) {
  console.log(`Device: ${result.device_id}`);
  console.log(`Claims:`, result.claims);
}
```

### Python Attestation Processing

```python
import json
import hashlib
import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone

class AttestationProcessor:
    def __init__(self):
        self.registries = self.load_registries()

    def process_attestation(self, attestation: Dict[str, Any]) -> Dict[str, Any]:
        """Process and validate an attestation"""
        try:
            # Get format definition
            format_urn = attestation.get('format')
            if not format_urn:
                return self.error_result("Missing format in attestation")

            format_def = self.registries.get('attestations', {}).get(format_urn)
            if not format_def:
                return self.error_result(f"Unknown attestation format: {format_urn}")

            # Extract claims
            claims = self.extract_claims(attestation, format_def.get('claims_map', {}))

            # Validate required claims
            required_claims = format_def.get('bindings', {}).get('required', [])
            missing_claims = [claim for claim in required_claims if claim not in claims]
            if missing_claims:
                return self.error_result(f"Missing required claims: {missing_claims}")

            # Check freshness
            freshness_result = self.check_freshness(claims, format_def.get('freshness', {}))
            if not freshness_result['valid']:
                return self.error_result(f"Freshness check failed: {freshness_result['reason']}")

            # Check revocation
            revocation_result = self.check_revocation(claims, format_def.get('revocation', {}))
            if not revocation_result['valid']:
                return self.error_result(f"Revocation check failed: {revocation_result['reason']}")

            return {
                'valid': True,
                'format': format_urn,
                'claims': claims,
                'device_id': claims.get('hw_model', 'unknown'),
                'verified_at': datetime.now(timezone.utc).isoformat()
            }

        except Exception as e:
            return self.error_result(f"Processing error: {str(e)}")

    def extract_claims(self, attestation: Dict[str, Any], claims_map: Dict[str, str]) -> Dict[str, Any]:
        """Extract claims from attestation payload using JSONPath mappings"""
        claims = {}
        payload = attestation.get('payload', {})

        for claim_name, json_path in claims_map.items():
            try:
                value = self.get_json_path(payload, json_path)
                if value is not None:
                    claims[claim_name] = value
            except Exception as e:
                print(f"Warning: Failed to extract claim {claim_name}: {e}")

        return claims

    def get_json_path(self, obj: Dict[str, Any], path: str) -> Any:
        """Extract value from object using simple JSONPath"""
        if path.startswith('$.'):
            path = path[2:]

        current = obj
        for key in path.split('.'):
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None

        return current

    def check_freshness(self, claims: Dict[str, Any], freshness_config: Dict[str, Any]) -> Dict[str, Any]:
        """Check attestation freshness"""
        if not freshness_config:
            return {'valid': True}

        max_age_ms = freshness_config.get('max_age_ms', 300000)

        # Try different timestamp field names
        timestamp_fields = ['timestamp', 'time', 'ts', 'iat']
        timestamp = None

        for field in timestamp_fields:
            if field in claims:
                timestamp = claims[field]
                break

        if not timestamp:
            return {'valid': False, 'reason': 'No timestamp found in claims'}

        try:
            if isinstance(timestamp, str):
                ts = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).timestamp()
            else:
                ts = float(timestamp)

            age_ms = (time.time() - ts) * 1000
            return {
                'valid': age_ms <= max_age_ms,
                'age_ms': age_ms,
                'max_age_ms': max_age_ms
            }

        except Exception as e:
            return {'valid': False, 'reason': f'Invalid timestamp format: {e}'}

    def check_revocation(self, claims: Dict[str, Any], revocation_config: Dict[str, Any]) -> Dict[str, Any]:
        """Check if attestation has been revoked"""
        if not revocation_config:
            return {'valid': True}

        # In a real implementation, this would check revocation lists, CRLs, or OCSP
        # For this example, we'll assume no revocation
        return {'valid': True}

    def error_result(self, message: str) -> Dict[str, Any]:
        """Return an error result"""
        return {
            'valid': False,
            'error': message,
            'verified_at': datetime.now(timezone.utc).isoformat()
        }

    def load_registries(self) -> Dict[str, Any]:
        """Load attestation registries (simplified)"""
        # In a real implementation, this would load from the actual registry files
        return {
            'attestations': {
                'arky:attest/rats.eat@v1': {
                    'claims_map': {
                        'hw_vendor': '$.ueid.vendor',
                        'hw_model': '$.ueid.model',
                        'timestamp': '$.timestamp'
                    },
                    'bindings': {'required': ['key'], 'optional': ['content']},
                    'freshness': {'max_age_ms': 600000}
                }
            }
        }

# Usage
processor = AttestationProcessor()

attestation_data = {
    'format': 'arky:attest/rats.eat@v1',
    'payload': {
        'ueid': {
            'vendor': 'AcmeCorp',
            'model': 'IoT-Device-v1'
        },
        'timestamp': '2025-10-15T14:30:00Z'
    }
}

result = processor.process_attestation(attestation_data)
print(f"Attestation result: {json.dumps(result, indent=2)}")
```

---

## Industry Use Cases

### Zero-Trust Network Access

```json
{
  "scenario": "employee_device_access",
  "attestation_required": true,
  "workflow": {
    "device_connects": "Initial connection attempt",
    "attestation_check": "Verify device identity and health",
    "policy_evaluation": "Check against access policies",
    "grant_access": "Provide network credentials"
  },
  "security_benefits": [
    "No trusted network assumption",
    "Continuous device verification",
    "Automated response to compromises"
  ]
}
```

### Supply Chain Security

```json
{
  "scenario": "component_verification",
  "attestation_layers": [
    {
      "stage": "manufacturing",
      "attestation": "hardware_identity",
      "purpose": "Verify genuine components"
    },
    {
      "stage": "assembly",
      "attestation": "firmware_integrity",
      "purpose": "Ensure authorized software"
    },
    {
      "stage": "deployment",
      "attestation": "configuration_state",
      "purpose": "Validate secure setup"
    }
  ],
  "regulatory_compliance": ["CMMC", "NIST 800-53", "ISO 27001"]
}
```

### Healthcare Device Security

```json
{
  "scenario": "medical_device_network",
  "requirements": {
    "fda_approval": "Required for patient-facing devices",
    "hipaa_compliance": "Protect patient data",
    "continuous_monitoring": "Detect tampering or malfunction"
  },
  "attestation_types": [
    "hardware_authenticity",
    "software_integrity",
    "configuration_security",
    "operational_status"
  ]
}
```

---

## Learning Path

1. **Understand basic concepts**: What attestation proves and why it matters
2. **Learn format types**: EAT, SGX quotes, TPM2 quotes
3. **Master verification flows**: Certificate chains, signature validation
4. **Apply to real scenarios**: Zero-trust, IoT, healthcare devices
5. **Implement security policies**: Freshness, revocation, compliance

## Related Resources

- [Devices Registry](../devices@v1.json) - Hardware that uses attestations
- [Security Examples](../../examples/security/) - Complete security implementations
- [RATS Architecture](https://datatracker.ietf.org/wg/rats/about/) - Remote Attestation standards
- [SGX Documentation](https://www.intel.com/content/www/us/en/developer/tools/software-guard-extensions.html) - Intel SGX details
