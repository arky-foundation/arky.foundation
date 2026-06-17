#!/usr/bin/env bun
// Emit the JCS canonical string of a TIM's canonical body for a fixture, so CI
// can byte-diff @arky/core (TS) output against arky-core (Rust).
// Usage: bun run scripts/canon.ts <path-to-tim-fixture.json>
import { readFileSync } from 'node:fs';
import { canonicalize, canonicalBody } from '../src/index.ts';

const path = process.argv[2];
if (!path) throw new Error('usage: canon.ts <fixture.json>');
const v = JSON.parse(readFileSync(path, 'utf-8'));
const tim = v.tim ?? v;
process.stdout.write(canonicalize(canonicalBody(tim)));
