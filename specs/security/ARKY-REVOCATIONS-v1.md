---
spec_id: ARKY-REVOCATIONS-v1
title: Arky — Revocation Lists
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-DISCOVERY-v1
  - ARKY-ERRORS-v1
summary: >
  Signed JSON format for publishing key revocations (JWK/DID/X.509). Enables
  offline/verifiable revocation checks across SDKs and services.
permalink: /specs/security/ARKY-REVOCATIONS-v1
last_updated: 2025-10-15
---

# Arky — Revocation Lists (v1)

All sections are normative unless labeled Informative.

## 1. Scope

Defines a compact, signed revocation list that services and SDKs consume to reject revoked keys without online lookups.

See also:
- [ARKY-KEYS-v1](ARKY-KEYS-v1.md) — Key discovery and management
- [ARKY-SECURITY-BPR-v1 §12](ARKY-SECURITY-BPR-v1.md#12-incident-response--revocation) — Incident response and revocation procedures

## 2. Data Model

```
RevocationList := {
  list_id: "arky:revocations@v1",  // required
  issuer: string,                   // required (origin or DID)
  ts: RFC3339,                      // required
  entries: [RevocationEntry],       // required
  cid?: string,                     // optional but recommended
  sig: JWS                          // required (JCS over body sans cid/sig)
}

RevocationEntry := {
  kind: "jwk"|"x509"|"did",     // required
  kid?: string,                    // for jwk/did
  thumbprint?: string,            // for x509 (SHA-256, base64url)
  reason?: "compromise"|"rotation"|"superseded"|"policy",
  revoked_at: RFC3339              // required
}
```

Rules:

- At least one of `kid` or `thumbprint` is required according to kind.
- Lists MUST be signed with the issuer’s key discoverable via Discovery.
- Consumers MUST treat unknown `kind` as invalid.

## 3. Distribution

- Published at `/.well-known/arky/revocations.json`; MUST include `ETag` and support revalidation.
- Providers MAY host historical snapshots; clients SHOULD prefer the latest by `ts`.

## 4. Conformance

| Level | Requirements |
|---|---|
| **RV1** | Emit schema-valid, signed revocation lists; remote updates; stable identifiers |
| **RV2** | Verify list signatures; enforce revocations; map failures to `keys.revoked` or `common.unauthorized` |

Example: see `examples/security/revocations/` for complete examples.

---

End of ARKY-REVOCATIONS-v1.