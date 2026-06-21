// Facade tools for the Salesforce MCP proxy (lever A + B).
//
// Collapses the ~60 DX / ~200 Data 360 operations into a handful of verb-shaped
// tools, then routes them to an injected client (the real DX MCP or the REST
// API). Transport-agnostic on purpose so it is unit-testable without a network.

import {
  shapeDescribe,
  shapeQuery,
  type QueryFormat,
  type RawDescribe,
  type RawQueryResult,
  type SfRecord,
  type SlimDescribe,
} from "./shape.js";

/** The upstream Salesforce capability the facade routes to. */
export interface SalesforceClient {
  query(soql: string): Promise<RawQueryResult>;
  describe(sobject: string): Promise<RawDescribe>;
  dml(op: DmlOp, sobject: string, records: SfRecord[]): Promise<DmlResult[]>;
  runFlow?(name: string, params: Record<string, unknown>): Promise<unknown>;
}

export type DmlOp = "create" | "update" | "upsert" | "delete";
export interface DmlResult {
  id?: string;
  success: boolean;
  errors?: { message: string }[];
}

export interface FacadeTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// JSON-Schema tool definitions kept deliberately terse — every token here is
// paid on every turn (lever A). SOQL/object knowledge lives in the model, not
// in 200 hand-held schemas.
export const FACADE_TOOLS: FacadeTool[] = [
  {
    name: "soql",
    description:
      "Run a read-only SOQL query. Always SELECT explicit fields (never *). " +
      "format: columns (default, field names emitted once) | objects | tsv.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "A SELECT … SOQL statement." },
        format: { type: "string", enum: ["columns", "objects", "tsv"] },
        maxRows: { type: "number" },
      },
    },
  },
  {
    name: "describe",
    description:
      "Describe an sObject. Returns slim fields {name,type,required,refTo,picklist-count}. " +
      'detail:"full" for the raw metadata. Result is cached by schemaRef.',
    inputSchema: {
      type: "object",
      required: ["sobject"],
      properties: {
        sobject: { type: "string" },
        detail: { type: "string", enum: ["slim", "full"] },
      },
    },
  },
  {
    name: "dml",
    description: "Create / update / upsert / delete records.",
    inputSchema: {
      type: "object",
      required: ["op", "sobject", "records"],
      properties: {
        op: { type: "string", enum: ["create", "update", "upsert", "delete"] },
        sobject: { type: "string" },
        records: { type: "array", items: { type: "object" } },
      },
    },
  },
  {
    name: "run_flow",
    description: "Invoke a named Flow / autolaunched process with params.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, params: { type: "object" } },
    },
  },
];

const READ_ONLY = /^\s*select\b/i;
// Cheap guard: block anything that smells like mutation reaching the read path.
const FORBIDDEN = /\b(insert|update|delete|upsert|merge|undelete)\b/i;

export class ValidationError extends Error {}

/** Lever A guardrail: keep `soql` read-only and projection-explicit. */
export function validateSoql(query: string): void {
  if (!READ_ONLY.test(query)) {
    throw new ValidationError("soql only runs SELECT statements; use dml to mutate.");
  }
  if (FORBIDDEN.test(query)) {
    throw new ValidationError("soql is read-only; mutation keywords are not allowed.");
  }
  if (/select\s+\*/i.test(query)) {
    throw new ValidationError("SELECT * is not supported; list explicit fields to save tokens.");
  }
}

export interface DispatchResult {
  // Compact, already-shaped payload destined for the model. `unknown` covers the
  // open-ended run_flow result; the named types document the common shapes.
  content: unknown;
}

/** Coerce an untyped tool argument to a string without stringifying objects. */
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export interface DispatchOpts {
  /** Describe cache shared across a session (lever E). */
  describeCache?: Map<string, SlimDescribe | RawDescribe>;
}

/**
 * Route one facade tool call to the upstream client and shape the response.
 * Throws ValidationError on bad input (cheap, corrective errors instead of
 * 200 per-operation schemas).
 */
export async function dispatch(
  client: SalesforceClient,
  tool: string,
  args: Record<string, unknown>,
  opts: DispatchOpts = {},
): Promise<DispatchResult> {
  switch (tool) {
    case "soql": {
      const query = asString(args.query);
      validateSoql(query);
      const raw = await client.query(query);
      return {
        content: shapeQuery(raw, {
          format: (args.format as QueryFormat) ?? "columns",
          maxRows: typeof args.maxRows === "number" ? args.maxRows : undefined,
        }),
      };
    }
    case "describe": {
      const sobject = asString(args.sobject);
      const detail = (args.detail as "slim" | "full") ?? "slim";
      const key = `${sobject}:${detail}`;
      const cache = opts.describeCache;
      if (cache?.has(key)) {
        return { content: cache.get(key) };
      }
      const shaped = shapeDescribe(await client.describe(sobject), detail);
      cache?.set(key, shaped);
      return { content: shaped };
    }
    case "dml": {
      const op = args.op as DmlOp;
      const sobject = asString(args.sobject);
      const records = (args.records as SfRecord[]) ?? [];
      if (!op || !sobject || !Array.isArray(records)) {
        throw new ValidationError("dml requires {op, sobject, records[]}.");
      }
      return { content: await client.dml(op, sobject, records) };
    }
    case "run_flow": {
      if (!client.runFlow) {
        throw new ValidationError("run_flow is not available on this client.");
      }
      return {
        content: await client.runFlow(
          asString(args.name),
          (args.params as Record<string, unknown>) ?? {},
        ),
      };
    }
    default:
      throw new ValidationError(`Unknown facade tool: ${tool}`);
  }
}
