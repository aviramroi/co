# TIF — Token Interchange Format

A token-efficient, **lossless** serialization for arrays of records. The idea:
an LLM reads/writes the compact TIF surface, while a proxy translates to/from
whatever the backend actually expects (JSON over MCP, a `sf` CLI invocation, a
REST body). See `docs/salesforce-mcp-token-abstraction.md` for the proxy that
consumes it.

## Why

JSON repeats every key on every row and re-tokenizes repeated string values.
For the row-heavy payloads LLMs get from APIs/MCP servers, that is pure waste.
TIF pays for the schema **once**, stores values **positionally**, and
**dictionary-compresses** repeated strings.

Measured with real tokenizers (`js-tiktoken`, `@anthropic-ai/tokenizer`) on
50-row API-like datasets — see `src/tif/benchmark.test.ts`:

| Format         |    OpenAI cl100k |           Claude |                    vs JSON |
| -------------- | ---------------: | ---------------: | -------------------------: |
| JSON (compact) |         baseline |         baseline |                          — |
| CSV            |     ~43% smaller |     ~43% smaller | good but lossy for nesting |
| YAML / XML     |         _larger_ |         _larger_ |            worse than JSON |
| **TIF**        | **~52% smaller** | **~52% smaller** |         best, and lossless |

## Grammar (v0.1)

A document is newline-separated lines. The first character selects the line type:

- `$<id>=<value>` — **dictionary** entry. `<value>` has `\` and newlines escaped.
- `@<name>=<col>,<col>,…` — **schema header**, starts a table named `<name>`.
  Each column is `name[:type]`; a `[]` after the name marks a **list** column
  (`roles[]:s`). Types: `s` string, `i` int, `n` number, `b` bool,
  `j` JSON (nested fallback), `x` mixed scalars.
- `#…` — comment (ignored).
- anything else — a **data row** for the current table: values joined by `|`,
  positional to the header columns.

### Value rules

- Empty field → `null`.
- `\e` → empty string; `\a` → empty array.
- `$<n>` → dictionary reference.
- List elements are joined by `,`.
- Separators inside values are backslash-escaped (`\|`, `\,`, `\n`, `\\`).
- In a mixed (`x`) column, a string that looks like a number/bool is prefixed
  with `'` to force string-ness on decode.

### Example

JSON:

```json
[
  { "user_id": 1, "name": "John", "company": "Acme Inc", "role": "admin" },
  { "user_id": 2, "name": "Jane", "company": "Acme Inc", "role": "admin" }
]
```

TIF:

```
$0=Acme Inc
$1=admin
@r=user_id:i,name:s,company:s,role:s
1|John|$0|$1
2|Jane|$0|$1
```

With a list column:

```
@r=id:i,name:s,roles[]:s
1|John|admin,owner
2|Jane|viewer
```

## API

```ts
import { encode, decode } from "openclaw/src/tif/index.js";

const text = encode(records); // JSON array -> TIF text
const back = decode(text); // TIF text -> JSON array (lossless)
```

`encode(records, opts)` options: `name` (table label, default `r`),
`dictionary` (default `true`), `dictMinCount` (default `2`), `dictMinLen`
(default `3`).

## Scope & limits

- Optimized for **arrays of flat records** (the high-value API/MCP case).
  Nested objects/arrays are stored losslessly as a JSON-encoded `j` cell — they
  just don't get extra compression.
- Round-trip fidelity is covered by `src/tif/tif.test.ts`.
- Exact Gemini token counts need the `countTokens` API; the benchmark labels its
  Gemini-style estimate as approximate.
