/**
 * The @arky/mcp interception engine.
 *
 * Transport-agnostic: `handleClientMessage` / `handleServerMessage` take one
 * newline-delimited JSON-RPC message each and return what to forward and/or
 * reply. The CLI wires this to real stdio pipes; tests drive it directly.
 *
 * Every `tools/call` request is gated: evidence TIMs are built from the call,
 * the matching compiled Commitment is evaluated by the reference Kernel, and
 * only an APPROVED decision lets the message through to the wrapped server.
 * Anything that cannot be positively approved — no matching rule, REJECTED,
 * INDETERMINATE (missing/unbindable arguments), or a batch containing a tool
 * call — is denied. Fail closed.
 */

import { evaluateKernel, type KeyPair } from "@arky/core";
import { buildEvidence, buildXr, wrapDecision, type BundleWriter } from "./audit.ts";
import { matchRule, type CompiledRule, type PolicyFile } from "./policy.ts";

export interface EngineOptions {
  policy: PolicyFile;
  compiled: CompiledRule[];
  keys: KeyPair;
  /** label for the wrapped server (used as TIM method.source and XR rail) */
  serverName: string;
  writer?: BundleWriter;
  now?: () => string;
}

export interface ClientAction {
  /** message to pass on to the wrapped server (raw line), if any */
  forward?: string;
  /** message to send straight back to the client (denials), if any */
  reply?: string;
}

interface PendingCall {
  seq: string;
  tool: string;
  args: Record<string, unknown>;
  commitmentCid: string;
  decisionCid: string;
}

export class ArkyMcpEngine {
  private pending = new Map<string, PendingCall>();
  private byTool = new Map<string, CompiledRule>();

  constructor(private opts: EngineOptions) {
    for (const c of opts.compiled) this.byTool.set(c.rule.tool, c);
  }

  private now(): string {
    return this.opts.now ? this.opts.now() : new Date().toISOString();
  }

  handleClientMessage(raw: string): ClientAction {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return { forward: raw }; // not JSON-RPC; the server will reject it
    }

    // JSON-RPC batches could smuggle tool calls past per-message gating —
    // deny the whole batch if any element is a tools/call.
    if (Array.isArray(msg)) {
      const calls = msg.filter(
        (m) => typeof m === "object" && m !== null && (m as any).method === "tools/call",
      );
      if (calls.length > 0) {
        const replies = calls
          .filter((m) => (m as any).id !== undefined)
          .map((m) => this.denyReply((m as any).id, "batched tools/call is not allowed"));
        return replies.length > 0 ? { reply: JSON.stringify(replies) } : {};
      }
      return { forward: raw };
    }

    const m = msg as Record<string, unknown>;
    if (m.method !== "tools/call") return { forward: raw };

    const params = (m.params ?? {}) as Record<string, unknown>;
    const tool = typeof params.name === "string" ? params.name : "";
    const args =
      typeof params.arguments === "object" && params.arguments !== null
        ? (params.arguments as Record<string, unknown>)
        : {};
    const id = m.id;
    const ts = this.now();
    const seq = this.opts.writer?.nextSeq() ?? "";

    // Evidence: signed TIMs for the tool name and each primitive argument.
    const evidence = buildEvidence(tool, args, this.opts.keys, this.opts.serverName, ts);
    if (this.opts.writer) {
      evidence.tims.forEach((t, i) => this.opts.writer!.writeCall(seq, `tim-${i}`, t as any));
    }
    const evidenceCids = evidence.tims.map((t) => t.cid);

    // Policy: evaluate the matching Commitment with the reference Kernel.
    const rule = matchRule(this.opts.policy, tool);
    let decision;
    let commitmentCid = "";
    if (!rule || tool === "") {
      decision = {
        status: "REJECTED" as const,
        assertions: [],
        authorized: [],
        errors: ["policy.no_matching_rule"],
      };
    } else {
      const compiled = this.byTool.get(rule.tool)!;
      commitmentCid = compiled.cid;
      decision = evaluateKernel(compiled.commitment, evidence.tims, { time: ts });
    }
    const decisionArtifact = wrapDecision(
      decision,
      commitmentCid,
      evidenceCids,
      this.opts.keys,
      ts,
    );
    this.opts.writer?.writeCall(seq, "decision", decisionArtifact);

    if (decision.status !== "APPROVED") {
      if (id === undefined) return {}; // notification-style call: drop silently
      const detail =
        decision.errors[0] ??
        decision.assertions.find((a) => a.result !== "PASS")?.name ??
        "assertion failed";
      return { reply: JSON.stringify(this.denyReply(id, `${decision.status}: ${detail}`)) };
    }

    if (id !== undefined) {
      this.pending.set(String(id), {
        seq,
        tool,
        args,
        commitmentCid,
        decisionCid: decisionArtifact.cid as string,
      });
    }
    return { forward: raw };
  }

  handleServerMessage(raw: string): { forward: string } {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return { forward: raw };
    }
    const m = msg as Record<string, unknown>;
    if (m.id === undefined || (m.result === undefined && m.error === undefined)) {
      return { forward: raw }; // notification/request from server: passthrough
    }
    const call = this.pending.get(String(m.id));
    if (!call) return { forward: raw };
    this.pending.delete(String(m.id));

    const rpcError = m.error as { code?: unknown; message?: unknown } | undefined;
    const toolError = (m.result as Record<string, unknown> | undefined)?.isError === true;
    const failed = rpcError !== undefined || toolError;
    const xr = buildXr(
      {
        requestId: `call-${call.seq}`,
        tool: call.tool,
        args: call.args,
        commitmentCid: call.commitmentCid,
        decisionCid: call.decisionCid,
        rail: `mcp:${this.opts.serverName}`,
        status: failed ? "failed" : "success",
        ...(failed
          ? {
              error: {
                code: rpcError ? `jsonrpc:${rpcError.code}` : "mcp:tool_error",
                message: rpcError ? String(rpcError.message ?? "") : "tool returned isError",
              },
            }
          : {}),
        ts: this.now(),
      },
      this.opts.keys,
    );
    this.opts.writer?.writeCall(call.seq, "xr", xr);
    return { forward: raw };
  }

  /** An MCP tool result carrying isError — agents surface this gracefully. */
  private denyReply(id: unknown, detail: string): Record<string, unknown> {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: `Arky policy denied this tool call (${detail})` }],
        isError: true,
      },
    };
  }
}
