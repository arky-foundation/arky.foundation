---
spec_id: ARKY-LOCALE-v1
title: Arky — Localization & Internationalization
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-MEDIA-TYPES-v1
summary: >
  Defines localization practices for Arky documentation and user-facing metadata:
  BCP-47 language tags, ICU formatting, RTL handling, and translation workflow.
permalink: /specs/ARKY-LOCALE-v1
last_updated: 2025-10-15
---

# Arky — Localization & Internationalization (v1)

All sections are normative unless labeled Informative.

## 1. Language Tags

- Use BCP-47 tags (e.g., `en`, `es-419`, `pt-BR`, `ar`, `zh-Hans`).
- Default language for Arky docs is `en`.

## 2. Formatting & Direction

- Use ICU message format for locale-sensitive strings when needed.
- Support RTL rendering for `ar` and similar languages; avoid hard-coded LTR assumptions.

## 3. Translation Workflow

- Maintain a translations manifest listing supported locales and coverage status.
- Translations MUST be reviewed by a native/fluent speaker before publication.

## 4. Conformance

- **L1 — Tags:** Use valid BCP-47 tags.
- **L2 — Direction:** Respect RTL/LTR.
- **L3 — Review:** Require native/fluent review for new locales.

End of ARKY-LOCALE-v1.