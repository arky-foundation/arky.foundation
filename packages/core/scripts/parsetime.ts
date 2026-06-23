#!/usr/bin/env bun
// Emit epoch ms for an RFC3339 timestamp via Date.parse, so CI can compare
// @arky/core (TS) against arky-core (Rust) parse_rfc3339_ms. Prints the
// integer epoch ms, or "NONE" when Date.parse returns NaN (matching Rust's
// Option<i64>::None for rejected input).
// Usage: bun run scripts/parsetime.ts <ts>
const ts = process.argv[2];
const ms = Date.parse(ts);
process.stdout.write(Number.isNaN(ms) ? 'NONE' : String(ms));
