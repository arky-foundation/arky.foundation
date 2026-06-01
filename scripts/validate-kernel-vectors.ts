#!/usr/bin/env bun
/**
 * Validate that each kernel vector's embedded commitment matches the Kernel
 * schema in the direction its `expect` block claims:
 *   - expect.schema_valid === true  -> commitment MUST validate
 *   - expect.schema_valid === false -> commitment MUST be rejected
 *
 * This guards against the vectors drifting away from the spec/schema again.
 *
 * Usage: bun run scripts/validate-kernel-vectors.ts
 */

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

const rootDir = join(import.meta.dir, '..');

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const commonDefs = JSON.parse(
  await readFile(join(rootDir, 'schemas/core/common-defs-v1.json'), 'utf-8'),
);
ajv.addSchema(commonDefs);
const kernelSchema = JSON.parse(
  await readFile(join(rootDir, 'schemas/core/kernel-v1.json'), 'utf-8'),
);
const validate = ajv.compile(kernelSchema);

let failures = 0;

const dir = join(rootDir, 'vectors/kernel');
const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();

for (const name of files) {
  const path = join(dir, name);
  const rel = relative(rootDir, path);
  const vector = JSON.parse(await readFile(path, 'utf-8'));
  const commitment = vector.inputs?.commitment;
  const expectSchemaValid = vector.expect?.schema_valid;

  if (commitment === undefined || expectSchemaValid === undefined) {
    console.log(`  [SKIP] ${rel} (no commitment or no schema_valid expectation)`);
    continue;
  }

  const ok = validate(commitment);
  if (ok === expectSchemaValid) {
    console.log(`  [PASS] ${rel} (schema_valid=${expectSchemaValid})`);
  } else {
    failures++;
    console.log(
      `  [FAIL] ${rel}: expected schema_valid=${expectSchemaValid}, got ${ok}` +
        (ok ? '' : ` — ${ajv.errorsText(validate.errors)}`),
    );
  }
}

if (failures > 0) {
  console.log(`\n${failures} kernel vector(s) disagree with the schema.`);
  process.exit(1);
}
console.log('\nAll kernel vectors agree with the Kernel schema.');
