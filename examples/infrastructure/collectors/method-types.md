# Collector Method Type Examples

Examples of different collector method types for TIM generation.

## Sensor Collector

```json
{ "type": "sensor", "source": "device:temp-sensor-01", "version": "v1" }
```

Use case: Physical sensors (temperature, pressure, GPS, accelerometer)
Source format: `device:<device_id>` or DID

---

## API Collector

```json
{ "type": "api", "source": "https://api.weather.gov/stations/KFO/observations/latest", "version": "v2" }
```

Use case: REST/GraphQL APIs, third‑party data sources
Source format: URL or service identifier

---

## Log Collector

```json
{ "type": "log", "source": "file:/var/log/system.log", "version": "v1" }
```

Use case: System logs, application logs, audit trails
Source format: File path or log stream identifier

---

## Complete TIM Example with Sensor Method

```json
{
  "@type": "ARKY:TIM@v1",
  "time": { "ts": "2025-10-15T14:30:05Z" },
  "identity": { "id": "did:web:sensors.example.com:datacenter-1" },
  "measurement": {
    "name": "temperature",
    "value": 22.3,
    "unit": "degC",
    "method": { "type": "sensor", "source": "device:ds18b20-001", "version": "v1" }
  },
  "cid": "zQmXg...",
  "sig": "eyJhbGc..."
}
```

---

See `specs/infrastructure/ARKY-COLLECTORS-v1.md` for complete specification.
