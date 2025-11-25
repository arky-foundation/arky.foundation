# Units Registry - Simple Examples

## Core Concepts

Units define **standardized measurements** and resources in the Arky ecosystem. Think of them as a universal language for describing quantities, resources, and capabilities.

## Simple Examples

### Basic SI Units

```json
{
  "urn": "arky:unit/meter",
  "name": "Meter",
  "symbol": "m",
  "description": "SI base unit for length",
  "dimension": {"m": 1},
  "simple_usage": "room_length: 5.2 m"
}
```

**Real-world use:** Room dimensions, device sizes, distance measurements.

---

```json
{
  "urn": "arky:unit/second",
  "name": "Second",
  "symbol": "s",
  "description": "SI base unit for time",
  "dimension": {"s": 1},
  "simple_usage": "response_time: 0.05 s"
}
```

**Real-world use:** Response times, processing duration, timestamps.

---

### Derived Units

```json
{
  "urn": "arky:unit/m-per-s",
  "name": "Meters per Second",
  "symbol": "m/s",
  "description": "Speed or velocity measurement",
  "dimension": {"m": 1, "s": -1},
  "simple_usage": "wind_speed: 15.5 m/s"
}
```

**Real-world use:** Vehicle speed, data transfer rates, sensor measurements.

---

```json
{
  "urn": "arky:unit/watt",
  "name": "Watt",
  "symbol": "W",
  "description": "Power measurement",
  "dimension": {"kg": 1, "m": 2, "s": -3},
  "simple_usage": "power_consumption: 450 W"
}
```

**Real-world use:** Device power usage, battery charging, solar generation.

---

### Resource Units

```json
{
  "urn": "arky:unit/tflop·h",
  "name": "TFLOP·hour",
  "symbol": "TFLOP·h",
  "description": "Compute resource measurement",
  "basis": "flop*h",
  "simple_usage": "compute_used: 2.5 TFLOP·h"
}
```

**Real-world use:** AI training costs, cloud computing billing, HPC resource allocation.

---

```json
{
  "urn": "arky:unit/gas",
  "name": "Gas",
  "symbol": "gas",
  "description": "Ethereum gas units for computation",
  "dimension": {},
  "simple_usage": "transaction_cost: 21000 gas"
}
```

**Real-world use:** Ethereum transaction fees, smart contract execution costs.

---

## Complex Examples

### Scientific Measurement

```json
{
  "urn": "arky:unit/newton",
  "symbol": "N",
  "dimension": {"kg": 1, "m": 1, "s": -2},
  "si_prefix": true,
  "format": {"decimals_max": 9},
  "aliases": ["N"],
  "notes": "SI derived unit for force",
  "applications": {
    "engineering": "force_calculation: 5.2 N",
    "robotics": "gripper_force: 12.5 N",
    "aerospace": "thrust: 450 kN"
  }
}
```

**Real-world use:** Robotics force control, structural engineering, aerospace applications.

---

### Financial Units

```json
{
  "urn": "arky:unit/percent",
  "symbol": "%",
  "dimension": {},
  "si_prefix": false,
  "format": {"decimals_max": 4},
  "aliases": ["%"],
  "notes": "Dimensionless percentage",
  "applications": {
    "finance": "interest_rate: 3.25%",
    "battery": "charge_level: 87.5%",
    "network": "cpu_usage: 72.3%"
  }
}
```

**Real-world use:** Financial calculations, battery monitoring, system metrics.

---

### Blockchain-Specific Units

```json
{
  "urn": "arky:unit/blocks",
  "symbol": "blocks",
  "dimension": {},
  "si_prefix": false,
  "format": {"decimals_max": 0},
  "aliases": [],
  "notes": "Block count for blockchain finality",
  "applications": {
    "bitcoin": "finality_depth: 6 blocks",
    "ethereum": "checkpoint_depth: 32 blocks",
    "general": "transaction_age: 12 blocks"
  }
}
```

**Real-world use:** Transaction confirmation, network security, finality tracking.

---

## Unit Conversion Examples

### Speed Conversions

```json
{
  "conversions": {
    "m_per_s_to_kmph": {
      "from": "arky:unit/m-per-s",
      "to": "arky:unit/km-per-h",
      "formula": "value * 3.6",
      "example": "15 m/s = 54 km/h"
    },
    "m_per_s_to_mph": {
      "from": "arky:unit/m-per-s",
      "to": "arky:unit/mile-per-h",
      "formula": "value * 2.237",
      "example": "15 m/s = 33.6 mph"
    }
  }
}
```

### Power Conversions

