import { afterAll, describe, expect, test } from "bun:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBundle } from "../src/verify.ts";

const dir = mkdtempSync(join(tmpdir(), "arky-mcp-e2e-"));
const policyPath = join(dir, "policy.json");
const bundleDir = join(dir, "bundle");
const keyPath = join(dir, "mcp.key");
writeFileSync(
  policyPath,
  JSON.stringify({
    version: 1,
    rules: [{ tool: "echo_tool", where: { amount: "amount <= 50" } }],
  }),
);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function startProxy(): ChildProcessWithoutNullStreams {
  return spawn(
    "bun",
    [
      join(import.meta.dir, "..", "src", "cli.ts"),
      "run",
      "--policy",
      policyPath,
      "--out",
      bundleDir,
      "--key",
      keyPath,
      "--name",
      "echo-e2e",
      "--",
      "bun",
      join(import.meta.dir, "fixtures", "echo-server.ts"),
    ],
    { stdio: "pipe" },
  );
}

/** Send lines, collect stdout lines until `count` responses arrive. */
function drive(
  proxy: ChildProcessWithoutNullStreams,
  lines: string[],
  count: number,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const out: string[] = [];
    let buf = "";
    const timer = setTimeout(
      () => reject(new Error(`timeout; got ${out.length}/${count}: ${out}`)),
      10000,
    );
    proxy.stdout.on("data", (c: Buffer) => {
      buf += c.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) out.push(line);
        if (out.length === count) {
          clearTimeout(timer);
          resolve(out);
        }
      }
    });
    for (const l of lines) proxy.stdin.write(l + "\n");
  });
}

describe("arky-mcp end to end", () => {
  test("proxies an MCP session, gates calls, and writes a verifiable bundle", async () => {
    const proxy = startProxy();
    try {
      const responses = await drive(
        proxy,
        [
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
          JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "echo_tool", arguments: { amount: 30 } },
          }),
          JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "echo_tool", arguments: { amount: 3000 } },
          }),
          JSON.stringify({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: { name: "rm_rf", arguments: {} },
          }),
        ],
        4,
      );
      const byId = new Map(responses.map((r) => [JSON.parse(r).id, JSON.parse(r)]));
      expect(byId.get(1).result.serverInfo.name).toBe("echo");
      expect(byId.get(2).result.content[0].text).toContain("echo:echo_tool");
      expect(byId.get(3).result.isError).toBe(true); // over limit — never reached the server
      expect(byId.get(4).result.isError).toBe(true); // unlisted tool
    } finally {
      proxy.stdin.end();
      proxy.kill();
    }

    const report = verifyBundle(bundleDir);
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.calls).toBe(3);
  }, 15000);
});
