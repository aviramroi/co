// Serializers for the formats TIF is benchmarked against. Each takes the same
// array of records and returns a textual representation. Kept dependency-free
// and intentionally conventional (no exotic minification) for a fair fight.

import type { Json, Record_ } from "./types.js";
import { encode as tifEncode } from "./encode.js";

export interface Serializer {
  id: string;
  label: string;
  serialize(records: Record_[]): string;
}

function unionKeys(records: Record_[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  return order;
}

function csvCell(v: Json): string {
  if (v === null || v === undefined) {
    return "";
  }
  const s =
    Array.isArray(v) || (typeof v === "object" && v !== null) ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function yamlScalar(v: Json): string {
  if (v === null || v === undefined) {
    return "null";
  }
  if (typeof v === "string") {
    return /[\][:#\-?,{}&*!|>'"%@`\n]/.test(v) || v === "" ? JSON.stringify(v) : v;
  }
  if (typeof v === "object") {
    return JSON.stringify(v);
  }
  return String(v);
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const SERIALIZERS: Serializer[] = [
  { id: "json", label: "JSON (compact)", serialize: (r) => JSON.stringify(r) },
  { id: "json-pretty", label: "JSON (pretty)", serialize: (r) => JSON.stringify(r, null, 2) },
  {
    id: "csv",
    label: "CSV",
    serialize: (records) => {
      const cols = unionKeys(records);
      const head = cols.map((c) => csvCell(c)).join(",");
      const body = records.map((rec) => cols.map((c) => csvCell(rec[c] ?? null)).join(","));
      return [head, ...body].join("\n");
    },
  },
  {
    id: "yaml",
    label: "YAML",
    serialize: (records) =>
      records
        .map((rec) => {
          const keys = Object.keys(rec);
          return keys
            .map((k, i) => `${i === 0 ? "- " : "  "}${k}: ${yamlScalar(rec[k])}`)
            .join("\n");
        })
        .join("\n"),
  },
  {
    id: "xml",
    label: "XML",
    serialize: (records) => {
      const rows = records
        .map((rec) => {
          const inner = Object.entries(rec)
            .map(([k, v]) => {
              const text =
                v === null || v === undefined
                  ? ""
                  : typeof v === "object"
                    ? JSON.stringify(v)
                    : String(v);
              return `<${k}>${xmlEscape(text)}</${k}>`;
            })
            .join("");
          return `<row>${inner}</row>`;
        })
        .join("");
      return `<rows>${rows}</rows>`;
    },
  },
  { id: "tif", label: "TIF", serialize: (r) => tifEncode(r) },
];
