# A Token-Reducing Abstraction over the Salesforce MCP

> Goal: keep the full power of the Salesforce DX / Data 360 MCP servers while
> cutting the tokens they consume — both **input** (tool schemas loaded into the
> model's context every turn) and **output** (verbose API responses the model
> has to read). Companion to `docs/top-10-mcp-apis-cli.md`.

---

## 1. Where the tokens actually go

The Salesforce MCP surface is large on purpose: the DX MCP ships **60+ tools**
and Data 360 wraps **~200 API operations**. That power has two recurring costs.

### Input cost — paid on *every* turn
MCP tool definitions (name + description + full JSON Schema of params) are
injected into the model's context before it does anything. Rough budget:

| | Tools | ~Tokens/tool | Static input cost |
|---|------:|-------------:|------------------:|
| DX MCP | ~60 | 200–500 | **12k–30k tokens** |
| Data 360 | ~200 (raw) | 200–500 | **40k–100k tokens** |

That cost recurs on every request in the conversation and competes with the
actual working context. For most agent turns, **tool schemas dwarf the real
conversation.**

### Output cost — paid per call
Salesforce REST/SOQL JSON is verbose. A 2-record query:

```json
{
  "totalSize": 2, "done": true,
  "records": [
    { "attributes": { "type": "Account",
        "url": "/services/data/v60.0/sobjects/Account/0015g00000XyZ12AAB" },
      "Id": "0015g00000XyZ12AAB", "Name": "Acme Corp",
      "Industry": "Manufacturing", "AnnualRevenue": 5000000,
      "BillingCity": null, "OwnerId": "0055g00000AbCdeFAAB" },
    { "attributes": { "type": "Account",
        "url": "/services/data/v60.0/sobjects/Account/0015g00000XyZ34AAB" },
      "Id": "0015g00000XyZ34AAB", "Name": "Globex",
      "Industry": "Technology", "AnnualRevenue": 12000000,
      "BillingCity": null, "OwnerId": "0055g00000AbCdeFAAB" }
  ]
}
```

The pure overhead in that payload:
- **`attributes` block per record** (~25 tokens each) — type + a URL the model never needs.
- **Field names repeated for every row** — `Id`, `Name`, … re-tokenized N times.
- **Null fields echoed** (`BillingCity: null`).
- **18-char IDs** and ISO timestamps, often repeated (same `OwnerId` on every row).
- **`describe` calls** are the worst: full field metadata + every picklist value, easily 5k–20k tokens for one object.

---

## 2. The abstraction: a thin token-optimizing MCP proxy

Put one proxy between the agent and the official Salesforce servers. The agent
talks to the proxy; the proxy talks to the real DX / Data 360 MCP (or directly
to the Salesforce REST/SOQL APIs).

```
  Claude / agent
        │  (small toolset, compact responses)
        ▼
  ┌─────────────────────────────┐
  │  Salesforce Token Proxy     │
  │  • facade tools (input↓)    │
  │  • progressive disclosure   │
  │  • response shaper (output↓)│
  │  • describe cache + handles │
  └─────────────────────────────┘
        │  (full MCP / REST)
        ▼
  Salesforce DX MCP / Data 360 MCP / REST API
```

Five levers, two for input and three for output.

---

## 3. Input-side levers (cut the static tool-schema cost)

### Lever A — Facade tools (200 operations → ~6 tools)
This is the technique Salesforce themselves use for Data 360. Collapse the
sprawl into a handful of verb-shaped tools the model already understands:

| Facade tool | Replaces |
|---|---|
| `soql(query, format?)` | every read/query operation |
| `dml(op, sobject, records)` | create / update / upsert / delete |
| `describe(sobject, detail?)` | all metadata/describe ops |
| `run_flow(name, params)` | flow / process / automation ops |
| `agentforce(action, session?, input?)` | start/resume Agentforce sessions |
| `metadata(op, args)` | deploy / retrieve / list |

~200 schemas → ~6. Claude already knows SOQL and Salesforce object names, so a
single compact cheat-sheet in the `soql` description replaces hundreds of
hand-held tool defs. **Estimated input savings: 85–95%.**

Trade-off: less per-operation guardrailing. Mitigate by validating SOQL/DML in
the proxy and returning crisp, correcting errors (cheaper than 200 schemas).

