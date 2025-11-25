# Devices Registry - Simple Examples

## Core Concepts

Devices define **hardware classes** that can be attested for security and capabilities. Think of them as a catalog of device types with standardized descriptions and security requirements.

## Simple Examples

### RGB Camera

```json
{
  "urn": "arky:device/camera.rgb",
  "name": "RGB Camera Sensor",
  "description": "Standard color camera for image capture",
  "simple_config": {
    "fields": {
      "fov_deg": "number",
      "resolution_mp": "number",
      "sn": "string"
    },
    "example": {
      "fov_deg": 120,
      "resolution_mp": 12,
      "sn": "CAM-001234"
    }
  }
}
```

**Real-world use:** Security cameras, webcam authentication, drone vision systems.

---

### Temperature Sensor

```json
{
  "urn": "arky:device/sensor.temperature",
  "name": "Temperature Sensor",
  "description": "Digital temperature measurement device",
  "simple_config": {
    "fields": {
      "range_min_c": "number",
      "range_max_c": "number",
      "accuracy_c": "number"
    },
    "example": {
      "range_min_c": -40,
      "range_max_c": 125,
      "accuracy_c": 0.1
    }
  }
}
```

**Real-world use:** HVAC systems, cold chain monitoring, weather stations.

---

### Smart Lock

```json
{
  "urn": "arky:device/lock.smart",
  "name": "Smart Electronic Lock",
  "description": "Network-connected access control device",
  "simple_config": {
    "fields": {
      "lock_type": "string",
      "power_source": "string",
      "connectivity": "string"
    },
    "example": {
      "lock_type": "deadbolt",
      "power_source": "battery",
      "connectivity": "wifi"
    }
  }
}
```

**Real-world use:** Building access control, hotel room management, home security.

---

## Complex Examples

### GPU Cluster with Advanced Security

```json
{
  "urn": "arky:device/gpu.cluster",
  "name": "GPU Compute Cluster",
  "description": "High-performance computing cluster with GPUs",
  "fields": {
    "nodes": "integer",
    "model": "string",
    "memory_gb": "number",
    "interconnect": "string"
  },
  "attestation": {
    "recommended": true,
    "formats": ["eat-cbor", "tpm2-quote"],
    "freshness_ms": 300000,
    "required_claims": [
      "hw_vendor",
      "hw_model",
      "telemetry_hash"
    ]
  },
  "capabilities": {
    "max_tflops": 1250,
    "supported_frameworks": ["tensorflow", "pytorch", "jax"],
    "security_level": "tee_enclave"
  },
  "example": {
    "nodes": 8,
    "model": "NVIDIA A100",
    "memory_gb": 640,
    "interconnect": "NVLink"
  }
}
```

**Real-world use:** AI model training, scientific computing, cloud GPU services.

---

### Medical Device with Regulatory Compliance

```json
{
  "urn": "arky:device/medical/infusion_pump",
  "name": "Medical Infusion Pump",
  "description": "FDA-regulated medication delivery device",
  "fields": {
    "pump_type": "string",
    "max_flow_rate_mlh": "number",
    "accuracy_percent": "number",
    "fda_clearance": "string"
  },
  "attestation": {
    "required": true,
    "formats": ["eat-cbor", "tpm2-quote"],
    "freshness_ms": 60000,
    "regulatory_compliance": {
      "fda": "510(k) cleared",
      "hipaa": "compliant",
      "iso13485": "certified"
    },
    "required_claims": [
      "device_id",
      "firmware_version",
      "calibration_date",
      "sterilization_status"
    ]
  },
  "safety": {
    "class": "life_support",
    "fail_safe": true,
    "battery_backup_hours": 8,
    "alarm_systems": ["occlusion", "low_battery", "error"]
  },
  "example": {
    "pump_type": "volumetric",
    "max_flow_rate_mlh": 999,
    "accuracy_percent": 2,
    "fda_clearance": "K213456"
  }
}
```

**Real-world use:** Hospital medication delivery, home healthcare, clinical trials.

---

### Industrial Controller

