---
spec_id: ARKY-KEYS-v1
title: Arky — Keys & Identity Publication
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-TIM-v1
  - ARKY-TIM-Canonicalization-v1
  - ARKY-DISCOVERY-v1
  - ARKY-REVOCATIONS-v1
  - ARKY-ERRORS-v1
summary: >
  Defines how Arky providers publish signing keys (JWK/DID/X.509), assign and rotate
  `kid`s, advertise algorithms, and distribute revocation information. Ensures clients
  can deterministically discover, select, and validate keys for all signatures.
permalink: /specs/security/ARKY-KEYS-v1
last_updated: 2025-10-15
---

# Arky — Keys & Identity Publication (v1)

All sections are normative unless labeled Informative.

## 1. Scope

Establishes key discovery via Discovery well-known endpoints, JWK requirements, `kid` rules, allowed algorithms, rotation, and revocation integration. Applies to TIM issuers, Notaries, Settlers, Registries, and Policy publishers.

See also:
- [ARKY-SECURITY-BPR-v1](ARKY-SECURITY-BPR-v1.md) — Cryptographic baseline (§3), key management (§4-5)
- [ARKY-REVOCATIONS-v1](ARKY-REVOCATIONS-v1.md) — Key revocation procedures

## 2. Discovery & JWKS

Providers MUST publish a JWKS at `/.well-known/arky/jwks.json` (or alias `/.well-known/arky-keys`):

- Format: RFC 7517 (JWKS) with OKP/Ed25519 keys in v1
- Key ID: Each key MUST include a unique `kid`; clients MUST select keys by `kid` when verifying JWS
- Caching: MUST support `ETag`/`If-None-Match`; SHOULD include appropriate `Cache-Control`

Minimum JWKS shape:

```json
{ "keys": [ { "kty": "OKP", "crv": "Ed25519", "kid": "<kid>", "x": "<base64url>" } ] }
```

## 3. Key IDs (`kid`) and Rotation

- `kid` identifies the verification key used in JWS headers; it MUST be stable for the lifetime of the key material.
- Rotation MUST be performed by publishing the new key alongside the old in the JWKS for a grace window before switching signers.
- Servers SHOULD prefer short-lived signing keys; clients MUST be able to verify historical signatures while old keys remain in the JWKS or via archived keys policy.

## 4. Algorithms

All cryptographic requirements are defined in [ARKY-SECURITY-BPR-v1 §3](ARKY-SECURITY-BPR-v1.md#3-cryptographic-baseline):
- Ed25519 signatures (JWS `alg=EdDSA`)
- SHA-256 hashing
- TLS 1.3 for all HTTP communications

Keys **MUST NOT** advertise algorithms outside the approved baseline; clients **MUST** reject unknown/unsupported algorithms.

## 5. Revocations

- Providers SHOULD publish a signed Revocation List at `/.well-known/arky/revocations.json` per ARKY-REVOCATIONS-v1.
- Consumers MUST enforce revocation signals when verifying descriptors, receipts, and other signed artifacts. Revoked keys → `keys.revoked`.

## 6. DID / X.509 (Optional)

- If DID is used, providers MUST support `did:web` or `did:key` resolution and map DID verification methods to the same `kid`s used in JWS.
- If X.509 is used, providers MUST specify trust anchors and verification policy in their ServiceDescriptor; `kid` selection MUST be unambiguous.

## 7. Security

- JWKS MUST exclude private material
- Key material MUST be generated and stored according to organizational policy; hardware-backed storage is RECOMMENDED
- Privacy requirements per [ARKY-SECURITY-BPR-v1 §8](ARKY-SECURITY-BPR-v1.md#8-privacy--data-handling)

## 8. Conformance

| Level | Requirements |
|---|---|
| **K1** | Publish valid JWKS at `/.well-known/arky/jwks.json` with stable `kid`s; support ETag/caching |
| **K2** | Graceful key rotation with overlapping validity; historical signature verification |
| **K3** | Publish signed revocation lists; enforce revocation checks on verification |

---

End of ARKY-KEYS-v1.