### Lever B — Progressive disclosure (load schemas lazily)
Don't ship even the facade's full detail up front. Mirror the pattern *this very
harness* uses with its deferred tools:

- `sf_catalog(domain?)` → returns a one-line index of capabilities/objects.
- `sf_schema(name)` → returns a full schema only when the model asks for it.

The model sees names first and pays for a schema only when it commits to using
it. Combine with A: the 6 facade tools stay resident; everything else is
fetch-on-demand.

---

## 4. Output-side levers (cut per-response cost)

A response **shaper** post-processes every payload before it reaches the model.

### Lever C — Strip + slim (safe, lossless-ish, always on)
1. **Drop `attributes`** blocks (type/url) unless explicitly requested.
2. **Drop null/empty fields.**
3. **Unwrap envelope** (`totalSize`/`done`) into a compact `{n, truncated}`.

On the 2-record example above this alone removes ~30% of tokens.

### Lever D — Columnar encoding (big win on multi-row results)
Emit field names **once**, then rows as tuples:

```json
{
  "n": 2,
  "cols": ["Id","Name","Industry","AnnualRevenue","OwnerId"],
  "rows": [
    ["0015g00000XyZ12AAB","Acme Corp","Manufacturing",5000000,"0055g00000AbCdeFAAB"],
    ["0015g00000XyZ34AAB","Globex","Technology",12000000,"0055g00000AbCdeFAAB"]
  ]
}
```

For 2 rows the win is modest; at **50–200 rows the repeated key overhead
dominates and this cuts 40–60%.** For very large sets, offer `format: "tsv"`
(even fewer delimiter/quote tokens). Claude reads columnar/TSV fine.

### Lever E — Describe slimming + caching (kills the worst offender)
- Default `describe` returns only `{name, type, required, refTo}` per field and
  a **picklist value *count***, not the values. `detail: "full"` opts back in.
- **Cache describes** in the proxy keyed by `sobject + org schema version`.
  Return a stable `schemaRef` so a repeat describe in the same session costs
  ~0 tokens ("schema unchanged, see schemaRef sf:Account@v60").

A 12k-token `Account` describe drops to a few hundred tokens.

### Lever F — Budgeted results + handles (bound the worst case)
- Enforce a per-call **token budget**. If a result exceeds it, return a head
  slice + aggregates (`{n: 5000, shown: 50, more: "cursor:abc"}`) instead of
  dumping everything.
- Optionally return an opaque **result handle** the model can reference in a
  follow-up (`refine(handle, "where AnnualRevenue > 1e7")`) so large data is
  filtered server-side without round-tripping through the model's context.

---

## 5. Reference implementation (core shaper)

Standalone TypeScript; drop-in for an MCP proxy server. The two functions below
are the heart — facade routing + response shaping.

```ts
// salesforce-token-proxy/shape.ts
type SfRecord = Record<string, unknown> & { attributes?: unknown };

interface ShapeOpts {
  format?: "objects" | "columns" | "tsv";
  dropNull?: boolean;     // default true
  maxRows?: number;       // budget guard
}

/** Turn a raw Salesforce SOQL response into a compact, model-friendly shape. */
export function shapeQuery(raw: { records: SfRecord[]; totalSize: number; done: boolean },
                           opts: ShapeOpts = {}) {
  const { format = "columns", dropNull = true, maxRows = 200 } = opts;
  const truncated = raw.records.length > maxRows;
  const records = raw.records.slice(0, maxRows).map(stripRecord);

  if (format === "objects") {
    const rows = dropNull ? records.map(dropNulls) : records;
    return { n: raw.totalSize, truncated, rows };
  }

  // columnar: union of keys across the (already null-pruned) rows
  const cols = unionKeys(dropNull ? records.map(dropNulls) : records);
  const rows = records.map((r) => cols.map((c) => r[c] ?? null));
  if (format === "tsv") {
    const tsv = [cols.join("\t"), ...rows.map((r) => r.map(cell).join("\t"))].join("\n");
    return { n: raw.totalSize, truncated, cols, tsv };
  }
  return { n: raw.totalSize, truncated, cols, rows };
}

const SYS = new Set(["attributes"]);
function stripRecord(r: SfRecord): SfRecord {
  const out: SfRecord = {};
  for (const [k, v] of Object.entries(r)) if (!SYS.has(k)) out[k] = v;
  return out;
}
function dropNulls(r: SfRecord): SfRecord {
  const out: SfRecord = {};
  for (const [k, v] of Object.entries(r)) if (v !== null && v !== "") out[k] = v;
  return out;
}
function unionKeys(rows: SfRecord[]): string[] {
  const s = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) s.add(k);
  return [...s];
}
function cell(v: unknown): string { return v == null ? "" : String(v); }
```

