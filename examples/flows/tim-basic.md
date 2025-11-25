# TIM Basic Example

Scenario: Temperature sensor reading.

## Minimal TIM Receipt

```json
{
  "time": { "ts": "2025-10-15T14:30:00Z" },
  "identity": { "id": "did:web:sensors.example.org:unit-42" },
  "measurement": {
    "name": "ambient.temperature",
    "value": 22.3,
    "unit": "degC",
    "method": {
      "type": "sensor",
      "source": "device:temp-probe-01",
      "version": "v2"
    },
    "device": "urn:arky:device:temp.ds18b20",
    "error": "±0.5"
  },
  "cid": "z4EJqXvZxXJ58h5ZwJD9tUqX3Hf7KwVnN8YvRt2mZ9Q",
  "sig": "eyJhbGciOi..."
}
```

## References

- TIM spec: `specs/core/ARKY-TIM-v1.md`
- Canonicalization: `specs/core/ARKY-TIM-Canonicalization-v1.md`
