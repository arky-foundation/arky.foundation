# Contributing to Arky

This repository is the authoritative home of the Arky specifications, schemas,
registries, conformance vectors, and the reference implementations
(`packages/core` in TypeScript, `packages/core-rs` in Rust, `packages/mcp`).

## Specs, schemas, and registries

- Discuss substantial changes via an RFC in `rfcs/` before opening a spec PR.
- Keep specs self‑contained, minimal, and normative by default.
- Examples and long explanations belong in `guides/` or `examples/`.
- Update or add JSON schemas when specs introduce or change shapes.
- Spec changes that alter observable behavior MUST ship with vectors; the
  verifier executes them, so a claim without a passing vector fails CI.

Process overview
- Open an RFC PR under `rfcs/` using `0000-template.md`.
- After consensus, send a spec PR under `specs/` with vectors/schemas updates.
- Include a short changelog at the top of the spec.

## Reference implementations

- `packages/core` and `packages/core-rs` are clean-room implementations held
  byte-identical by `scripts/cross-check.sh`; a change to one usually requires
  the same change to the other, and the cross-check must stay green.
- New conformance checks must be negative-tested: corrupt the expectation, see
  the check fail, restore it.

## Before opening a PR

```sh
bun install
bun run validate                                  # syntax, verifier, schema, links, counts
bun test                                          # TypeScript reference tests
cargo test --manifest-path packages/core-rs/Cargo.toml
```

## Style

- Use RFC 2119 keywords (MUST/SHOULD/MAY) only in normative sections.
- Start each spec with front matter fields (`spec_id`, `title`, `version`, `status`, `effective`, `doc_type`, `normative_default`, `depends_on`, `summary`, `links`, `permalink`, `last_updated`).
- Prefer concise, testable language; defer examples to `examples/`.

## Security

- Do not add secrets or PII to examples or vectors; fixture keys are test-only.
- Report vulnerabilities as described in `SECURITY.md`.