```ts
// salesforce-token-proxy/describe.ts
interface FullField { name: string; type: string; nillable: boolean;
  referenceTo?: string[]; picklistValues?: { value: string }[]; /* …many more… */ }

/** Slim a describe to the fields a model needs; cache by schema version. */
export function shapeDescribe(full: { name: string; fields: FullField[] },
                              detail: "slim" | "full" = "slim") {
  if (detail === "full") return full;
  return {
    sobject: full.name,
    schemaRef: `sf:${full.name}`,            // returned instead of re-describing
    fields: full.fields.map((f) => ({
      name: f.name,
      type: f.type,
      required: !f.nillable || undefined,    // omit when false
      refTo: f.referenceTo?.length ? f.referenceTo : undefined,
      picklist: f.picklistValues?.length,    // count, not the values
    })),
  };
}
```

The facade dispatcher then just routes the 6 tools to the underlying MCP/REST
client and runs the shaper on the way back:

```ts
// pseudo: one MCP tool handler
server.tool("soql", soqlSchema, async ({ query, format }) => {
  validateReadOnly(query);                       // cheap guardrail
  const raw = await sf.query(query);             // underlying DX MCP / REST call
  return json(shapeQuery(raw, { format }));      // compact payload to the model
});
```

---

## 6. Expected savings (rough, directional)

| Lever | Cuts | Typical reduction |
|---|---|---|
| A — Facade tools | input (schemas) | **85–95%** of tool-def tokens |
| B — Progressive disclosure | input | removes the long tail entirely until used |
| C — Strip/slim | output | ~25–35% on any record payload |
| D — Columnar/TSV | output | **40–60%** on multi-row results |
| E — Describe slim+cache | output | a 12k describe → a few hundred; repeats ≈ free |
| F — Budget + handles | output | bounds worst case; no accidental 50k dumps |

Net: a typical "query + describe" agent turn that costs **~25–40k tokens**
against the raw MCP can land around **3–6k** through the proxy, with no loss of
capability — only loss of redundancy.

---

## 7. Trade-offs to keep honest

- **Columnar/TSV** is slightly less self-describing than objects; fine for
  Claude, but keep an `objects` escape hatch for tools/humans downstream.
- **ID aliasing** (mapping 18-char IDs to short session handles) saves more but
  adds proxy state and a failure mode if the mapping is lost — opt-in, not default.
- **Facade tools** shift guardrails from per-tool schemas to proxy-side
  validation; invest in clear, corrective error messages.
- **Caching describes** needs an invalidation signal (org schema version / TTL)
  so stale metadata never reaches the model.

---

## 8. How this could land in `co`

This repo already has a **gateway** (`src/gateway/`) that brokers model traffic
and an MCP client path — the natural home for a proxy like this. Minimal shape:

1. A small package `packages/salesforce-token-proxy` exposing an MCP server
   (the 6 facade tools) that wraps a configured upstream (DX MCP or REST creds).
2. The shaper (`shape.ts` / `describe.ts` above) as pure, unit-testable funcs.
3. Register it in the gateway's MCP config so any `co` agent gets the slim
   surface instead of the raw 60–200 tools.

If you want, I can scaffold `packages/salesforce-token-proxy` with the facade
server, the shaper, and vitest tests (including before/after token-count
assertions on sample payloads).

---

## Sources

- [Level Up Your Developer Tools with Salesforce DX MCP — Salesforce Developers Blog](https://developer.salesforce.com/blogs/2025/06/level-up-your-developer-tools-with-salesforce-dx-mcp)
- [Introducing the Data 360 MCP Server (facade-tool architecture) — Salesforce Developers Blog](https://developer.salesforce.com/blogs/2026/05/introducing-the-data-360-mcp-server-developer-preview)
- [Salesforce MCP Servers: Technical Overview — Cirra](https://cirra.ai/articles/salesforce-mcp-servers-technical-guide)
- [Salesforce DX MCP Server — 60+ Tools overview — ChatForest](https://chatforest.com/reviews/salesforce-dx-mcp-server/)
