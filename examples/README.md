# Examples

Copyable, minimal examples referenced by specs. No live services.

## Quick index

- Service Descriptor (Notary): `examples/service-descriptors/notary/descriptor.json`
- Service Descriptor (Settler): `examples/service-descriptors/settler/descriptor.json`
- Test JWKS: `examples/keys/jwks.json`
- Well-known discovery examples: `examples/discovery/well-known/arky/`

Every signed example is verified in CI by `bun run verify`.

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
`specs/infrastructure/ARKY-MEDIA-TYPES-v1.md`, schema `schemas/core/service-descriptor-v1.json`.

## Verify (quick)

- Canonicalize body (no `cid`/`sig`); verify the detached-payload JWS (`b64:false`, header `alg:EdDSA,kid`) over those canonical bytes with JWKS `examples/keys/jwks.json`.
- Recompute `cid` as base58btc(multihash(sha256(canonical_body))).
- Ready-made verifiers: `bun run verify` (repository), `verifyTim` /
  `verify_tim` in `packages/core` and `packages/core-rs`, or the in-browser
  verifier at https://arky.foundation/verify.
