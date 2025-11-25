# Arky Registries — Snapshots (v1)

Signed JSON snapshots used across specs. Authority docs, not live services.

## Quick Start

New to registries? Start with the specification and examples below.

## Available Registries

- `verbs@v1.json` — Actions that can be executed (pay, control, signal)
- `rails@v1.json` — Networks where actions occur (Ethereum, ACH, IoT controllers)
- `units@v1.json` — Standardized measurements (SI units, compute resources)
- `devices@v1.json` — Hardware device classes (cameras, sensors, medical devices)
- `attestations@v1.json` — Security proof formats (SGX, TPM2, RATS)

## Documentation

- Specification: `specs/infrastructure/ARKY-REGISTRIES-v1.md`
- Simple Examples: `registries/examples/`
- Integration Code: `registries/examples/README.md`
- Complex Examples: `specs/development/ARKY-EXAMPLES-v1.md`

Minimal example (verbs)

```json
{
  "registry_id": "arky:registry:verbs@v1",
  "entries": {
    "arky:verb/pay@v1": {
      "urn": "arky:verb/pay@v1",
      "semantics": "Initiate a payment on a supported rail.",
      "rails": ["caip2:eip155:*", "sepa:eu", "ach:us"]
    }
  }
}
```

Related: Settlers/Verbs `specs/core/ARKY-SETTLERS-v1.md`.

Signing & publish
- Canonicalize (JCS) → sign (EdDSA JWS). Publish under `/registries/<ns>@v1.json` and list in `/.well-known/arky/registries`.

