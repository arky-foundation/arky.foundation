/**
 * Artifact construction and bundle persistence for @arky/mcp.
 *
 * Per intercepted tool call the proxy emits:
 *   - evidence TIMs (one for the tool name, one per primitive argument),
 *   - a signed Decision artifact wrapping the Kernel's verdict, and
 *   - on approved + executed calls, a signed Execution Receipt (XR) recording
 *     what the wrapped server actually returned.
 *
 * All artifacts are canonical JSON (JCS), content-addressed, and Ed25519
 * signed with the proxy's key, so the whole session replays offline.
 */

import {
  argsHash,
  canonicalize,
  cidFromCanonical,
  createTim,
  deriveIdempotencyKey,
  signDetached,
  type Decision,
  type KeyPair,
  type Tim,
} from "@arky/core";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { symbolize, RESERVED_SYMBOLS } from "./policy.ts";

/** Evidence for one tool call: the TIMs the Kernel will bind symbols from. */
export interface Evidence {
  tims: Tim[];
  /** argument symbols that collided after `symbolize` (left unbound; fail closed) */
  collisions: string[];
}

const isPrimitive = (v: unknown): v is string | number | boolean =>
  typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

/**
 * Build the evidence TIMs for a tool call. The tool TIM carries the full raw
 * arguments in `measurement.provenance` so the audit record is complete even
 * for arguments the policy does not constrain. Argument TIMs are emitted only
 * for top-level primitive values; each is tagged with `measurement.code` equal
 * to its symbol so the Commitment's MeasureSpecs (`require.code`) bind
 * deterministically. Symbols that collide (two argument names mapping to the
 * same symbol, or shadowing the reserved `tool`) are left unbound.
 */
export function buildEvidence(
  tool: string,
  args: Record<string, unknown>,
  keys: KeyPair,
  serverName: string,
  ts: string,
): Evidence {
  const identity = { id: keys.did };
  const method = { type: "mcp", source: serverName };
  const tims: Tim[] = [
    createTim(
      {
        ts,
        identity,
        measurement: {
          name: "tool",
          value: tool,
          code: "tool",
          method,
          provenance: { arguments: args },
        },
      },
      keys.privateKey,
      keys.did,
    ),
  ];

  const bySymbol = new Map<string, string>(); // symbol -> original arg name
  const collisions = new Set<string>();
  for (const name of Object.keys(args)) {
    const sym = symbolize(name);
    if (RESERVED_SYMBOLS.has(sym)) {
      collisions.add(sym);
      continue;
    }
    if (bySymbol.has(sym)) {
      collisions.add(sym);
      continue;
    }
    bySymbol.set(sym, name);
  }
  for (const [sym, name] of bySymbol) {
    if (collisions.has(sym)) continue;
    const value = args[name];
    if (!isPrimitive(value)) continue;
    tims.push(
      createTim(
        {
          ts,
          identity,
          measurement: { name: sym, value, code: sym, method: { type: "mcp.arg", source: name } },
        },
        keys.privateKey,
        keys.did,
      ),
    );
  }
  return { tims, collisions: [...collisions] };
}

/** Sign an arbitrary artifact body: canonicalize -> cid -> detached JWS. */
function signArtifact(body: Record<string, unknown>, keys: KeyPair): Record<string, unknown> {
  const canonical = canonicalize(body);
  const cid = cidFromCanonical(canonical);
  const sig = signDetached(new TextEncoder().encode(canonical), keys.privateKey, keys.did);
  return { ...body, cid, sig };
}

/** Wrap a Kernel Decision into a signed, content-addressed artifact. */
export function wrapDecision(
  decision: Decision,
  commitmentCid: string,
  evidenceCids: string[],
  keys: KeyPair,
  ts: string,
): Record<string, unknown> {
  return signArtifact(
    {
      "@type": "ARKY:Decision@v1",
      status: decision.status,
      assertions: decision.assertions,
      authorized: decision.authorized,
      errors: decision.errors,
      commitment_cid: commitmentCid,
      evidence: evidenceCids,
      identity: { id: keys.did },
      time: { ts },
    },
    keys,
  );
}

export interface XrInput {
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
  commitmentCid: string;
  decisionCid: string;
  rail: string;
  status: "success" | "failed";
  error?: { code: string; message: string };
  ts: string;
}

/** Build a signed Execution Receipt for a forwarded tool call's outcome. */
export function buildXr(input: XrInput, keys: KeyPair): Record<string, unknown> {
  const verb = "arky:verb/control@v1";
  return signArtifact(
    {
      "@type": "ARKY:ExecutionReceipt@v1",
      request_id: input.requestId,
      commitment_cid: input.commitmentCid,
      decision_cid: input.decisionCid,
      verb,
      rail: input.rail,
      tool: input.tool,
      args_hash: argsHash(input.args),
      idempotency_key: deriveIdempotencyKey({
        commitment_cid: input.commitmentCid,
        verb,
        rail: input.rail,
        args: input.args,
      }),
      status: input.status,
      locator: `mcp:${input.tool}#${input.requestId}`,
      ...(input.error ? { error: input.error } : {}),
      identity: { id: keys.did },
      time: { ts: input.ts },
    },
    keys,
  );
}

export interface SessionMeta {
  did: string;
  server: string;
  started: string;
  policySource: string;
  commitmentCids: string[];
}

/**
 * Writes a session's artifacts to an audit bundle directory:
 *
 *   <root>/session.json
 *   <root>/commitments/c<i>-<cid>.json
 *   <root>/calls/<seq>-tim-<n>.json
 *   <root>/calls/<seq>-decision.json
 *   <root>/calls/<seq>-xr.json
 */
export class BundleWriter {
  private seq = 0;
  constructor(
    readonly root: string,
    meta: SessionMeta,
    keys: KeyPair,
  ) {
    mkdirSync(join(root, "commitments"), { recursive: true });
    mkdirSync(join(root, "calls"), { recursive: true });
    const session = signArtifact(
      {
        "@type": "ARKY:McpSession@v1",
        identity: { id: meta.did },
        server: meta.server,
        time: { ts: meta.started },
        policy_source: meta.policySource,
        commitments: meta.commitmentCids,
      },
      keys,
    );
    this.write("session.json", session);
    chmodSync(this.root, 0o700);
  }

  writeCommitment(index: number, artifact: Record<string, unknown>): void {
    this.write(join("commitments", `c${index}-${artifact.cid}.json`), artifact);
  }

  nextSeq(): string {
    return String(this.seq++).padStart(5, "0");
  }

  writeCall(seq: string, kind: string, artifact: Record<string, unknown>): void {
    this.write(join("calls", `${seq}-${kind}.json`), artifact);
  }

  private write(rel: string, artifact: Record<string, unknown>): void {
    writeFileSync(join(this.root, rel), JSON.stringify(artifact, null, 2) + "\n");
  }
}
