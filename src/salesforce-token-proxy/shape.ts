// Token-reducing response shapers for the Salesforce MCP proxy.
//
// These are pure functions: they take a raw Salesforce REST/SOQL payload and
// return a compact, model-friendly shape. See
// docs/salesforce-mcp-token-abstraction.md for the rationale and the levers
// (C: strip/slim, D: columnar/TSV, E: describe slim+cache).

export type SfRecord = Record<string, unknown> & { attributes?: unknown };

export interface RawQueryResult {
  records: SfRecord[];
  totalSize: number;
  done: boolean;
}

import { encode as tifEncode } from "../tif/encode.js";

export type QueryFormat = "objects" | "columns" | "tsv" | "tif";

export interface ShapeQueryOpts {
  /** Output encoding. "columns" (default) emits field names once. */
  format?: QueryFormat;
  /** Drop null/empty fields. Default true. */
  dropNull?: boolean;
  /** Hard cap on rows returned to the model (lever F budget guard). */
  maxRows?: number;
}

export interface ShapedQueryObjects {
  n: number;
  truncated: boolean;
  rows: SfRecord[];
}
export interface ShapedQueryColumns {
  n: number;
  truncated: boolean;
  cols: string[];
  rows: unknown[][];
}
export interface ShapedQueryTsv {
  n: number;
  truncated: boolean;
  cols: string[];
  tsv: string;
}
export interface ShapedQueryTif {
  n: number;
  truncated: boolean;
  /** TIF document (schema-once + positional rows + dictionary). */
  tif: string;
}
export type ShapedQuery = ShapedQueryObjects | ShapedQueryColumns | ShapedQueryTsv | ShapedQueryTif;

const SYSTEM_KEYS = new Set(["attributes"]);

/** Remove Salesforce envelope/system noise (the per-record `attributes` block). */
export function stripRecord(r: SfRecord): SfRecord {
  const out: SfRecord = {};
  for (const [k, v] of Object.entries(r)) {
    if (!SYSTEM_KEYS.has(k)) {
      out[k] = v;
    }
  }
  return out;
}

/** Drop null / empty-string fields. */
export function dropNulls(r: SfRecord): SfRecord {
  const out: SfRecord = {};
  for (const [k, v] of Object.entries(r)) {
    if (v !== null && v !== undefined && v !== "") {
      out[k] = v;
    }
  }
  return out;
}

function unionKeys(rows: SfRecord[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      seen.add(k);
    }
  }
  return [...seen];
}

function cell(v: unknown): string {
  if (v === null || v === undefined) {
    return "";
  }
  const s = String(v);
  // Keep TSV well-formed: neutralise embedded tabs/newlines.
  return s.includes("\t") || s.includes("\n") ? s.replace(/[\t\n]+/g, " ") : s;
}

/**
 * Turn a raw SOQL response into a compact shape.
 * Levers C (strip/slim) + D (columnar/TSV) + F (row budget).
 */
export function shapeQuery(raw: RawQueryResult, opts: ShapeQueryOpts = {}): ShapedQuery {
  const { format = "columns", dropNull = true, maxRows = 200 } = opts;

  const truncated = raw.records.length > maxRows;
  const sliced = raw.records.slice(0, maxRows).map(stripRecord);
  const records = dropNull ? sliced.map(dropNulls) : sliced;

  if (format === "objects") {
    return { n: raw.totalSize, truncated, rows: records };
  }

  if (format === "tif") {
    // Records are already attribute-stripped + null-pruned; TIF adds
    // schema-once + positional rows + dictionary compression on top.
    return {
      n: raw.totalSize,
      truncated,
      tif: tifEncode(records as Parameters<typeof tifEncode>[0]),
    };
  }

  const cols = unionKeys(records);
  if (format === "tsv") {
    const header = cols.join("\t");
    const body = records.map((r) => cols.map((c) => cell(r[c])).join("\t"));
    return { n: raw.totalSize, truncated, cols, tsv: [header, ...body].join("\n") };
  }

  // columnar (default)
  const rows = records.map((r) => cols.map((c) => r[c] ?? null));
  return { n: raw.totalSize, truncated, cols, rows };
}

// --- describe slimming (lever E) -------------------------------------------

export interface RawDescribeField {
  name: string;
  type: string;
  nillable: boolean;
  referenceTo?: string[];
  picklistValues?: { value: string; active?: boolean }[];
  // ...the real describe has ~40 more keys per field; intentionally ignored.
  [k: string]: unknown;
}

export interface RawDescribe {
  name: string;
  fields: RawDescribeField[];
  [k: string]: unknown;
}

export interface SlimField {
  name: string;
  type: string;
  required?: true;
  refTo?: string[];
  /** Count of picklist values, not the values themselves. */
  picklist?: number;
}

export interface SlimDescribe {
  sobject: string;
  schemaRef: string;
  fields: SlimField[];
}

/**
 * Slim a describe down to what a model needs to write SOQL/DML.
 * `detail: "full"` returns the raw payload untouched.
 */
export function shapeDescribe(
  full: RawDescribe,
  detail: "slim" | "full" = "slim",
): SlimDescribe | RawDescribe {
  if (detail === "full") {
    return full;
  }
  return {
    sobject: full.name,
    schemaRef: `sf:${full.name}`,
    fields: full.fields.map((f) => {
      const field: SlimField = { name: f.name, type: f.type };
      if (!f.nillable) {
        field.required = true;
      }
      if (f.referenceTo && f.referenceTo.length) {
        field.refTo = f.referenceTo;
      }
      if (f.picklistValues && f.picklistValues.length) {
        field.picklist = f.picklistValues.length;
      }
      return field;
    }),
  };
}

/** Rough token estimate (~4 chars/token) for tests and budgeting. */
export function estimateTokens(value: unknown): number {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil(s.length / 4);
}