```json
{
  "conversions": {
    "watt_to_horsepower": {
      "from": "arky:unit/watt",
      "to": "arky:unit/horsepower",
      "formula": "value / 746",
      "example": "746 W = 1 hp"
    },
    "watt_to_dbm": {
      "from": "arky:unit/watt",
      "to": "arky:unit/dbm",
      "formula": "10 * log10(value / 0.001)",
      "example": "1 W = 30 dBm"
    }
  }
}
```

---

## Integration Examples

### TypeScript Unit Processing

```typescript
// Parse measurement with unit
function parseMeasurement(input: string): { value: number; unit: string } {
  const match = input.match(/^([\d.]+)\s*([a-zA-Z°%·/]+)$/);
  if (!match) throw new Error('Invalid measurement format');

  return {
    value: parseFloat(match[1]),
    unit: match[2]
  };
}

// Convert units
function convertUnits(
  value: number,
  fromUnit: string,
  toUnit: string
): number {
  const conversions: Record<string, number> = {
    'm_per_s_to_kmph': 3.6,
    'kmph_to_m_per_s': 1/3.6,
    'watt_to_kilowatt': 1/1000,
    'kilowatt_to_watt': 1000
  };

  const key = `${fromUnit}_to_${toUnit}`;
  const factor = conversions[key];
  if (!factor) throw new Error(`No conversion from ${fromUnit} to ${toUnit}`);

  return value * factor;
}

// Usage
const measurement = parseMeasurement("15.5 m/s");
const speedKmh = convertUnits(measurement.value, 'm_per_s', 'kmph');
console.log(`Speed: ${speedKmh} km/h`);
```

### Python Unit Validation

```python
import arky_sdk
from typing import Dict, Any

class MeasurementProcessor:
    def __init__(self):
        self.units_db = arky_sdk.registries.get_units()

    def validate_measurement(self, value: float, unit_urn: str) -> bool:
        """Validate measurement against unit definition"""
        unit = self.units_db.get(unit_urn)
        if not unit:
            return False

        # Check decimal precision
        max_decimals = unit.format.get('decimals_max', 9)
        decimal_places = len(str(value).split('.')[-1]) if '.' in str(value) else 0

        return decimal_places <= max_decimals

    def format_measurement(self, value: float, unit_urn: str) -> str:
        """Format measurement according to unit specifications"""
        unit = self.units_db.get(unit_urn)
        max_decimals = unit.format.get('decimals_max', 9)

        return f"{value:.{max_decimals}f} {unit.symbol}"

# Usage
processor = MeasurementProcessor()
is_valid = processor.validate_measurement(15.5234, 'arky:unit/m-per-s')
formatted = processor.format_measurement(15.5234, 'arky:unit/m-per-s')
print(f"Valid: {is_valid}, Formatted: {formatted}")
```

---

## Industry Use Cases

### IoT Device Management

```json
{
  "device_sensors": {
    "temperature": {"value": 23.5, "unit": "degC"},
    "humidity": {"value": 45.2, "unit": "%"},
    "pressure": {"value": 101325, "unit": "Pa"},
    "light_level": {"value": 450, "unit": "lux"},
    "battery": {"value": 87.5, "unit": "%"}
  },
  "standardization_benefits": [
    "Cross-vendor compatibility",
    "Automated unit conversion",
    "Data validation and quality control"
  ]
}
```

### Cloud Computing

```json
{
  "resource_billing": {
    "compute": {"value": 10.5, "unit": "TFLOP·h", "rate": 0.02},
    "storage": {"value": 500, "unit": "GB-month", "rate": 0.023},
    "network": {"value": 2.5, "unit": "TB", "rate": 0.09},
    "memory": {"value": 32, "unit": "GB-hour", "rate": 0.005}
  },
  "total_cost": {"value": 24.85, "unit": "USD"}
}
```

### Scientific Research

```json
{
  "experiment_data": {
    "force": {"value": 12.5, "unit": "N", "accuracy": "±0.1"},
    "distance": {"value": 2.34, "unit": "m", "accuracy": "±0.01"},
    "duration": {"value": 45.6, "unit": "s", "accuracy": "±0.1"},
    "energy": {"value": 89.7, "unit": "J", "calculated": true}
  },
  "compliance": ["SI_units", "ISO_80000", "ASTM_E29"]
}
```

---

## Learning Path

1. **Start with basic SI units**: meter, second, kilogram
2. **Learn derived units**: watt, newton, joule
3. **Understand dimensions**: How units relate to each other
4. **Master unit conversions**: Between different measurement systems
5. **Apply to domain-specific units**: gas, blocks, TFLOP·h

## Related Resources

- [ISO 80000 Standards](https://www.iso.org/standard/30669.html) - International unit standards
- [SI Brochure](https://www.bipm.org/en/publications/si-brochure/) - Official SI documentation
- [Device Registry](../devices@v1.json) - Hardware that uses these units
- [Integration Examples](../../examples/flows/) - Real-world usage patterns
