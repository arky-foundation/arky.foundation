---

spec_id: ARKY-POSITIONING-v1
title: Arky - Positioning Among Adjacent Protocols
version: v1
status: review
effective: 2026-08-14
doc_type: guide
normative_default: false  # Informative document
depends_on:
  - ARKY-TIM-v1
  - ARKY-KERNEL-v1
  - ARKY-NOTARY-v1
  - ARKY-SETTLERS-v1
  - ARKY-VC-BINDINGS-v1
summary: >
  Where Arky sits relative to agent-commerce protocols (AP2, ACP, x402),
  transparency and provenance standards (SCITT, C2PA), and adjacent
  infrastructure (MCP, W3C VC, OpenTelemetry). Arky binds to these layers
  rather than competing with them.
governance:
  owner: Arky Foundation Technical Council
  process: Maintained alongside specs; additive updates via RFC
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /guides/ARKY-POSITIONING-v1
last_updated: 2026-08-14
---

# Arky - Positioning Among Adjacent Protocols

**One line:** other protocols authorize, transact, or attest; Arky is the
neutral accountability record underneath them - a replayable, signed chain
from evidence to policy decision to execution receipt, verifiable offline on
any rail.

This document is Informative. It exists so adopters can answer "how does Arky
relate to X?" without guessing. Claims about third-party protocols reflect
their public documentation at the time of writing and may drift; corrections
via RFC are welcome.

## 1. The gap Arky fills

The agent economy has organized into layers: identity and payment
authorization, checkout orchestration, and settlement. Each layer produces its
own vendor-scoped logs. None of them standardizes the cross-layer
accountability record: a portable artifact chain proving *who acted, on what
evidence, under which declared policy, and what actually happened* - one that
survives the vendor, works across rails, and verifies without calling anyone's
API.

That record is Arky's entire scope: TIM (evidence) -> Notary (witnessed
time/order) -> Kernel (deterministic decision) -> Settler (execution) -> XR
(receipt), each artifact canonicalized, content-addressed, and signed.

## 2. Positioning table

| Protocol / standard | Steward | Layer | What it does | What it does not do | How Arky relates |
| --- | --- | --- | --- | --- | --- |
| **AP2** (Agent Payments Protocol) | Google + partners | Authorization / mandates | Defines how a user delegates spending authority to an agent (mandates), with agent identity and spend controls | Does not define a rail-agnostic, offline-verifiable evidence->decision->receipt chain; audit trail is scoped to the payments ecosystem | An AP2 mandate is evidence: carry it in a TIM (`identity.claims`), gate execution with a Kernel commitment, receipt settlement as an XR. Arky is the audit substrate an AP2 flow can emit. |
| **ACP** (Agentic Commerce Protocol) | OpenAI + Stripe | Checkout orchestration | Standardizes how an agent negotiates cart, shipping, and purchase with a merchant | Not an accountability record; artifacts are transactional, not designed for third-party replay | Each ACP checkout step can be TIM'd; the final purchase is a Settler verb (`arky:verb/pay@v1`) with the ACP order as `args`, receipted as an XR. |
| **x402** | Coinbase + partners | Settlement (HTTP-native payments) | Machine-to-machine payment over HTTP 402; moves the money | Proves payment occurred on its rail; does not record why the agent paid or under which policy | x402 is a rail. A Settler executes on it; the XR's `anchors` reference the x402 settlement. Arky adds the decision provenance x402 intentionally omits. |
| **SCITT** (IETF) | IETF WG | Supply-chain transparency | Signed statements about artifacts, registered on transparency logs with inclusion receipts | Attests artifacts, not actions; no decision or execution semantics | Closest conceptual neighbor. A SCITT transparency log is a valid Notary anchor target; Arky's Kernel+Settler provide the act-and-answer loop SCITT does not attempt. |
| **C2PA** | C2PA coalition | Content provenance | Cryptographic provenance manifests for media (who created/edited an asset) | Provenance of content, not accountability of actions; no policy gate | Complementary domain. A C2PA manifest is admissible TIM evidence (`measurement.provenance`); Arky receipts can cover the *decision to publish or act on* an asset. |
| **MCP** (Model Context Protocol) | Anthropic + community | Agent tool connectivity | Standardizes how agents discover and call tools | Transport, not accountability; tool calls are unlogged by the protocol itself | Distribution channel, not competitor: `@arky/mcp` wraps any MCP server so every tool call becomes a TIM -> Decision -> XR chain. See `packages/mcp/`. |
| **W3C Verifiable Credentials** | W3C | Identity claims | Portable, cryptographically verifiable claims about subjects | Claims about subjects, not records of actions | Arky consumes VCs as identity/authority evidence; see `ARKY-VC-BINDINGS-v1`. |
| **OpenTelemetry** | CNCF | Observability | Traces, metrics, and logs for operations | Observability is mutable, unsigned, and trusted-source; it answers "what happened operationally", not "prove it to a third party" | Coexists. Keep OTel for debugging; emit Arky artifacts where an action needs third-party-verifiable proof. |

## 3. What is distinct about Arky

1. **Deterministic and replayable.** Decisions are pure functions of signed
   evidence and a declared commitment; two independent implementations
   (TypeScript and Rust) reproduce every artifact byte-for-byte and are
   cross-checked in CI.
2. **Rail-agnostic.** The same receipt language covers a bank transfer, an
   on-chain settlement, an x402 payment, or a device command.
3. **Offline-verifiable.** Verification needs only the artifacts and public
   keys - no issuer API, no vendor uptime, no network at all.
4. **Neutral.** No token, no network to join, no rent. Apache-2.0 code,
   CC-BY-4.0 text, executable conformance vectors instead of certification
   fees.

## 4. Non-goals

Arky does not move money, host a transparency log, issue identities, or define
commerce flows. Where an adjacent protocol does one of those well, the correct
integration is a binding (evidence in, anchors out), not a replacement.
