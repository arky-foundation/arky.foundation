# Contributing to Arky Foundation Docs

This repository is the authoritative documentation for Arky specifications,
registries, and schemas. No implementation code is hosted here.

- Discuss substantial changes via an RFC in `rfcs/` before opening a spec PR.
- Keep specs self‑contained, minimal, and normative by default.
- Examples and long explanations belong in `guides/` or `examples/`.
- Update or add JSON schemas when specs introduce or change shapes.

Process overview
- Open an RFC PR under `rfcs/` using `0000-template.md`.
- After consensus, send a spec PR under `specs/` with vectors/schemas updates.
- Include a short changelog at the top of the spec.

Style
- Use RFC 2119 keywords (MUST/SHOULD/MAY) only in normative sections.
- Start each spec with front matter fields (`spec_id`, `title`, `version`, `status`, `effective`, `doc_type`, `normative_default`, `depends_on`, `summary`, `links`, `permalink`, `last_updated`).
- Prefer concise, testable language; defer examples to `examples/`.

Security
- Do not add secrets or PII to examples.
- Report vulnerabilities as described in `SECURITY.md`.
