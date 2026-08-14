/**
 * Policy loading and compilation for @arky/mcp.
 *
 * A policy file maps MCP tool names to Kernel constraints. Each rule compiles
 * to a real ARKY-KERNEL-v1 Commitment: one MeasureSpec binding the tool name,
 * plus one MeasureSpec per constrained argument symbol. Enforcement is the
 * unmodified reference Kernel — nothing here re-implements decision logic.
 */

import {
  canonicalize,
  cidFromCanonical,
  signDetached,
  parseStrict,
  type Commitment,
  type KeyPair,
} from "@arky/core";
import { readFileSync } from "node:fs";

export interface PolicyRule {
  /** Exact MCP tool name, or "*" to match any tool not matched earlier. */
  tool: string;
  /**
   * Ordered map of symbol -> assertion (ARKY-KERNEL-v1 §4 grammar). Each key
   * must name a top-level tool argument (after `symbolize`); its assertion is
   * evaluated against that argument's value. Later assertions may reference
   * symbols bound by earlier keys. Every assertion must PASS for approval; a
   * missing or non-primitive argument leaves its symbol unbound, which yields
   * INDETERMINATE — i.e. deny (fail closed).
   */
  where?: Record<string, string>;
}

export interface PolicyFile {
  version: 1;
  /** Commitment scope URN; defaults to arky:scope/mcp-tools. */
  scope?: string;
  rules: PolicyRule[];
}

/** A compiled rule: the signed Commitment artifact plus its source rule. */
export interface CompiledRule {
  rule: PolicyRule;
  commitment: Commitment;
  cid: string;
  /** Full signed artifact (commitment body + cid + sig) for the bundle. */
  artifact: Record<string, unknown>;
}

const SYMBOL_RE = /^[a-z_][a-z0-9_]*$/;
/** `tool` is bound by the proxy itself; argument symbols must not shadow it. */
export const RESERVED_SYMBOLS = new Set(["tool"]);

/**
 * Map an MCP argument name onto an assertion-grammar symbol: lowercase, any
 * character outside [a-z0-9_] becomes '_', leading digit gets a '_' prefix.
 */
export function symbolize(argName: string): string {
  let s = argName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!/^[a-z_]/.test(s)) s = "_" + s;
  return s;
}

export function validatePolicy(p: unknown): PolicyFile {
  if (typeof p !== "object" || p === null || Array.isArray(p)) {
    throw new Error("policy: must be an object");
  }
  const pol = p as Record<string, unknown>;
  if (pol.version !== 1) throw new Error("policy: version must be 1");
  if (pol.scope !== undefined && typeof pol.scope !== "string") {
    throw new Error("policy: scope must be a string");
  }
  if (!Array.isArray(pol.rules) || pol.rules.length === 0) {
    throw new Error("policy: rules must be a non-empty array");
  }
  const seen = new Set<string>();
  for (const r of pol.rules as unknown[]) {
    if (typeof r !== "object" || r === null) throw new Error("policy: rule must be an object");
    const rule = r as Record<string, unknown>;
    if (typeof rule.tool !== "string" || rule.tool.length === 0) {
      throw new Error("policy: rule.tool must be a non-empty string");
    }
    // Tool names land inside assertion string literals; the grammar has no
    // escapes, so a quote would change the expression's meaning.
    if (rule.tool.includes('"')) throw new Error(`policy: rule.tool must not contain '"'`);
    if (seen.has(rule.tool)) throw new Error(`policy: duplicate rule for tool '${rule.tool}'`);
    seen.add(rule.tool);
    if (rule.where !== undefined) {
      if (typeof rule.where !== "object" || rule.where === null || Array.isArray(rule.where)) {
        throw new Error("policy: rule.where must be an object");
      }
      for (const [sym, assert] of Object.entries(rule.where)) {
        if (!SYMBOL_RE.test(sym)) {
          throw new Error(`policy: where key '${sym}' is not a valid symbol ([a-z_][a-z0-9_]*)`);
        }
        if (RESERVED_SYMBOLS.has(sym)) {
          throw new Error(`policy: where key '${sym}' is reserved`);
        }
        if (typeof assert !== "string" || assert.length === 0) {
          throw new Error(`policy: where['${sym}'] must be a non-empty assertion string`);
        }
      }
    }
  }
  return pol as unknown as PolicyFile;
}

/** Load a policy file (strict JSON: duplicate keys rejected) and validate it. */
export function loadPolicy(path: string): PolicyFile {
  return validatePolicy(parseStrict(readFileSync(path, "utf8")));
}

/** First rule whose tool matches exactly, else the "*" rule, else undefined. */
export function matchRule(policy: PolicyFile, tool: string): PolicyRule | undefined {
  return policy.rules.find((r) => r.tool === tool) ?? policy.rules.find((r) => r.tool === "*");
}

/** Compile a rule to a signed Commitment artifact. */
export function compileRule(rule: PolicyRule, policy: PolicyFile, keys: KeyPair): CompiledRule {
  const measure = [
    {
      name: "tool",
      assert: rule.tool === "*" ? 'tool != ""' : `tool == "${rule.tool}"`,
      require: { code: ["tool"] },
    },
    ...Object.entries(rule.where ?? {}).map(([sym, assert]) => ({
      name: sym,
      assert,
      require: { code: [sym] },
    })),
  ];
  const body: Record<string, unknown> = {
    scope: policy.scope ?? "arky:scope/mcp-tools",
    actor: keys.did,
    intent: { do: "mcp.tool_call" },
    measure,
    consequence: [
      {
        if: "PASS",
        // `then` is ARKY-KERNEL-v1's ConsequenceSpec field name, not a thenable.
        // oxlint-disable-next-line unicorn/no-thenable
        then: [{ name: "arky:verb/control@v1", args: { action: `mcp.tool_call:${rule.tool}` } }],
      },
    ],
  };
  const canonical = canonicalize(body);
  const cid = cidFromCanonical(canonical);
  const sig = signDetached(new TextEncoder().encode(canonical), keys.privateKey, keys.did);
  const artifact = { ...body, cid, sig };
  return { rule, commitment: body as unknown as Commitment, cid, artifact };
}

export function compilePolicy(policy: PolicyFile, keys: KeyPair): CompiledRule[] {
  return policy.rules.map((r) => compileRule(r, policy, keys));
}
