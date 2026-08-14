import { describe, expect, test } from "bun:test";
import {
  generateKeyPair,
  verifyDetached,
  canonicalize,
  cidFromCanonical,
  resolveDidKey,
} from "@arky/core";
import {
  compilePolicy,
  matchRule,
  symbolize,
  validatePolicy,
  type PolicyFile,
} from "../src/policy.ts";

const keys = generateKeyPair();

const policy: PolicyFile = {
  version: 1,
  rules: [
    { tool: "get_weather" },
    { tool: "pay", where: { amount: "amount <= 50", currency: 'currency == "USD"' } },
  ],
};

describe("validatePolicy", () => {
  test("accepts a well-formed policy", () => {
    expect(validatePolicy(policy)).toEqual(policy);
  });
  test("rejects bad shapes", () => {
    expect(() => validatePolicy({})).toThrow("version");
    expect(() => validatePolicy({ version: 1, rules: [] })).toThrow("non-empty");
    expect(() => validatePolicy({ version: 1, rules: [{ tool: "" }] })).toThrow("non-empty string");
    expect(() => validatePolicy({ version: 1, rules: [{ tool: 'a"b' }] })).toThrow('"');
    expect(() => validatePolicy({ version: 1, rules: [{ tool: "x" }, { tool: "x" }] })).toThrow(
      "duplicate",
    );
    expect(() =>
      validatePolicy({ version: 1, rules: [{ tool: "x", where: { Amount: "amount <= 1" } }] }),
    ).toThrow("not a valid symbol");
    expect(() =>
      validatePolicy({ version: 1, rules: [{ tool: "x", where: { tool: 'tool == "x"' } }] }),
    ).toThrow("reserved");
  });
});

describe("matchRule", () => {
  test("exact match wins; * catches the rest; none means undefined", () => {
    expect(matchRule(policy, "pay")?.tool).toBe("pay");
    expect(matchRule(policy, "delete_all")).toBeUndefined();
    const withStar: PolicyFile = { version: 1, rules: [{ tool: "pay" }, { tool: "*" }] };
    expect(matchRule(withStar, "anything")?.tool).toBe("*");
    expect(matchRule(withStar, "pay")?.tool).toBe("pay");
  });
});

describe("symbolize", () => {
  test("normalizes argument names to grammar symbols", () => {
    expect(symbolize("amount")).toBe("amount");
    expect(symbolize("Max-Price")).toBe("max_price");
    expect(symbolize("2fast")).toBe("_2fast");
  });
});

describe("compilePolicy", () => {
  test("produces signed, content-addressed commitments with per-symbol specs", () => {
    const compiled = compilePolicy(policy, keys);
    expect(compiled).toHaveLength(2);

    const pay = compiled[1];
    expect(pay.commitment.measure.map((m) => m.name)).toEqual(["tool", "amount", "currency"]);
    expect(pay.commitment.measure[0].assert).toBe('tool == "pay"');
    expect(pay.commitment.measure[1].require).toEqual({ code: ["amount"] });
    expect(pay.commitment.consequence[0].then[0].name).toBe("arky:verb/control@v1");

    // Artifact integrity: cid recomputes, signature verifies against actor.
    const { cid, sig, ...body } = pay.artifact;
    const canonical = canonicalize(body);
    expect(cidFromCanonical(canonical)).toBe(cid);
    const key = resolveDidKey({ identity: { id: keys.did } })!;
    expect(verifyDetached(sig as string, new TextEncoder().encode(canonical), key)).toBe(true);
  });

  test("wildcard rule asserts a non-empty tool", () => {
    const compiled = compilePolicy({ version: 1, rules: [{ tool: "*" }] }, keys);
    expect(compiled[0].commitment.measure[0].assert).toBe('tool != ""');
  });
});
