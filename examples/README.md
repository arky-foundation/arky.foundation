# Examples (docs‑only)

Copyable, minimal examples referenced by specs. No live services.

## Quick index

- Service Descriptor (Notary): `examples/service-descriptors/notary/descriptor.json`
- Service Descriptor (Settler): `examples/service-descriptors/settler/descriptor.json`
- Test JWKS: `examples/keys/jwks.json`
- Verification tools are intentionally omitted from this repo.
- Well-known discovery examples: `examples/discovery/well-known/arky/`

## Minimal ServiceDescriptor

```json
{
  "service_id": "arky:example/notary",
  "service_type": "notary",
  "version": "1.0.0",
  "spec_ids": ["ARKY-NOTARY-v1", "ARKY-DISCOVERY-v1"],
  "endpoints": [
    { "name": "submit", "path": "/notary/submit", "method": "POST", "media_types": ["application/arky.tim+json"] }
  ],
  "capabilities": {
    "anchor_targets": ["caip2:eip155:1"],
    "finality_defaults": { "caip2:eip155:1": 64 },
    "batch_limits": { "max_count": 1000, "max_bytes": 1048576, "max_dwell_ms": 0 },
    "witness_algorithms": ["Ed25519"],
    "dtn_ordering": true,
    "policy_required": false
  },
  "security": { "transport": ["https"], "auth": ["none"] },
  "ts": "2025-10-15T00:00:00Z",
  "cid": "zBase58…",
  "sig": "eyJ…"
}
```

Terminology: Discovery `specs/infrastructure/ARKY-DISCOVERY-v1.md`, Media Types
`specs/infrastructure/ARKY-MEDIA-TYPES-v1.md`, schema `schemas/service-descriptor-v1.json`.

## Verify (quick)

- Canonicalize body (no `cid`/`sig`), base64url JWS header `alg:EdDSA,kid` + body, verify with JWKS `examples/keys/jwks.json`.
- Recompute `cid` as base58btc(multihash(sha256(canonical_body))).
- Use your SDK or CLI to perform verification.
