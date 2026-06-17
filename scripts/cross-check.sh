#!/usr/bin/env bash
# Cross-language determinism check: assert @arky/core (TS) and arky-core (Rust)
# produce BYTE-IDENTICAL JCS canonical bytes for the shared TIM fixtures. This
# is the heart of the "two independent stacks agree" guarantee.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURES=(
  "vectors/fixtures/tims/valid-tim-001.json"
  "vectors/fixtures/tims/valid-tim-002.json"
  "vectors/integration/reference-path/01-tim.json"
)

fail=0
for fx in "${FIXTURES[@]}"; do
  ts="$(cd "$ROOT/packages/core" && bun run scripts/canon.ts "$ROOT/$fx")"
  rs="$(cd "$ROOT/packages/core-rs" && cargo run --quiet --example canon -- "$ROOT/$fx" 2>/dev/null)"
  if [[ "$ts" == "$rs" ]]; then
    echo "[OK]   $fx (TS == Rust, $(printf '%s' "$ts" | wc -c | tr -d ' ') bytes)"
  else
    echo "[FAIL] $fx canonical bytes diverge:"
    echo "  TS:   $ts"
    echo "  Rust: $rs"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "Cross-language canonicalization MISMATCH." >&2
  exit 1
fi
echo "All fixtures: TS and Rust canonical bytes are identical."

echo
echo "RFC 8785 number edges (exponent + precision): TS vs Rust"
# Values the happy-path fixtures never exercise; where JCS impls commonly
# diverge. Both stacks must emit ECMAScript Number::toString form.
NUMS=(
  '{"n":1e21}' '{"n":1e20}' '{"n":1e-7}' '{"n":1e-6}' '{"n":0.0000001}'
  '{"n":1.5e300}' '{"n":-1.5e-300}' '{"n":9007199254740993}'
  '{"n":5e-324}' '{"n":1.7976931348623157e308}' '{"n":100000000000000000000}'
  '{"n":0.1}' '{"n":0.3}' '{"n":22.5}' '{"n":-0.0}'
)
for j in "${NUMS[@]}"; do
  ts="$(cd "$ROOT/packages/core" && bun run scripts/canonjson.ts "$j")"
  rs="$(cd "$ROOT/packages/core-rs" && cargo run --quiet --example canonjson -- "$j" 2>/dev/null)"
  if [[ "$ts" == "$rs" ]]; then
    echo "[OK]   $j -> $ts"
  else
    echo "[FAIL] $j number form diverges: TS=$ts Rust=$rs"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "Cross-language number MISMATCH." >&2
  exit 1
fi
echo "All number edges: TS and Rust agree."

echo
echo "Kernel decisions (K1 vectors): TS vs Rust"
for vec in "$ROOT"/vectors/kernel/k1-*.json; do
  ts="$(cd "$ROOT/packages/core" && bun run scripts/decide.ts "$vec" "$ROOT")"
  rs="$(cd "$ROOT/packages/core-rs" && cargo run --quiet --example decide -- "$vec" 2>/dev/null)"
  name="$(basename "$vec")"
  if [[ "$ts" == "$rs" ]]; then
    echo "[OK]   $name -> $ts"
  else
    echo "[FAIL] $name kernel decision diverges: TS=$ts Rust=$rs"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "Cross-language MISMATCH." >&2
  exit 1
fi
echo "All K1 vectors: TS and Rust kernel decisions are identical."

echo
echo "Settler execution receipts (S1 vectors): TS vs Rust"
for vec in "$ROOT"/vectors/settlers/s1-*.json; do
  ts="$(cd "$ROOT/packages/core" && bun run scripts/xr.ts "$vec")"
  rs="$(cd "$ROOT/packages/core-rs" && cargo run --quiet --example xr -- "$vec" 2>/dev/null)"
  name="$(basename "$vec")"
  if [[ "$ts" == "$rs" ]]; then
    echo "[OK]   $name -> $ts"
  else
    echo "[FAIL] $name XR diverges: TS=$ts Rust=$rs"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "Cross-language MISMATCH." >&2
  exit 1
fi
echo "All S1 vectors: TS and Rust execution receipts are identical."
echo
echo "Cross-language agreement holds end-to-end: canonical bytes -> cids -> kernel decisions -> execution receipts."
