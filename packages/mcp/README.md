# @arky/mcp

Policy-gated audit proxy for MCP servers. Wrap any stdio MCP server so every
tool call your agent makes becomes a signed, replayable Arky chain:

```
evidence (TIM)  ->  decision (Kernel)  ->  execution receipt (XR)
```

Ask why your agent called a tool — get a signed answer you can verify offline.

- **Records** every `tools/call` as signed, content-addressed evidence (the
  tool name, each primitive argument, and the full raw arguments).
- **Gates** the call through the reference ARKY-KERNEL-v1: your policy compiles
  to real signed Commitments; only an `APPROVED` decision reaches the server.
  No matching rule, a failed assertion, or a missing argument all deny —
  fail closed.
- **Receipts** the outcome: what the server actually returned, linked by cid to
  the decision and evidence.
- **Replays** offline: `arky-mcp verify` re-verifies every signature and cid
  AND re-runs the Kernel over the recorded evidence — a tampered amount, a
  forged verdict, or a receipt on a denied call is mechanically detected.

Runs under [Bun](https://bun.sh). Not yet published to npm; use it from this
repository.

## Quickstart

1. Write a policy (see `./examples/policy.json`):

```json
{
  "version": 1,
  "rules": [
    { "tool": "read_file" },
    { "tool": "pay", "where": { "amount": "amount <= 50" } }
  ]
}
```

2. Wrap your MCP server. Wherever your agent config launches the server,
   launch the proxy instead and pass the real command after `--`:

```jsonc
// e.g. an MCP client config
{
  "mcpServers": {
    "payments": {
      "command": "bun",
      "args": [
        "/path/to/arky.foundation/packages/mcp/src/cli.ts",
        "run", "--policy", "/path/to/policy.json", "--",
        "node", "/path/to/real-payments-server.js"
      ]
    }
  }
}
```

The proxy logs its did:key identity and the audit bundle path to stderr.
Calls the policy denies return an `isError` tool result to the agent and never
reach the server.

3. Verify the session afterwards — offline, no server needed:

```sh
bun packages/mcp/src/cli.ts verify .arky-audit/<session>
# VALID — 3 call(s), 2 commitment(s)
```

Try corrupting any artifact in the bundle first; verification names exactly
what broke.

## Policy semantics

- `rules[].tool` — exact MCP tool name, or `"*"` to match anything not matched
  by an earlier rule. **No matching rule means deny.**
- `rules[].where` — ordered map of `symbol -> assertion` in the
  ARKY-KERNEL-v1 §4 grammar (`<`, `<=`, `>`, `>=`, `==`, `!=`, `in [..]`,
  `&&`, `||`, `!`; tri-valued). Each key names a top-level tool argument;
  argument names are normalized to grammar symbols (lowercased, non
  `[a-z0-9_]` chars become `_`). Later keys may reference symbols bound by
  earlier keys.
- An argument that is missing, non-primitive (object/array), or whose name
  collides with another after normalization leaves its symbol unbound: the
  assertion is INDETERMINATE and the call is denied.
- Each rule compiles at startup into a signed Commitment artifact; decisions
  are produced by the unmodified reference Kernel (`@arky/core`), so the audit
  chain uses protocol semantics end to end, not bespoke middleware logic.

## Audit bundle layout

```
.arky-audit/<session>/
  session.json            signed session record (identity, server, commitments)
  commitments/c0-<cid>.json  one signed Commitment per policy rule
  calls/00000-tim-0.json  tool-name TIM (carries raw arguments as provenance)
  calls/00000-tim-1.json  one TIM per primitive argument
  calls/00000-decision.json  signed Kernel verdict citing evidence cids
  calls/00000-xr.json     signed execution receipt (approved calls only)
```

## What this does not do

- It cannot see side effects the server performs beyond its JSON-RPC
  responses, and it does not inspect streamed/HTTP MCP transports (stdio
  only for now).
- It does not hide arguments from the bundle: keep secrets out of tool
  arguments, or point `--out` at storage with appropriate controls. Bundles
  are plain JSON — treat them like logs with signatures, because that is what
  they are.
- The policy binds arguments by name. A server that interprets an argument
  the policy did not constrain is outside the gate — constrain what matters.

## CLI

```
arky-mcp run --policy FILE [--out DIR] [--key FILE] [--name LABEL] -- CMD [ARGS...]
arky-mcp verify BUNDLE_DIR
```

- `--key` — 32-byte hex Ed25519 seed file (default
  `~/.config/arky/mcp.key`, auto-generated 0600 on first run).
- `--out` — bundle directory (default `.arky-audit/<timestamp>`).
- `--name` — label used as the TIM method source and XR rail
  (default: the server command's basename).
