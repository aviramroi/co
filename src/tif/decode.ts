// TIF decoder: compact TIF text -> array(s) of records (JSON).

import type { ColType, Column, Json, Record_ } from "./types.js";
import {
  EMPTY_ARR_TOKEN,
  EMPTY_STR_TOKEN,
  FIELD_SEP,
  LIST_SEP,
  splitUnescaped,
  unescape,
} from "./escape.js";

const DICT_REF = /^\$(\d+)$/;
const HEADER_COL = /^(.+?)(\[\])?:([sinbjx])$/;

function parseDictValue(raw: string): string {
  // Reverse of the encoder's backslash+newline escaping.
  let out = "";
  let esc = false;
  for (const ch of raw) {
    if (esc) {
      out += ch === "n" ? "\n" : ch;
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    out += ch;
  }
  if (esc) {
    out += "\\";
  }
  return out;
}

function parseHeader(line: string): { name: string; cols: Column[] } {
  const eq = line.indexOf("=");
  const name = line.slice(1, eq);
  const cols = line
    .slice(eq + 1)
    .split(",")
    .filter((c) => c.length > 0)
    .map((c): Column => {
      const m = HEADER_COL.exec(c);
      if (!m) {
        throw new SyntaxError(`TIF: bad column spec "${c}"`);
      }
      return { name: m[1], list: m[2] === "[]", type: m[3] as ColType };
    });
  return { name, cols };
}

function inferScalar(token: string, dict: string[]): Json {
  // Used only for mixed ("x") columns.
  const ref = DICT_REF.exec(token);
  if (ref) {
    return dict[Number(ref[1])] ?? "";
  }
  if (token === EMPTY_STR_TOKEN) {
    return "";
  }
  if (token.startsWith("'")) {
    return unescape(token.slice(1));
  } // forced string
  if (token === "true") {
    return true;
  }
  if (token === "false") {
    return false;
  }
  if (/^-?\d+$/.test(token)) {
    return Number(token);
  }
  if (/^-?\d+\.\d+([eE][+-]?\d+)?$/.test(token)) {
    return Number(token);
  }
  return unescape(token);
}

function decodeScalar(token: string, type: ColType, dict: string[]): Json {
  if (token === "") {
    return null;
  }
  switch (type) {
    case "j":
      return JSON.parse(unescape(token)) as Json;
    case "b":
      return token === "true";
    case "i":
    case "n":
      return Number(token);
    case "x":
      return inferScalar(token, dict);
    case "s":
    default: {
      const ref = DICT_REF.exec(token);
      if (ref) {
        return dict[Number(ref[1])] ?? "";
      }
      if (token === EMPTY_STR_TOKEN) {
        return "";
      }
      return unescape(token);
    }
  }
}

function decodeField(token: string, col: Column, dict: string[]): Json {
  if (!col.list) {
    return decodeScalar(token, col.type, dict);
  }
  if (token === "") {
    return null;
  }
  if (token === EMPTY_ARR_TOKEN) {
    return [];
  }
  return splitUnescaped(token, LIST_SEP).map((el) => decodeScalar(el, col.type, dict));
}

/** Parse a TIF document into one or more named tables. */
export function decodeAll(text: string): Record<string, Record_[]> {
  const tables: Record<string, Record_[]> = {};
  const dict: string[] = [];
  let cols: Column[] | null = null;
  let current: Record_[] | null = null;

  for (const rawLine of text.split("\n")) {
    if (rawLine === "" && cols === null) {
      continue;
    } // tolerate leading blanks
    const first = rawLine[0];

    if (first === "$") {
      const eq = rawLine.indexOf("=");
      const id = Number(rawLine.slice(1, eq));
      dict[id] = parseDictValue(rawLine.slice(eq + 1));
      continue;
    }
    if (first === "#") {
      continue;
    } // comment
    if (first === "@") {
      const { name, cols: parsed } = parseHeader(rawLine);
      cols = parsed;
      current = [];
      tables[name] = current;
      continue;
    }

    // data row
    if (!cols || !current) {
      throw new SyntaxError("TIF: data row before any @schema header");
    }
    const tokens = splitUnescaped(rawLine, FIELD_SEP);
    const rec: Record_ = {};
    for (let i = 0; i < cols.length; i++) {
      rec[cols[i].name] = decodeField(tokens[i] ?? "", cols[i], dict);
    }
    current.push(rec);
  }

  return tables;
}

/** Decode the first (or only) table of a TIF document into records. */
export function decode(text: string): Record_[] {
  const tables = decodeAll(text);
  const names = Object.keys(tables);
  if (names.length === 0) {
    return [];
  }
  return tables[names[0]];
}
