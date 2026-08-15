#!/usr/bin/env bash
# Cross-language determinism check: assert @arky/core (TS), arky-core (Rust),
# and arky-core-go (Go) produce BYTE-IDENTICAL results for the shared fixtures
# and vectors. This is the heart of the "independent stacks agree" guarantee:
# canonical bytes -> cids -> Ed25519 signatures -> kernel decisions -> receipts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fail=0

# ts_run / rs_run / go_run invoke one stack's driver for a given check.
ts_run() { (cd "$ROOT/packages/core" && bun run "scripts/$1.ts" "${@:2}"); }
rs_run() { (cd "$ROOT/packages/core-rs" && cargo run --quiet --example "$1" -- "${@:2}" 2>/dev/null); }
go_run() { (cd "$ROOT/packages/core-go" && go run "./cmd/$1" "${@:2}"); }

# compare3 <label> <ts> <rs> <go> [expected]
# Reports OK only when all stacks agree (and match `expected` when supplied).
compare3() {
  local label="$1" ts="$2" rs="$3" go="$4" expected="${5-}"
  if [[ "$ts" == "$rs" && "$rs" == "$go" ]]; then
    if [[ -n "$expected" && "$ts" != "$expected" ]]; then
      echo "[FAIL] $label agrees across stacks but not with the published value:"
      echo "  Expected: $expected"
      echo "  Got:      $ts"
      fail=1
      return
    fi
    echo "[OK]   $label -> $ts"
  else
    echo "[FAIL] $label diverges:"
    echo "  TS:   $ts"
    echo "  Rust: $rs"
    echo "  Go:   $go"
    fail=1
  fi
}

check_fail() {
  if [[ $fail -ne 0 ]]; then
    echo "$1" >&2
    exit 1
  fi
}

FIXTURES=(
  "vectors/fixtures/tims/valid-tim-001.json"
  "vectors/fixtures/tims/valid-tim-002.json"
  "vectors/integration/reference-path/01-tim.json"
)

echo "Canonical bytes for shared TIM fixtures: TS vs Rust vs Go"
for fx in "${FIXTURES[@]}"; do
  ts="$(ts_run canon "$ROOT/$fx")"
  rs="$(rs_run canon "$ROOT/$fx")"
  go="$(go_run canon "$ROOT/$fx")"
  if [[ "$ts" == "$rs" && "$rs" == "$go" ]]; then
    echo "[OK]   $fx (all stacks agree, $(printf '%s' "$go" | wc -c | tr -d ' ') bytes)"
  else
    echo "[FAIL] $fx canonical bytes diverge:"
    echo "  TS:   $ts"
    echo "  Rust: $rs"
    echo "  Go:   $go"
    fail=1
  fi
done
check_fail "Cross-language canonicalization MISMATCH."
echo "All fixtures: TS, Rust and Go canonical bytes are identical."

echo
echo "RFC 8785 number edges (exponent + precision): TS vs Rust vs Go"
# Values the happy-path fixtures never exercise; where JCS impls commonly
# diverge. Every stack must emit ECMAScript Number::toString form.
NUMS=(
  '{"n":1e21}' '{"n":1e20}' '{"n":1e-7}' '{"n":1e-6}' '{"n":0.0000001}'
  '{"n":1.5e300}' '{"n":-1.5e-300}' '{"n":9007199254740993}'
  '{"n":5e-324}' '{"n":1.7976931348623157e308}' '{"n":100000000000000000000}'
  '{"n":0.1}' '{"n":0.3}' '{"n":22.5}' '{"n":-0.0}'
)
for j in "${NUMS[@]}"; do
  compare3 "$j" "$(ts_run canonjson "$j")" "$(rs_run canonjson "$j")" "$(go_run canonjson "$j")"
done
check_fail "Cross-language number MISMATCH."
echo "All number edges: TS, Rust and Go agree."

echo
echo "C2 canonicalization vectors: TS + Rust + Go vs published expectation"
for vec in "$ROOT"/vectors/canonicalization/c2-*.json; do
  input="$(bun -e 'const v = JSON.parse(await Bun.file(process.argv[1]).text()); process.stdout.write(JSON.stringify(v.inputs.original));' "$vec")"
  expected="$(bun -e 'const v = JSON.parse(await Bun.file(process.argv[1]).text()); process.stdout.write(v.expect.canonical_json);' "$vec")"
  name="$(basename "$vec" .json)"
  compare3 "$name" "$(ts_run canonjson "$input")" "$(rs_run canonjson "$input")" \
    "$(go_run canonjson "$input")" "$expected"
done
check_fail "Cross-language C2 vector MISMATCH."
echo "All C2 vectors: every stack matches the published expectation."

echo
echo "RFC 3339 timestamp edges (offset + fractional + rejection): TS vs Rust vs Go"
# The TS kernel uses Date.parse; Rust and Go hand-roll a parser. All must agree
# on epoch ms for 'Z', numeric offsets, and fractional seconds, and must reject
# trailing garbage / a missing designator ("NONE"). '12:00:00+02:00' MUST equal
# '10:00:00Z'.
TSMS=(
  '2025-10-15T12:00:00Z'
  '2025-10-15T10:00:00Z'
  '2025-10-15T12:00:00+02:00'
  '2025-10-15T12:00:00-05:00'
  '2025-10-15T12:00:00.5Z'
  '2025-10-15T12:00:00.123Z'
  '2025-10-15T12:00:00.123456Z'
  '2025-10-15T12:00:00.5+02:00'
  '2025-10-15T12:00:00GARBAGE'
  '2025-10-15T12:00:00Z '
  '2025-10-15T12:00:00Zextra'
  '2025-10-15T12:00:00+02:00extra'
)
for ts in "${TSMS[@]}"; do
  compare3 "$ts" "$(ts_run parsetime "$ts")" "$(rs_run parsetime "$ts")" "$(go_run parsetime "$ts")"
done
check_fail "Cross-language timestamp MISMATCH."
echo "All timestamp edges: TS, Rust and Go agree."

echo
echo "Kernel decisions (K1 + K2 vectors): TS vs Rust vs Go"
# K2 adds behavioral L2 cases (negative literals, type-mismatch INDETERMINATE,
# timezone-offset window selection) whose decisions every stack must agree on.
for vec in "$ROOT"/vectors/kernel/k1-*.json "$ROOT"/vectors/kernel/k2-*.json; do
  name="$(basename "$vec")"
  compare3 "$name" "$(ts_run decide "$vec" "$ROOT")" "$(rs_run decide "$vec")" "$(go_run decide "$vec")"
done
check_fail "Cross-language MISMATCH."
echo "All K1+K2 vectors: kernel decisions are identical across stacks."

echo
echo "Settler execution receipts (S1 vectors): TS vs Rust vs Go"
# The receipt cid covers the canonical XR body, so matching cids prove the
# stacks agree on canonical bytes AND produce identical Ed25519 signatures.
for vec in "$ROOT"/vectors/settlers/s1-*.json; do
  name="$(basename "$vec")"
  compare3 "$name" "$(ts_run xr "$vec")" "$(rs_run xr "$vec")" "$(go_run xr "$vec")"
done
check_fail "Cross-language MISMATCH."
echo "All S1 vectors: execution receipts are identical across stacks."

echo
echo "Cross-language agreement holds end-to-end across three independent stacks:"
echo "canonical bytes -> cids -> kernel decisions -> execution receipts."
