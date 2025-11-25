# Infrastructure Specifications

How Arky components discover each other, communicate, resolve identity, and share registries.

## Service Discovery & Communication
- Discovery: `specs/infrastructure/ARKY-DISCOVERY-v1.md`
- Wire (HTTP/gRPC): `specs/infrastructure/ARKY-WIRE-v1.md`
- Media Types: `specs/infrastructure/ARKY-MEDIA-TYPES-v1.md`
- Schemas Index: `specs/infrastructure/ARKY-SCHEMAS-INDEX-v1.md`

## Identity & Collection
- Identity Bindings: `specs/infrastructure/ARKY-IDENTITY-BINDINGS-v1.md`
- Collectors: `specs/infrastructure/ARKY-COLLECTORS-v1.md`

## Registries & Standards
- Registries: `specs/infrastructure/ARKY-REGISTRIES-v1.md`
- Registry Verbs: `specs/infrastructure/ARKY-REGISTRY-VERBS-v1.md`

## Localization
- Locale/i18n: `specs/infrastructure/ARKY-LOCALE-v1.md`

## Purpose
- Bootstrap: discover services, keys, and descriptors deterministically
- Interoperate: share stable URNs (units, verbs, rails, devices)
- Verify: signed schemas/registries and content-addressed artifacts
- Evolve: versioned specs, media types, and registries
- Secure: identity resolution, rotation, revocation, attestation
