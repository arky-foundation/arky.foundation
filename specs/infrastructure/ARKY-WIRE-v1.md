---
spec_id: ARKY-WIRE-v1
title: Arky — Wire Bindings (HTTP/gRPC)
version: v1
status: stable
effective: 2025-10-15
doc_type: specification
normative_default: true
depends_on:
  - ARKY-ERRORS-v1
  - ARKY-MEDIA-TYPES-v1
  - ARKY-DISCOVERY-v1
  - ARKY-VECTORS-v1
summary: >
  Unifies transport details used across Arky services: media types, ETag/If-None-Match,
  idempotency semantics, pagination, request correlation, standard rate-limit headers,
  and error envelopes for HTTP/gRPC. Component specs reference this to avoid duplication.
links:
  errors: https://arky.foundation/specs/core/ARKY-ERRORS-v1
  media: https://arky.foundation/specs/infrastructure/ARKY-MEDIA-TYPES-v1
  discovery: https://arky.foundation/specs/infrastructure/ARKY-DISCOVERY-v1
  vectors: https://arky.foundation/specs/development/ARKY-VECTORS-v1
permalink: /specs/infrastructure/ARKY-WIRE-v1
last_updated: 2025-10-15
---

# Arky — Wire Bindings (v1)

All sections are normative unless labeled Informative.

## 1. Transport & Media Types

- HTTPS only; HTTP/2 or HTTP/3 allowed.
- Default request/response media type: `application/json; charset=utf-8`.
- Components may specify additional registered media types per ARKY-MEDIA-TYPES-v1.
 - Discovery endpoints map to media types in ARKY-MEDIA-TYPES-v1; specifically, the revocations endpoint MUST use `application/arky.revocations+json`.

## 2. Error Envelope

All error responses MUST carry the ARKY-ERROR-v1 Error Envelope as JSON body and set an appropriate HTTP status (§6 of ARKY-ERRORS-v1). Unknown EE fields MUST be ignored by clients.

## 3. Caching & Revalidation

- Servers SHOULD set `ETag` and `Cache-Control` on cacheable resources.
- Clients MUST use `If-None-Match` for revalidation. `304 Not Modified` MUST be respected.
- Well-known endpoints in Discovery MUST include `ETag` and support revalidation.

## 4. Idempotency

- POST endpoints that create/execute operations MUST accept `Idempotency-Key` (opaque, ≤128 chars).
- Same `Idempotency-Key` on semantically identical requests MUST yield the same result or a 409/`settler.idempotency_conflict`.
- Idempotency windows MUST be at least 24h; responses MUST include `Idempotency-Key` echo.

## 5. Pagination

- Cursor-based pagination is REQUIRED for list endpoints.
- Responses MUST include `Link` headers with `rel="next"` and/or `rel="prev"` using absolute or origin-relative URLs.
- Clients MUST NOT assume numeric pages; servers MUST preserve cursor stability across a short TTL window.

## 6. Rate Limits

- Servers SHOULD include the IETF `RateLimit-*` headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
- On 429, servers SHOULD include `Retry-After`; clients MUST honor backoff.

## 7. Correlation & Diagnostics

- Requests MAY include `X-Request-Id`; servers MUST echo it if provided or generate one; responses SHOULD include `X-Request-Id`.
- Servers SHOULD include `Server-Timing` for key stages (parse, verify, evaluate, anchor, execute).

## 8. gRPC Mapping

- Map ARKY-ERROR-v1 to gRPC status; attach Error Envelope JSON in binary metadata `arky-error-bin` (base64).
- For streaming RPCs, terminal trailers MUST include `arky-error-bin` on failure.

## 9. Security

- TLS 1.2+; disable weak ciphers.
- Authentication methods allowed: `none`, `mtls`, `oauth2`, `apikey` (as in Discovery schema). Components MAY narrow.
- No PHI/PII in headers; avoid secrets in URLs.

## 10. Conformance

- **W1 — HTTP:** Implements media types, ETag revalidation, error envelope mapping.
- **W2 — Semantics:** Enforces idempotency semantics, pagination, and rate-limit headers.
- **W3 — gRPC:** Correct status mapping and `arky-error-bin` envelope propagation.

End of ARKY-WIRE-v1.

---

## Quick Reference (Informative)

| Area          | MUST                                              | SHOULD                                   | Notes |
| ------------- | ------------------------------------------------- | ---------------------------------------- | ----- |
| Transport     | HTTPS only; HTTP/2 or HTTP/3                      | —                                        | —     |
| Media type    | JSON; `application/arky.*+json` per endpoint      | Include `profile` when available         | see Media Types |
| Errors        | Body = ARKY-ERRORS-v1 envelope (`arky.error+json`) | Map HTTP status per ERRORS §6            | —     |
| Caching       | `ETag` + `If-None-Match`; honor `304`             | `Cache-Control` with sensible TTLs       | Discovery well-knowns required |
| Idempotency   | `Idempotency-Key` on POST; ≥24h retention         | Echo key in response                     | `409` on conflict |
| Pagination    | Cursor-based; `Link: rel="next"|"prev"`          | stable cursors for a short TTL           | No page numbers |
| Rate limits   | —                                                 | `RateLimit-*` headers; `Retry-After` on 429 | IETF draft headers |
| Correlation   | Echo `X-Request-Id` (or generate)                 | `Server-Timing` stages                   | —     |
| gRPC          | Map to status; `arky-error-bin` with EE JSON      | —                                        | streams: trailers on failure |

**Examples:**
- [Idempotent POST request](../../examples/infrastructure/wire/idempotent-post.http) — Complete HTTP request with Idempotency-Key and X-Request-Id headers
- [429 Rate Limit response](../../examples/infrastructure/wire/rate-limit-response.http) — Rate limiting with retry headers and error envelope