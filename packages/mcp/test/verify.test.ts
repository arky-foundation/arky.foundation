import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { generateKeyPair } from "@arky/core";
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BundleWriter } from "../src/audit.ts";
import { compilePolicy, type PolicyFile } from "../src/policy.ts";
import { ArkyMcpEngine } from "../src/proxy.ts";
import { verifyBundle } from "../src/verify.ts";

const keys = generateKeyPair();
const policy: PolicyFile = {
  version: 1,
  rules: [{ tool: "pay", where: { amount: "amount <= 50" } }],
};

let root: string;

/** Produce a bundle with one approved+executed call and one denied call. */
function makeBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "arky-mcp-"));
  const compiled = compilePolicy(policy, keys);
  const writer = new BundleWriter(
    dir,
    {
      did: keys.did,
      server: "test-server",
      started: "2026-08-14T12:00:00.000Z",
      policySource: "/dev/null",
      commitmentCids: compiled.map((c) => c.cid),
    },
    keys,
  );
  compiled.forEach((c, i) => writer.writeCommitment(i, c.artifact));
  const engine = new ArkyMcpEngine({
    policy,
    compiled,
    keys,
    serverName: "test-server",
    writer,
    now: () => "2026-08-14T12:00:00.000Z",
  });
  engine.handleClientMessage(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "pay", arguments: { amount: 40, memo: "coffee beans" } },
    }),
  );
  engine.handleServerMessage(
    JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }),
  );
  engine.handleClientMessage(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "pay", arguments: { amount: 999 } },
    }),
  );
  return dir;
}

const callFile = (pattern: string): string => {
  const f = readdirSync(join(root, "calls")).find((f) => f.includes(pattern));
  if (!f) throw new Error(`no call file matching ${pattern}`);
  return join(root, "calls", f);
};

const editJson = (path: string, mutate: (o: any) => void): void => {
  const o = JSON.parse(readFileSync(path, "utf8"));
  mutate(o);
  writeFileSync(path, JSON.stringify(o, null, 2) + "\n");
};

beforeEach(() => {
  root = makeBundle();
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("verifyBundle", () => {
  test("a freshly written bundle verifies clean", () => {
    const report = verifyBundle(root);
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.calls).toBe(2);
    expect(report.commitments).toBe(1);
    // the denied call must not have an execution receipt
    expect(readdirSync(join(root, "calls")).filter((f) => f.includes("-xr"))).toHaveLength(1);
  });

  test("tampering with evidence is detected (TIM sig + replay)", () => {
    editJson(callFile("00000-tim-1"), (tim) => {
      tim.measurement.value = 9999; // was 40 — forge the amount
    });
    const report = verifyBundle(root);
    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toContain("cid_mismatch");
  });

  test("tampering with the decision is detected", () => {
    editJson(callFile("00001-decision"), (d) => {
      d.status = "APPROVED"; // was REJECTED — forge the verdict
    });
    const report = verifyBundle(root);
    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toContain("cid mismatch");
  });

  test("re-signing the decision with a different key still fails replay", () => {
    // Even a structurally valid but wrong-status decision cannot survive the
    // deterministic Kernel replay.
    editJson(callFile("00001-decision"), (d) => {
      d.status = "APPROVED";
      d.authorized = [{ name: "arky:verb/control@v1", args: { action: "mcp.tool_call:pay" } }];
    });
    const report = verifyBundle(root);
    expect(report.errors.join(" ")).toContain("does not replay");
  });

  test("tampering with the execution receipt is detected", () => {
    editJson(callFile("00000-xr"), (xr) => {
      xr.status = "failed";
    });
    const report = verifyBundle(root);
    expect(report.valid).toBe(false);
  });

  test("removing evidence is detected via decision citations", () => {
    unlinkSync(callFile("00000-tim-2"));
    const report = verifyBundle(root);
    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toContain("cites");
  });

  test("an XR on a denied call is rejected", () => {
    const denied = readFileSync(callFile("00000-xr"), "utf8");
    writeFileSync(join(root, "calls", "00001-xr.json"), denied);
    const report = verifyBundle(root);
    expect(report.errors.join(" ")).toContain("non-approved");
  });
});
