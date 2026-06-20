// TIF encoder: array-of-records (JSON) -> compact TIF text.

import type { ColType, Column, EncodeOptions, Json, Record_ } from "./types.js";
import {
  EMPTY_ARR_TOKEN,
  EMPTY_STR_TOKEN,
  escapeListElement,
  escapeLiteral,
  FIELD_SEP,
  LIST_SEP,
} from "./escape.js";

function isPlainObject(v: Json): v is Record_ {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** First-seen union of keys across all records (stable column order). */
function collectColumns(records: Record_[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const rec of records) {
    for (const k of Object.keys(rec)) {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  return order;
}

function scalarType(v: Json): ColType | null {
  if (v === null || v === undefined) {
    return null;
  } // contributes no type
  if (typeof v === "boolean") {
    return "b";
  }
  if (typeof v === "number") {
    return Number.isInteger(v) ? "i" : "n";
  }
  if (typeof v === "string") {
    return "s";
  }
  return "j"; // nested object/array
}

/** Merge two type observations into the most permissive that still fits. */
function mergeType(a: ColType | null, b: ColType | null): ColType | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  if (a === b) {
    return a;
  }
  if ((a === "i" && b === "n") || (a === "n" && b === "i")) {
    return "n";
  }
  if (a === "j" || b === "j") {
    return "j";
  }
  return "x"; // mixed scalars
}

interface ColumnPlan extends Column {}

function planColumn(name: string, records: Record_[]): ColumnPlan {
  let list = false;
  let elemType: ColType | null = null;
  for (const rec of records) {
    const v = rec[name];
    if (v === undefined || v === null) {
      continue;
    }
    if (Array.isArray(v)) {
      list = true;
      for (const el of v) {
        elemType = mergeType(elemType, scalarType(el));
      }
    } else {
      elemType = mergeType(elemType, scalarType(v));
    }
  }
  return { name, list, type: elemType ?? "s" };
}

function headerColumn(c: ColumnPlan): string {
  return `${c.name}${c.list ? "[]" : ""}:${c.type}`;
}

// --- dictionary -------------------------------------------------------------

function buildDictionary(
  records: Record_[],
  cols: ColumnPlan[],
  opts: Required<EncodeOptions>,
): Map<string, number> {
  const dict = new Map<string, number>();
  if (!opts.dictionary) {
    return dict;
  }

  const counts = new Map<string, number>();
  const tally = (v: Json) => {
    if (typeof v === "string" && v.length >= opts.dictMinLen) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  };
  for (const rec of records) {
    for (const c of cols) {
      const v = rec[c.name];
      if (c.type === "j") {
        continue;
      } // nested cells are JSON-encoded, not dict'd
      if (Array.isArray(v)) {
        v.forEach(tally);
      } else if (v !== undefined) {
        tally(v as Json);
      }
    }
  }

  // Keep only strings that actually save characters, biggest savings first.
  const candidates = [...counts.entries()]
    .filter(([, n]) => n >= opts.dictMinCount)
    .map(([s, n]) => ({ s, n, saving: n * s.length - (n * 3 + s.length + 4) }))
    .filter((c) => c.saving > 0)
    .toSorted((a, b) => b.saving - a.saving);

  candidates.forEach((c, i) => dict.set(c.s, i));
  return dict;
}

// --- value encoding ---------------------------------------------------------

function needsForceString(s: string): boolean {
  // In a mixed/untyped column, a string that looks like a number/bool/empty
  // would be mis-inferred on decode; force it with a leading quote.
  return s === "" || s === "true" || s === "false" || /^-?\d+(\.\d+)?$/.test(s);
}

function encodeScalar(v: Json, type: ColType, dict: Map<string, number>): string {
  if (v === null || v === undefined) {
    return "";
  }
  if (type === "j") {
    return escapeLiteral(JSON.stringify(v));
  } // nested, type-driven
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  if (typeof v === "number") {
    return String(v);
  }
  const s = String(v);
  if (s === "") {
    return EMPTY_STR_TOKEN;
  }
  const ref = dict.get(s);
  if (ref !== undefined) {
    return "$" + ref;
  }
  const lit = escapeLiteral(s);
  if (type === "x" && needsForceString(s)) {
    return "'" + lit;
  }
  return lit;
}

function encodeListElement(v: Json, type: ColType, dict: Map<string, number>): string {
  if (v === null || v === undefined) {
    return "";
  }
  if (type === "j") {
    return escapeListElement(JSON.stringify(v));
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  if (typeof v === "number") {
    return String(v);
  }
  const s = String(v);
  if (s === "") {
    return EMPTY_STR_TOKEN;
  }
  const ref = dict.get(s);
  if (ref !== undefined) {
    return "$" + ref;
  }
  const lit = escapeListElement(s);
  if (type === "x" && needsForceString(s)) {
    return "'" + lit;
  }
  return lit;
}

function encodeField(v: Json | undefined, c: ColumnPlan, dict: Map<string, number>): string {
  if (v === undefined || v === null) {
    return "";
  } // null / absent
  if (c.list) {
    if (!Array.isArray(v)) {
      v = [v];
    }
    if (v.length === 0) {
      return EMPTY_ARR_TOKEN;
    }
    return v.map((el) => encodeListElement(el, c.type, dict)).join(LIST_SEP);
  }
  return encodeScalar(v, c.type, dict);
}

/** Encode an array of (mostly flat) records into TIF text. */
export function encode(records: Record_[], options: EncodeOptions = {}): string {
  const opts: Required<EncodeOptions> = {
    name: options.name ?? "r",
    dictionary: options.dictionary ?? true,
    dictMinCount: options.dictMinCount ?? 2,
    dictMinLen: options.dictMinLen ?? 3,
  };
  if (!Array.isArray(records)) {
    throw new TypeError("encode expects an array of records");
  }

  const colNames = collectColumns(records);
  const cols = colNames.map((name) => planColumn(name, records));
  const dict = buildDictionary(records, cols, opts);

  const lines: string[] = [];

  // Dictionary lines, in id order. Escape backslash + newline so the value
  // stays on one line and is unambiguous to decode.
  const byId = [...dict.entries()].toSorted((a, b) => a[1] - b[1]);
  for (const [str, id] of byId) {
    lines.push(`$${id}=${str.replace(/\\/g, "\\\\").replace(/\n/g, "\\n")}`);
  }

  // Schema header.
  lines.push(`@${opts.name}=${cols.map(headerColumn).join(",")}`);

  // Rows.
  for (const rec of records) {
    lines.push(cols.map((c) => encodeField(rec[c.name], c, dict)).join(FIELD_SEP));
  }

  return lines.join("\n");
}

export { collectColumns, isPlainObject };
