# End-to-End Reference Path

One fully-materialized vertical that proves the whole Arky loop holds together
as a **cryptographically-linked chain** — not five disconnected examples. Every
artifact here is really signed with the fixture test keys, and each references
the previous by its **real `cid`**, so the verifier can walk the chain and
confirm the links.

**Scenario:** a datacenter temperature reading of 87.5 °F (above an 85 °F
threshold) authorizes a $100 cooling payment.

```
01-tim       Evidence: signed TIM (temperature = 87.5 °F), co-witnessed
   │           by the notary key over the same canonical bytes
   ▼
02-anchor    Notary: Merkle root over [tim.cid] (merkle-sha256-v1) + inclusion
   │           proof; witnessed_cid links back to the TIM
   ▼
03-kernel    Commitment: "if temp > 85 → pay $100"
   │
   ▼
04-decision  Kernel decision: APPROVED; kernel_cid → 03, assertion input → tim.cid
   │
   ▼
05-xr        Settler receipt: pay $100, status=success; commitment_cid → 03,
               decision_cid → 04
```

## Files

| File | Artifact | Signed by | Links to |
|---|---|---|---|
| `01-tim.json` | TIM evidence (+ witness) | issuer (test-01) + notary (test-03) | — |
| `02-anchor.json` | Notary anchor object | notary (test-03) | `witnessed_cid`, `proof.leaf` → TIM |
| `03-kernel.json` | Kernel commitment | issuer (test-01) | — |
| `04-decision.json` | Kernel decision (APPROVED) | issuer (test-01) | `kernel_cid` → kernel; `assertions[].inputs` → TIM |
| `05-xr.json` | Execution receipt (success) | settler (test-03) | `commitment_cid` → kernel; `decision_cid` → decision |
| `chain.json` | Linkage manifest | — | declares every cross-link the verifier checks |

## Content IDs (this generation)

```
tim       zQma5hrFJerMUpi8mHmXuMdKVG8Z59xbDzqaZyjUkkw7gDJ
anchor    zQmbxFUwy7vu59Ly7Qqefbs8La426ikdUdGgQRFX7rYiBkd
kernel    zQmUG7QQQTV7ZzALLsETzdri1NSoH8siaAqbqzsajgKzZT5
decision  zQmWAxSoY7jhX2BHgvtSkthuK9vrTBkeGmr1EHjdQE7z7UC
xr        zQmUPBosDSo5U1XUnk4SBAbjWXkm3hupT9fpjQPQf7P1pcs
```

## Reproduce

```sh
bun run scripts/gen-reference-path.ts   # regenerate (deterministic; idempotent)
bun run verify                          # walks the chain, see "End-to-end reference path"
```

`verify` checks, for this path:
1. **Each artifact** — recomputed `cid` matches, detached‑JWS `sig` verifies
   against its `kid`‑resolved key, and the TIM witness verifies.
2. **Chain linkage** — every link in `chain.json` resolves to the referenced
   artifact's real `cid`. Tampering any reference fails on **both** axes: the
   artifact signature breaks (the reference is part of the signed body) **and**
   the linkage check fails.

**Test keys only — never production.** See `../../fixtures/keys/`.
