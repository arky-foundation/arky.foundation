/**
 * @arky/mcp — policy-gated audit proxy for MCP servers.
 *
 * Wrap any stdio MCP server so every tool call an agent makes becomes a
 * signed, replayable Arky chain: evidence TIMs -> Kernel Decision -> Execution
 * Receipt. See the package README for the CLI quickstart; these exports are
 * the embeddable engine and bundle verifier.
 */

export {
  compilePolicy,
  compileRule,
  loadPolicy,
  matchRule,
  symbolize,
  validatePolicy,
  RESERVED_SYMBOLS,
  type CompiledRule,
  type PolicyFile,
  type PolicyRule,
} from "./policy.ts";
export {
  buildEvidence,
  buildXr,
  wrapDecision,
  BundleWriter,
  type Evidence,
  type SessionMeta,
  type XrInput,
} from "./audit.ts";
export { ArkyMcpEngine, type ClientAction, type EngineOptions } from "./proxy.ts";
export { verifyBundle, type BundleReport } from "./verify.ts";
