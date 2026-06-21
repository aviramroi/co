# tif-proxy

A **local MCP proxy** that sits in front of any MCP server you already use and
re-encodes data into [TIF](../../src/tif/README.md) — a compact, lossless format
— in **both directions**, so your LLM spends ~50% fewer tokens with no change to
how tools behave.

```
MCP client (Claude Desktop / Cursor / Claude Code)
        │  stdio (JSON-RPC)
        ▼
   ┌───────────┐  results  → re-encoded as TIF      (output tokens ↓)
   │ tif-proxy │  TIF args → decoded back to JSON    (input tokens ↓)
   └───────────┘
        │  stdio (always standard JSON to the server)
        ▼
   your real MCP server (github, postgres, filesystem, …)
```

## Why

MCP tool **results** are usually JSON arrays of records — every key repeated on
every row, every repeated string re-tokenized. That is the biggest token sink in
an agent loop, so the proxy transforms those results into TIF (schema-once +
positional rows + dictionary compression).

**Inputs** can be just as wasteful — a bulk create/update sends a big array of
near-identical records. So the proxy works the other way too: the model may send
an array argument as a TIF string, and the proxy **decodes it back to the exact
JSON** the server expects before forwarding. The server never sees anything but
standard JSON.

A one-time reading/writing guide is injected into the server's `initialize`
instructions so the model knows it can both read and send TIF. Measured against
compact JSON with the real OpenAI and Claude tokenizers, TIF is ~50–55% smaller.

## Install & configure

`tif-proxy` is a single self-contained binary (the TIF codec is bundled in — no
runtime dependencies). You don't run it directly; you point your MCP client at
it and put the **real** server command after `--`.

**Option A — published package (recommended).** Once it's on npm, `npx` fetches
and runs it with no install:

```jsonc
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "tif-proxy", "--", "npx", "-y", "@modelcontextprotocol/server-github"],
    },
  },
}
```

Or install once and reference the `tif-proxy` command directly:

```bash
npm install -g tif-proxy
```

```jsonc
{
  "mcpServers": {
    "github": {
      "command": "tif-proxy",
      "args": ["--", "npx", "-y", "@modelcontextprotocol/server-github"],
    },
  },
}
```

**Option B — from this repo (works today, before publishing).** Build the
bundled binary once, then point the client at its absolute path:

```bash
cd packages/tif-proxy && pnpm build      # produces bin/tif-proxy.mjs
```

```jsonc
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": [
        "/abs/path/to/packages/tif-proxy/bin/tif-proxy.mjs",
        "--",
        "npx",
        "-y",
        "@modelcontextprotocol/server-github",
      ],
    },
  },
}
```

Wrap any stdio MCP server the same way (postgres, filesystem, your own, …).
Restart your MCP client after editing the config.

## Options

```
tif-proxy [--min-rows N] [--no-encode-outputs] [--no-decode-inputs] -- <mcp-server-command> [args...]
```

- `--min-rows N` — only encode result arrays with at least N records (default `2`).
- `--no-encode-outputs` — leave tool results as-is (input decoding still on).
- `--no-decode-inputs` — never touch tool arguments (output encoding still on).

## Guarantees

- **Lossless.** TIF round-trips back to the exact records (see the codec's test
  suite). Outputs are only rewritten when TIF comes out smaller; inputs are only
  decoded when the model actually sends a `[TIF v0.1]` string.
- **Servers always get standard JSON.** Input decoding happens in the proxy, so
  the upstream server's schema/contract is unchanged.
- **Transparent.** Errors, notifications, normal-JSON arguments, and non-record
  results pass through byte-for-byte. If a message can't be parsed or
  transformed, it is forwarded unchanged — the proxy can't break the protocol.
- **No network, no state.** Pure stream transform over stdio.

## How it works

1. Spawns your upstream server and pipes stdio both ways.
2. On the `initialize` response, appends the TIF read/write guide to `instructions`.
3. On tool **results**, JSON-parses each text block; arrays of records become a
   `[TIF v0.1]` block.
4. On tool **calls**, any argument that is a `[TIF v0.1]` string is decoded back
   to JSON before the request reaches the server.

## Limits

- Optimized for arrays of flat records (the common API/MCP shape). Nested objects
  are preserved losslessly but not extra-compressed.
- Opaque values with no redundancy (signed URLs, random IDs) don't shrink — only
  repeated/structured data does.
