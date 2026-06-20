// Low-level escaping/splitting for TIF (Token Interchange Format).
//
// TIF rows are positional values joined by single-character separators. To stay
// lossless we escape the separators (and a few sentinels) with a backslash and
// split in an escape-aware way. See src/tif/README.md for the full grammar.

export const FIELD_SEP = "|";
export const LIST_SEP = ",";

/** Sentinels (whole-token) — distinct from any escaped literal. */
export const NULL_TOKEN = ""; // empty field
export const EMPTY_STR_TOKEN = "\\e";
export const EMPTY_ARR_TOKEN = "\\a";

/**
 * Split a line on `sep`, ignoring separators preceded by a backslash. Escape
 * sequences are preserved in the returned tokens (resolve them with `unescape`).
 */
export function splitUnescaped(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let esc = false;
  for (const ch of line) {
    if (esc) {
      cur += "\\" + ch;
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === sep) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (esc) {
    cur += "\\";
  }
  out.push(cur);
  return out;
}

/** Escape a literal string for use inside a field (scalar context). */
export function escapeLiteral(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "\\" || ch === FIELD_SEP) {
      out += "\\" + ch;
    } else if (ch === "\n") {
      out += "\\n";
    } else {
      out += ch;
    }
  }
  // A literal that would collide with a marker/ref must be neutralised.
  if (out.startsWith("$")) {
    out = "\\" + out;
  } else if (out.startsWith("'")) {
    out = "\\" + out;
  }
  return out;
}

/** Escape a literal string for use inside a list element (also escapes `,`). */
export function escapeListElement(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "\\" || ch === FIELD_SEP || ch === LIST_SEP) {
      out += "\\" + ch;
    } else if (ch === "\n") {
      out += "\\n";
    } else {
      out += ch;
    }
  }
  if (out.startsWith("$")) {
    out = "\\" + out;
  } else if (out.startsWith("'")) {
    out = "\\" + out;
  }
  return out;
}

/** Resolve backslash escape sequences produced by the escapers above. */
export function unescape(token: string): string {
  let out = "";
  let esc = false;
  for (const ch of token) {
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