```json
{
  "urn": "arky:device/controller/plc",
  "name": "Programmable Logic Controller",
  "description": "Industrial automation controller",
  "fields": {
    "io_points": "integer",
    "scan_rate_hz": "number",
    "protocols": "array",
    "environmental_rating": "string"
  },
  "attestation": {
    "recommended": true,
    "formats": ["tpm2-quote"],
    "freshness_ms": 120000,
    "industrial_security": {
      "iec62443": "compliant",
      "criticality": "high",
      "network_segmentation": true
    }
  },
  "capabilities": {
    "supported_protocols": ["modbus", "ethernet/ip", "profinet"],
    "redundancy": "hot_standby",
    "diagnostics": "predictive_maintenance"
  },
  "example": {
    "io_points": 256,
    "scan_rate_hz": 1000,
    "protocols": ["modbus_tcp", "ethernet_ip"],
    "environmental_rating": "IP67"
  }
}
```

**Real-world use:** Factory automation, process control, critical infrastructure.

---

## Device Workflows

### Smart Home Ecosystem

```json
{
  "ecosystem": "smart_home",
  "devices": [
    {
      "device": "arky:device/thermostat.smart",
      "role": "climate_control",
      "attestation": "required",
      "data_types": ["temperature", "humidity", "setpoint"]
    },
    {
      "device": "arky:device/camera.rgb",
      "role": "security_monitoring",
      "attestation": "required",
      "data_types": ["video_stream", "motion_detection"]
    },
    {
      "device": "arky:device/lock.smart",
      "role": "access_control",
      "attestation": "required",
      "data_types": ["lock_status", "access_log"]
    }
  ],
  "security_policy": {
    "minimum_attestation_level": "T2",
    "freshness_requirement": "5 minutes",
    "revocation_check": "continuous"
  }
}
```

### Medical Device Network

```json
{
  "network": "hospital_ward",
  "devices": [
    {
      "device": "arky:device/medical/patient_monitor",
      "role": "vital_signs",
      "attestation": "required",
      "regulatory": ["FDA", "HIPAA"],
      "data_types": ["heart_rate", "blood_pressure", "oxygen_saturation"]
    },
    {
      "device": "arky:device/medical/infusion_pump",
      "role": "medication_delivery",
      "attestation": "required",
      "regulatory": ["FDA", "HIPAA"],
      "safety_class": "life_support"
    },
    {
      "device": "arky:device/controller/plc",
      "role": "environment_control",
      "attestation": "recommended",
      "data_types": ["air_quality", "temperature", "pressure"]
    }
  ],
  "compliance_framework": {
    "hipaa": "patient_data_protection",
    "fda": "medical_device_safety",
    "iso27001": "information_security"
  }
}
```

---

## Integration Examples

### TypeScript Device Verification

```typescript
interface DeviceAttestation {
  device_urn: string;
  attestation_format: string;
  claims: Record<string, any>;
  timestamp: string;
  signature: string;
}

class DeviceManager {
  private registry = new DeviceRegistry();

  async verifyDevice(attestation: DeviceAttestation): Promise<boolean> {
    // Get device definition
    const device = await this.registry.getDevice(attestation.device_urn);
    if (!device) return false;

    // Check if attestation is required
    if (device.attestation?.required && !attestation) {
      throw new Error(`Device ${attestation.device_urn} requires attestation`);
    }

    // Validate required claims
    const requiredClaims = device.attestation?.required_claims || [];
    for (const claim of requiredClaims) {
      if (!(claim in attestation.claims)) {
        throw new Error(`Missing required claim: ${claim}`);
      }
    }

    // Check freshness
    const maxAge = device.attestation?.freshness_ms || 300000;
    const age = Date.now() - new Date(attestation.timestamp).getTime();
    if (age > maxAge) {
      throw new Error(`Device attestation expired: ${age}ms > ${maxAge}ms`);
    }

    // Verify cryptographic signature
    return await this.verifyAttestationSignature(attestation);
  }

  private async verifyAttestationSignature(attestation: DeviceAttestation): Promise<boolean> {
    // Implementation would verify the attestation signature
    // using appropriate cryptographic methods
    return true; // simplified
  }
}

// Usage
const manager = new DeviceManager();
const attestation: DeviceAttestation = {
  device_urn: "arky:device/camera.rgb",
  attestation_format: "eat-cbor",
  claims: {
    hw_vendor: "Sony",
    hw_model: "IMX586",
    device_id: "CAM-001234"
  },
  timestamp: new Date().toISOString(),
  signature: "eyJ..."
};

const isValid = await manager.verifyDevice(attestation);
console.log(`Device valid: ${isValid}`);
```

### Python Device Discovery

