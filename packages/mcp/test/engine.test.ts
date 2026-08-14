import { describe, expect, test } from "bun:test";
import { generateKeyPair } from "@arky/core";
import { compilePolicy, type PolicyFile } from "../src/policy.ts";
import { ArkyMcpEngine } from "../src/proxy.ts";

const keys = generateKeyPair();
const policy: PolicyFile = {
  version: 1,
  rules: [{ tool: "get_weather" }, { tool: "pay", where: { amount: "amount <= 50" } }],
};

function engine() {
  return new ArkyMcpEngine({
    policy,
    compiled: compilePolicy(policy, keys),
    keys,
    serverName: "test-server",
    now: () => "2026-08-14T12:00:00.000Z",
  });
}

const call = (id: number, name: string, args: Record<string, unknown> = {}) =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

describe("ArkyMcpEngine gating", () => {
  test("allowed tool is forwarded unchanged", () => {
    const raw = call(1, "get_weather", { city: "Lisbon" });
    expect(engine().handleClientMessage(raw)).toEqual({ forward: raw });
  });

  test("unlisted tool is denied with an isError tool result, not forwarded", () => {
    const a = engine().handleClientMessage(call(2, "delete_everything"));
    expect(a.forward).toBeUndefined();
    const reply = JSON.parse(a.reply!);
    expect(reply.id).toBe(2);
    expect(reply.result.isError).toBe(true);
    expect(reply.result.content[0].text).toContain("REJECTED");
  });

  test("where clause approves under the limit and rejects over it", () => {
    const ok = engine().handleClientMessage(call(3, "pay", { amount: 40 }));
    expect(ok.forward).toBeDefined();
    const over = engine().handleClientMessage(call(4, "pay", { amount: 60 }));
    expect(over.forward).toBeUndefined();
    expect(JSON.parse(over.reply!).result.isError).toBe(true);
  });

  test("missing constrained argument denies (INDETERMINATE, fail closed)", () => {
    const a = engine().handleClientMessage(call(5, "pay", {}));
    expect(a.forward).toBeUndefined();
    expect(JSON.parse(a.reply!).result.content[0].text).toContain("INDETERMINATE");
  });

  test("non-primitive constrained argument denies", () => {
    const a = engine().handleClientMessage(call(6, "pay", { amount: { value: 1 } }));
    expect(a.forward).toBeUndefined();
  });

  test("colliding argument names leave the symbol unbound and deny", () => {
    const a = engine().handleClientMessage(call(7, "pay", { amount: 5, AMOUNT: 9999 }));
    expect(a.forward).toBeUndefined();
  });

  test("an argument named tool cannot shadow the tool symbol", () => {
    const a = engine().handleClientMessage(call(8, "delete_everything", { tool: "get_weather" }));
    expect(a.forward).toBeUndefined();
  });

  test("non-tool messages and non-JSON lines pass through", () => {
    const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(engine().handleClientMessage(init)).toEqual({ forward: init });
    expect(engine().handleClientMessage("not json")).toEqual({ forward: "not json" });
  });

  test("batches containing tools/call are denied wholesale", () => {
    const batch = JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_weather" } },
      { jsonrpc: "2.0", id: 2, method: "ping" },
    ]);
    const a = engine().handleClientMessage(batch);
    expect(a.forward).toBeUndefined();
    const replies = JSON.parse(a.reply!);
    expect(replies[0].result.isError).toBe(true);
  });

  test("batches without tool calls pass through", () => {
    const batch = JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    expect(engine().handleClientMessage(batch)).toEqual({ forward: batch });
  });

  test("server responses pass through", () => {
    const e = engine();
    e.handleClientMessage(call(9, "get_weather"));
    const resp = JSON.stringify({ jsonrpc: "2.0", id: 9, result: { content: [] } });
    expect(e.handleServerMessage(resp)).toEqual({ forward: resp });
  });
});
