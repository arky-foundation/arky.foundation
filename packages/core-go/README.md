# arky-core (Go)

Reference **Go** implementation of Arky TIM — a third independent stack.

Go modules are identified by import path, not by a package name, so there is no
`arky-core-go` artifact anywhere: the module is
`github.com/arky-foundation/arky.foundation/packages/core-go`, conventionally
imported as `arky`.

Produce and verify Time-Identity-Measurement receipts: JCS canonicalization
(RFC 8785), content addressing (multihash sha2-256 + base58btc multibase), and
detached-payload Ed25519 JWS (RFC 7797), with witnessing — plus the Kernel
(commitment evaluation) and Settler (execution receipts).

Built clean-room from the specs. It passes the published conformance vectors and
is cross-checked **byte-for-byte** against `@arky/core` (TypeScript) and
`arky-core` (Rust): canonical bytes, cids, Ed25519 signatures, Kernel decisions,
and execution receipts are all identical.

## Requirements

Go 1.26.6 or newer. **No external dependencies** — everything is standard
library (`crypto/ed25519`, `crypto/sha256`), with base58btc, the JSON parser,
and the RFC 8785 number formatter hand-rolled. A cryptographic reference
implementation is a place where a dependency costs more trust than it saves.

## Install

```sh
go get github.com/arky-foundation/arky.foundation/packages/core-go
```

## Quickstart

```go
package main

import (
	"fmt"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func main() {
	kp, _ := arky.GenerateKeyPair()

	method := arky.NewObject()
	method.Set("type", "sensor")
	method.Set("source", "device:temp-01")

	measurement := arky.NewObject()
	measurement.Set("name", "temperature")
	measurement.Set("value", arky.Number("22.5"))
	measurement.Set("unit", "arky:unit/temp.C")
	measurement.Set("method", method)

	timeObj := arky.NewObject()
	timeObj.Set("ts", "2025-10-15T12:00:00Z")

	identity := arky.NewObject()
	identity.Set("id", kp.Did)

	body := arky.NewObject()
	body.Set("time", timeObj)
	body.Set("identity", identity)
	body.Set("measurement", measurement)

	tim, _ := arky.CreateTim(body, kp.PrivateKey, "")
	res := arky.VerifyTim(tim, nil) // nil -> DefaultResolver (did:key)
	fmt.Println("valid:", res.Valid, "cid:", arky.Str(tim, "cid"))
}
```

Run the bundled example: `go run ./cmd/quickstart`.

## Why a hand-rolled JSON parser?

`encoding/json` cannot produce JCS output, and the differences are not cosmetic
— each one changes the signed bytes:

| Concern | `encoding/json` | Required by RFC 8785 |
| --- | --- | --- |
| Object key order | sorted by UTF-8 bytes | sorted by **UTF-16 code units** |
| Numbers | Go `strconv` formatting | **ECMAScript `Number::toString`** |
| `<`, `>`, `&` | escaped as `<` etc. | emitted literally |
| Key order on decode | lost (`map[string]any`) | preserved (the JWS protected header is signed verbatim) |
| Number precision | coerced to `float64` on parse | lexical form kept until canonicalization |

The UTF-16 rule only diverges for non-BMP code points, and the published vectors
use ASCII keys — so this is exactly the kind of bug that ships silently. It is
pinned by a dedicated test.

## API

- `GenerateKeyPair()`, `FromSeed(seed)`, `DidKeyFromPublic(pub)` — keys + did:key.
- `Parse(s)` / `ParseStrict(s)` — JSON parsing; `ParseStrict` rejects duplicate
  object member names (Canonicalization section 3).
- `Canonicalize(v)` — RFC 8785 canonical string.
- `ComputeCid(v)`, `CidFromCanonical(s)`, `MultihashMb(b)`, `ToMultibase(b)` — content addressing.
- `SignDetached(payload, priv, kid)`, `VerifyDetached(jws, payload, pub)` — detached JWS.
- `CreateTim(body, priv, kid)`, `VerifyTim(tim, resolve)`, `VerifyTimAt(tim, resolve, at)`,
  `CanonicalBody(tim)`, `ResolveDidKey(id)`, `DefaultResolver` — TIM.
- `EvaluateKernel(commitment, tims, evalTime)`, `EvaluateAssertion(expr, syms)` — Kernel.
- `Execute(req, priv, kid, ts, anchor, store)`, `DeriveIdempotencyKey(...)` — Settler.

## Security notes

These mirror the guarantees of the other two stacks; all three are held to them
by a shared adversarial suite (`security_test.go` here).

- **Verification never panics on hostile input.** A malformed identity,
  signature, or witness yields `Valid: false`, not a panic — safe to run on
  untrusted TIMs. Non-finite numbers (which JCS forbids) surface as
  `tim.non_finite` rather than an error escaping the verifier.
- **Freshness is opt-in.** `VerifyTim` is a pure cryptographic check; use
  `VerifyTimAt(tim, resolve, now)` to also reject expired receipts
  (`exp` <= `at` -> `tim.expired`).
- **`ResolveDidKey` is strict.** It accepts only `did:key:z6Mk...` decoding to
  exactly 34 bytes (`0xed 0x01` + a 32-byte Ed25519 key) and returns `nil`
  otherwise, so it never hands back a slice that is not a key.
- **Anti-replay (`nonce`) and causal chains (`prev`, cross-identity) are the
  caller's responsibility.** Single-TIM verification cannot enforce them — they
  need external state (a seen-nonce store, the prior chain).
- **`did:key` keys are resolved from `identity.id`**, so a DID that does not
  match the signing key fails verification (no hardcoded trust).

## Testing

```sh
go test ./...                    # unit + conformance vectors + security suite
gofmt -l . && go vet ./...       # formatting and vet gates
bash ../../scripts/cross-check.sh  # byte-identity against the TS and Rust stacks
```

The `cmd/` drivers (`canon`, `canonjson`, `decide`, `xr`, `parsetime`) exist so
CI can byte-diff this stack's output against the other two.

## Status

Pre-1.0 (`v0.1.0`); the five core-loop specs are at `status: implementing` with
L2 conformance coverage (other specs remain `status: review`). Passes the
published vectors at L2 and is cross-checked byte-for-byte against the TS and
Rust stacks.

Note on governance: this is a **reference** implementation by the same authors as
the other two, so per governance section 9.1.7 it does **not** satisfy the
external-implementation requirement for promoting specs to `stable`. Its value is
contradiction-hunting — a third clean-room reading of the specs — not quorum.

Fixture keys are TEST KEYS — generate your own with `GenerateKeyPair()`.

Apache-2.0.