```python
import arky_sdk
from typing import List, Dict, Any

class DeviceRegistry:
    def __init__(self):
        self.devices = arky_sdk.registries.get_devices()

    def discover_devices_by_capability(self, capability: str) -> List[Dict[str, Any]]:
        """Find all devices with a specific capability"""
        matching_devices = []

        for device_urn, device_def in self.devices.items():
            capabilities = device_def.get('capabilities', {})
            if capability in capabilities:
                matching_devices.append({
                    'urn': device_urn,
                    'name': device_def.get('name'),
                    'capability_value': capabilities[capability]
                })

        return matching_devices

    def get_attestation_requirements(self, device_urn: str) -> Dict[str, Any]:
        """Get attestation requirements for a device"""
        device = self.devices.get(device_urn)
        if not device:
            raise ValueError(f"Device not found: {device_urn}")

        return device.get('attestation', {})

    def validate_device_data(self, device_urn: str, data: Dict[str, Any]) -> bool:
        """Validate data structure matches device schema"""
        device = self.devices.get(device_urn)
        if not device:
            return False

        expected_fields = device.get('fields', {})
        for field, field_type in expected_fields.items():
            if field not in data:
                return False

            # Type validation (simplified)
            if field_type == 'number' and not isinstance(data[field], (int, float)):
                return False
            elif field_type == 'string' and not isinstance(data[field], str):
                return False
            elif field_type == 'integer' and not isinstance(data[field], int):
                return False

        return True

# Usage
registry = DeviceRegistry()

# Find devices with video capability
video_devices = registry.discover_devices_by_capability('video_capture')
for device in video_devices:
    print(f"Found video device: {device['name']}")

# Validate device data
camera_data = {
    'fov_deg': 120,
    'resolution_mp': 12,
    'sn': 'CAM-001234'
}
is_valid = registry.validate_device_data('arky:device/camera.rgb', camera_data)
print(f"Camera data valid: {is_valid}")
```

---

## Industry Use Cases

### Manufacturing

```json
{
  "use_case": "factory_automation",
  "devices": [
    {
      "type": "arky:device/sensor.temperature",
      "count": 50,
      "purpose": "equipment_monitoring"
    },
    {
      "type": "arky:device/controller/plc",
      "count": 10,
      "purpose": "process_control"
    },
    {
      "type": "arky:device/camera.rgb",
      "count": 20,
      "purpose": "quality_inspection"
    }
  ],
  "benefits": [
    "Predictive maintenance",
    "Quality assurance",
    "Regulatory compliance (ISO 9001)"
  ]
}
```

### Healthcare

```json
{
  "use_case": "telemedicine",
  "devices": [
    {
      "type": "arky:device/medical/patient_monitor",
      "purpose": "remote_monitoring",
      "compliance": ["FDA", "HIPAA"]
    },
    {
      "type": "arky:device/camera.rgb",
      "purpose": "video_consultation",
      "compliance": ["HIPAA"]
    },
    {
      "type": "arky:device/sensor.biometric",
      "purpose": "patient_identification",
      "compliance": ["HIPAA", "FDA"]
    }
  ],
  "benefits": [
    "Remote patient care",
    "Reduced hospital readmissions",
    "Improved patient outcomes"
  ]
}
```

### Smart Cities

```json
{
  "use_case": "infrastructure_monitoring",
  "devices": [
    {
      "type": "arky:device/sensor.environmental",
      "count": 1000,
      "purpose": "air_quality_monitoring"
    },
    {
      "type": "arky:device/camera.rgb",
      "count": 500,
      "purpose": "traffic_monitoring"
    },
    {
      "type": "arky:device/controller/traffic_light",
      "count": 200,
      "purpose": "traffic_control"
    }
  ],
  "benefits": [
    "Improved traffic flow",
    "Environmental monitoring",
    "Public safety enhancement"
  ]
}
```

---

## Learning Path

1. **Start with simple devices**: Understand basic device categories
2. **Learn attestation concepts**: Why device security matters
3. **Master device fields**: How to describe device capabilities
4. **Apply to specific domains**: Medical, industrial, consumer devices
5. **Implement security policies**: Device onboarding and monitoring

## Related Resources

- [Attestations Registry](../attestations@v1.json) - Security proof formats for devices
- [Units Registry](../units@v1.json) - Measurements used by devices
- [Security Examples](../../examples/security/) - Device security implementations
- [Integration Flows](../../examples/flows/) - Complete device workflows
