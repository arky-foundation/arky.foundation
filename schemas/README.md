# Arky Schemas

Machine-readable JSON Schemas for validating Arky data structures.

## Directory
- core/ — Common defs, TIM, Kernel, Execution Receipt, Anchor Object, Policy Pack, Service Descriptor
- infrastructure/ — Registries, Revocations, Discovery Index
- verbs/ — Verb argument schemas (pay, refund, slash, revoke, upgrade, signal, control)
- testing/ — Vector manifests, suite manifests, results, releases
- meta/ — Schemas index

## Usage
```ts
import Ajv from 'ajv';
import fs from 'node:fs';

const schema = JSON.parse(fs.readFileSync('schemas/core/tim-v1.json','utf8'));
const ajv = new Ajv();
const validate = ajv.compile(schema);
const ok = validate(data);
```

## Standards
- JSON Schema Draft 2020‑12
- Naming: `{name}-v1.json` (core), `{verb}@v1.json` (verbs)
- Reuse: `$ref` `core/common-defs-v1.json` for shared types
- Strict: `additionalProperties: false` by default

## Versioning
- `v1` is the current schema major line, not a spec lifecycle claim.
- Schema versions are independent of specification versions.
- Breaking changes publish a new file/version and `$id`.
- See `../CONFORMANCE.md` for current spec maturity status.
