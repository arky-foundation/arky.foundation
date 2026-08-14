/**
 * Offline verification of an @arky/mcp audit bundle.
 *
 * Everything is checked from the artifacts alone — no server, no network:
 *   1. session/commitment/decision/XR artifacts: cid recomputed, Ed25519
 *      detached JWS verified against the artifact's own did:key.
 *   2. every evidence TIM verified with @arky/core's verifyTim.
 *   3. determinism replay: each Decision is recomputed by re-running the
 *      reference Kernel over the bundle's Commitment + TIMs and must match
 *      byte-for-byte (status, assertions, authorized).
 *   4. chain links: decision.evidence == TIM cids, xr.decision_cid,
 *      xr.commitment_cid, and xr.args_hash over the recorded raw arguments.
 */

import {
  argsHash,
  canonicalize,
  cidFromCanonical,
  evaluateKernel,
  parseStrict,
  resolveDidKey,
  verifyDetached,
  verifyTim,
  type Commitment,
  type Tim,
} from "@arky/core";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface BundleReport {
  valid: boolean;
  errors: string[];
  calls: number;
  commitments: number;
}

/** Recompute an artifact's cid and verify its signature against `did`. */
function verifyArtifact(
  artifact: Record<string, unknown>,
  did: string,
  label: string,
  errors: string[],
): boolean {
  const { cid, sig, ...body } = artifact;
  const canonical = canonicalize(body);
  let ok = true;
  if (cidFromCanonical(canonical) !== cid) {
    errors.push(`${label}: cid mismatch`);
    ok = false;
  }
  const key = resolveDidKey({ identity: { id: did } });
  if (!key || !verifyDetached(sig as string, new TextEncoder().encode(canonical), key)) {
    errors.push(`${label}: signature invalid`);
    ok = false;
  }
  return ok;
}

function load(path: string): Record<string, unknown> {
  return parseStrict(readFileSync(path, "utf8")) as Record<string, unknown>;
}

export function verifyBundle(root: string): BundleReport {
  const errors: string[] = [];

  let session: Record<string, unknown>;
  try {
    session = load(join(root, "session.json"));
  } catch (e) {
    return {
      valid: false,
      errors: [`session.json: ${(e as Error).message}`],
      calls: 0,
      commitments: 0,
    };
  }
  const did = (session.identity as any)?.id as string;
  if (typeof did !== "string") {
    return {
      valid: false,
      errors: ["session.json: missing identity.id"],
      calls: 0,
      commitments: 0,
    };
  }
  verifyArtifact(session, did, "session", errors);

  // Commitments, indexed by cid for decision replay.
  const commitments = new Map<string, Record<string, unknown>>();
  for (const f of readdirSync(join(root, "commitments")).sort()) {
    const artifact = load(join(root, "commitments", f));
    verifyArtifact(artifact, (artifact.actor as string) ?? "", `commitment ${f}`, errors);
    commitments.set(artifact.cid as string, artifact);
  }
  const declared = (session.commitments as string[]) ?? [];
  for (const c of declared) {
    if (!commitments.has(c)) errors.push(`session: declared commitment ${c} missing from bundle`);
  }

  // Group call files by sequence prefix.
  const bySeq = new Map<string, string[]>();
  for (const f of readdirSync(join(root, "calls")).sort()) {
    const seq = f.split("-")[0];
    bySeq.set(seq, [...(bySeq.get(seq) ?? []), f]);
  }

  for (const [seq, files] of bySeq) {
    const label = `call ${seq}`;
    const timFiles = files.filter((f) => f.includes("-tim-"));
    const decisionFile = files.find((f) => f.endsWith("-decision.json"));
    const xrFile = files.find((f) => f.endsWith("-xr.json"));

    const tims: Tim[] = [];
    for (const f of timFiles) {
      const tim = load(join(root, "calls", f));
      const res = verifyTim(tim);
      if (!res.valid) errors.push(`${label} ${f}: ${res.errors.join(", ")}`);
      tims.push(tim as unknown as Tim);
    }

    if (!decisionFile) {
      errors.push(`${label}: missing decision artifact`);
      continue;
    }
    const decision = load(join(root, "calls", decisionFile));
    verifyArtifact(decision, (decision.identity as any)?.id ?? "", `${label} decision`, errors);

    // Chain: the decision must cite exactly the bundle's evidence TIMs.
    const cited = new Set((decision.evidence as string[]) ?? []);
    for (const t of tims) {
      if (!cited.has(t.cid)) errors.push(`${label}: TIM ${t.cid} not cited by decision`);
    }
    if (cited.size !== tims.length) {
      errors.push(`${label}: decision cites ${cited.size} TIMs, bundle has ${tims.length}`);
    }

    // Determinism replay: re-run the Kernel and require an identical verdict.
    const commitmentCid = decision.commitment_cid as string;
    if (commitmentCid) {
      const commitment = commitments.get(commitmentCid);
      if (!commitment) {
        errors.push(`${label}: commitment ${commitmentCid} not in bundle`);
      } else {
        const ts = (decision.time as any)?.ts as string;
        const replay = evaluateKernel(commitment as unknown as Commitment, tims, { time: ts });
        const same =
          replay.status === decision.status &&
          canonicalize(replay.assertions) === canonicalize(decision.assertions) &&
          canonicalize(replay.authorized) === canonicalize(decision.authorized);
        if (!same)
          errors.push(
            `${label}: decision does not replay (${replay.status} vs ${decision.status})`,
          );
      }
    } else if (decision.status === "APPROVED") {
      errors.push(`${label}: APPROVED decision without a commitment`);
    }

    // XR: only approved calls execute; links and args hash must hold.
    if (decision.status !== "APPROVED" && xrFile) {
      errors.push(`${label}: execution receipt present for non-approved decision`);
    }
    if (xrFile) {
      const xr = load(join(root, "calls", xrFile));
      verifyArtifact(xr, (xr.identity as any)?.id ?? "", `${label} xr`, errors);
      if (xr.decision_cid !== decision.cid) errors.push(`${label}: xr.decision_cid mismatch`);
      if (xr.commitment_cid !== commitmentCid) errors.push(`${label}: xr.commitment_cid mismatch`);
      if (!["success", "failed"].includes(xr.status as string)) {
        errors.push(`${label}: xr.status invalid`);
      }
      const toolTim = tims.find((t) => (t.measurement as any)?.code === "tool");
      const rawArgs = (toolTim?.measurement as any)?.provenance?.arguments;
      if (rawArgs === undefined) {
        errors.push(`${label}: tool TIM missing provenance.arguments`);
      } else if (xr.args_hash !== argsHash(rawArgs)) {
        errors.push(`${label}: xr.args_hash does not match recorded arguments`);
      }
    }
  }

  return { valid: errors.length === 0, errors, calls: bySeq.size, commitments: commitments.size };
}
