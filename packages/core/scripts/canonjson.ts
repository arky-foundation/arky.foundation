#!/usr/bin/env bun
// Canonicalize a raw JSON string argument (for cross-language number/edge
// checks). Usage: bun run scripts/canonjson.ts '{"n":1e21}'
import { canonicalize } from '../src/index.ts';
process.stdout.write(canonicalize(JSON.parse(process.argv[2])));
