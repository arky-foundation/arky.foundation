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
