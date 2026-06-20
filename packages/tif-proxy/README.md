# tif-proxy

A **local MCP proxy** that sits in front of any MCP server you already use and
re-encodes verbose tool results into [TIF](../../src/tif/README.md) — a compact,
lossless format — so your LLM reads **~50% fewer tokens** with no change to how
tools are called.

```
MCP client (Claude Desktop / Cursor / Claude Code)
        │  stdio (JSON-RPC)
        ▼
   ┌───────────┐   tool results re-encoded as TIF (output tokens ↓)
   │ tif-proxy │   requests passed through untouched (tool inputs unchanged)
   └───────────┘
        │  stdio
        ▼
   your real MCP server (github, postgres, filesystem, …)
```

## Why

MCP tool results are usually JSON arrays of records — every key repeated on
every row, every repeated string re-tokenized. That JSON is the single biggest
token sink in an agent loop. `tif-proxy` transforms just those results into TIF
(schema-once + positional rows + dictionary compression) and injects a one-time
reading guide into the server's `initialize` instructions so the model knows how
to read them. Measured against compact JSON with the real OpenAI and Claude
tokenizers, TIF is ~50–55% smaller.

## Install & configure

No install needed with `npx`. Point your MCP client at `tif-proxy` and put the
**real** server command after `--`.

Claude Desktop / Claude Code (`mcpServers` config):

```jsonc
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "tif-proxy", "--", "npx", "-y", "@modelcontextprotocol/server-github"],
    },
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "tif-proxy",
        "--",
        "npx",
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://…",
      ],
    },
  },
}
```

That's it — wrap any stdio MCP server the same way.

## Options

```
tif-proxy [--min-rows N] -- <mcp-server-command> [args...]
```

- `--min-rows N` — only encode arrays with at least N records (default `2`).

## Guarantees

- **Lossless.** TIF round-trips back to the exact records (see the codec's
  test suite). The proxy only rewrites results it can encode _and_ that come out
  smaller; everything else passes through byte-for-byte.
- **Transparent.** Requests (tool inputs), errors, notifications, and non-record
  results are never modified. If a message can't be parsed or transformed, it is
  forwarded unchanged — the proxy can't break the protocol.
- **No network, no state.** Pure stream transform over stdio.

## How it works

1. Spawns your upstream server and pipes stdio both ways.
2. On the `initialize` response, appends the TIF reading guide to `instructions`.
3. On tool results, JSON-parses each text block; if it's an array of records,
   replaces it with a `[TIF v0.1]` block.

## Limits

- Optimized for arrays of flat records (the common API/MCP shape). Nested
  objects are preserved losslessly but not extra-compressed.
- Compresses **outputs** only. Tool inputs stay normal JSON by design.
