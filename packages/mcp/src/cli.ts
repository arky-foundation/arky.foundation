#!/usr/bin/env bun
/**
 * arky-mcp — policy-gated audit proxy for MCP servers.
 *
 *   arky-mcp run --policy policy.json [--out DIR] [--key FILE] [--name LABEL] -- CMD [ARGS...]
 *   arky-mcp verify BUNDLE_DIR
 *
 * `run` spawns the real MCP server and sits on its stdio: every tools/call is
 * recorded as signed evidence (TIM), gated by the reference Kernel against the
 * compiled policy, and — when approved and executed — receipted (XR). All
 * artifacts land in an audit bundle that `verify` replays offline.
 */

import { fromSeed, type KeyPair } from "@arky/core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { BundleWriter } from "./audit.ts";
import { compilePolicy, loadPolicy } from "./policy.ts";
import { ArkyMcpEngine } from "./proxy.ts";
import { verifyBundle } from "./verify.ts";

function fail(msg: string): never {
  process.stderr.write(`arky-mcp: ${msg}\n`);
  process.exit(1);
}

/** Load (or create, mode 0600) a 32-byte hex Ed25519 seed. */
function loadKeys(path: string): KeyPair {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const hex = [...seed].map((b) => b.toString(16).padStart(2, "0")).join("");
    writeFileSync(path, hex + "\n", { mode: 0o600 });
    process.stderr.write(`[arky-mcp] generated new key at ${path}\n`);
  }
  const hex = readFileSync(path, "utf8").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) fail(`key file ${path} is not a 32-byte hex seed`);
  const seed = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  return fromSeed(seed);
}

function runCommand(argv: string[]): void {
  const sep = argv.indexOf("--");
  if (sep === -1 || sep === argv.length - 1) {
    fail(
      "usage: arky-mcp run --policy FILE [--out DIR] [--key FILE] [--name LABEL] -- CMD [ARGS...]",
    );
  }
  const flags = argv.slice(0, sep);
  const cmd = argv.slice(sep + 1);
  const opt = (name: string): string | undefined => {
    const i = flags.indexOf(`--${name}`);
    return i === -1 ? undefined : flags[i + 1];
  };
  const policyPath = opt("policy") ?? fail("--policy FILE is required");
  const keyPath =
    opt("key") ?? process.env.ARKY_MCP_KEY ?? join(homedir(), ".config", "arky", "mcp.key");
  const serverName = opt("name") ?? cmd[0].split("/").pop()!;
  const started = new Date();
  const outRoot = opt("out") ?? join(".arky-audit", started.toISOString().replace(/[:.]/g, "-"));

  const keys = loadKeys(keyPath);
  const policy = loadPolicy(policyPath);
  const compiled = compilePolicy(policy, keys);
  const writer = new BundleWriter(
    resolve(outRoot),
    {
      did: keys.did,
      server: serverName,
      started: started.toISOString(),
      policySource: resolve(policyPath),
      commitmentCids: compiled.map((c) => c.cid),
    },
    keys,
  );
  compiled.forEach((c, i) => writer.writeCommitment(i, c.artifact));
  const engine = new ArkyMcpEngine({ policy, compiled, keys, serverName, writer });

  process.stderr.write(`[arky-mcp] identity ${keys.did}\n`);
  process.stderr.write(`[arky-mcp] audit bundle ${resolve(outRoot)}\n`);

  const child = spawn(cmd[0], cmd.slice(1), { stdio: ["pipe", "pipe", "inherit"] });
  child.on("error", (e) => fail(`failed to start server: ${e.message}`));
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  const lineReader = (onLine: (line: string) => void) => {
    let buf = "";
    return (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (line.length > 0) onLine(line);
      }
    };
  };

  process.stdin.on(
    "data",
    lineReader((line) => {
      const action = engine.handleClientMessage(line);
      if (action.forward !== undefined) child.stdin.write(action.forward + "\n");
      if (action.reply !== undefined) process.stdout.write(action.reply + "\n");
    }),
  );
  process.stdin.on("end", () => child.stdin.end());
  child.stdout.on(
    "data",
    lineReader((line) => {
      process.stdout.write(engine.handleServerMessage(line).forward + "\n");
    }),
  );
}

function verifyCommand(argv: string[]): void {
  const dir = argv[0] ?? fail("usage: arky-mcp verify BUNDLE_DIR");
  const report = verifyBundle(resolve(dir));
  process.stdout.write(
    `${report.valid ? "VALID" : "INVALID"} — ${report.calls} call(s), ${report.commitments} commitment(s)\n`,
  );
  for (const e of report.errors) process.stdout.write(`  [FAIL] ${e}\n`);
  process.exit(report.valid ? 0 : 1);
}

const [, , command, ...rest] = process.argv;
if (command === "run") runCommand(rest);
else if (command === "verify") verifyCommand(rest);
else fail(`unknown command '${command ?? ""}' (expected: run | verify)`);
