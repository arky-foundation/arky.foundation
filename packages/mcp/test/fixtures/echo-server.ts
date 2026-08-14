#!/usr/bin/env bun
/**
 * Minimal line-delimited JSON-RPC server for e2e tests. Echoes tool calls;
 * answers initialize; ignores everything else.
 */

let buf = "";
process.stdin.on("data", (chunk: Buffer) => {
  buf += chunk.toString("utf8");
  let nl: number;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id === undefined) continue;
    if (msg.method === "initialize") {
      respond(msg.id, {
        protocolVersion: "2025-06-18",
        capabilities: {},
        serverInfo: { name: "echo", version: "0.0.1" },
      });
    } else if (msg.method === "tools/call") {
      respond(msg.id, {
        content: [
          {
            type: "text",
            text: `echo:${msg.params?.name}:${JSON.stringify(msg.params?.arguments ?? {})}`,
          },
        ],
      });
    } else {
      respond(msg.id, {});
    }
  }
});

function respond(id: unknown, result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
