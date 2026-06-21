// Pure transforms for the TIF MCP proxy.
//
// The proxy is a transparent man-in-the-middle on the MCP stdio JSON-RPC stream.
// It only rewrites *tool results* flowing upstream -> client: when a result's
// text content is a JSON array of records, it is re-encoded as TIF (far fewer
// tokens, losslessly). Requests (client -> upstream) pass through untouched, so
// tool inputs and protocol semantics are unaffected.

import { decode, encode } from "../tif/index.js";

export const TIF_MARKER = "[TIF v0.1]";

/** One-time reading guide, injected into the server's `initialize` instructions. */
export const TIF_INSTRUCTIONS = [
  "Some tool results from this server are encoded as TIF (Token Interchange Format) to save tokens.",
  `A TIF block starts with a line "${TIF_MARKER}". Read it like this:`,
  '- Lines "$n=value" define a dictionary; the token "$n" used later means that value.',
  '- A line "@name=col:type,col:type,..." defines the columns. "col[]" is a list column.',
  "  Types: s=string i=int n=number b=bool j=JSON x=mixed.",
  '- Each following line is one record: values separated by "|", positional to the columns.',
  '  List elements are separated by ",".',
  '- Empty field = null; "\\e" = empty string; "\\a" = empty array; "\\|" "\\," "\\n" are escaped.',
  "Treat the reconstructed records exactly as the equivalent JSON.",
  "",
  "You may also SEND large array-of-record tool arguments in this TIF format:",
  `pass the argument value as a string starting with "${TIF_MARKER}" instead of a JSON array,`,
  "and it will be decoded back to JSON before the tool runs. Use it for bulk inputs",
  "(e.g. creating/updating many records) to spend far fewer tokens; small args stay JSON.",
].join("\n");

export interface TransformOptions {
  /** Only encode arrays with at least this many records. Default 2. */
  minRows?: number;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface ContentBlock {
  type?: string;
  text?: string;
  [k: string]: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** An array of flat-ish record objects — TIF's sweet spot. */
export function isRecordArray(v: unknown, minRows: number): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.length >= minRows && v.every(isPlainObject);
}

/**
 * If `text` parses as a JSON array of records, return a TIF-encoded block that
 * is strictly smaller; otherwise return null (leave the text untouched).
 */
export function maybeEncodeText(text: string, minRows: number): string | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("[")) {
    return null;
  } // cheap reject before parsing
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecordArray(parsed, minRows)) {
    return null;
  }
  let tif: string;
  try {
    tif = encode(parsed as Parameters<typeof encode>[0]);
  } catch {
    return null;
  }
  const block = `${TIF_MARKER}\n${tif}`;
  return block.length < text.length ? block : null; // only if it actually helps
}

function encodeContentBlocks(
  content: ContentBlock[],
  minRows: number,
): { content: ContentBlock[]; changed: boolean } {
  let changed = false;
  const out = content.map((block) => {
    if (block.type === "text" && typeof block.text === "string") {
      const encoded = maybeEncodeText(block.text, minRows);
      if (encoded !== null) {
        changed = true;
        return { ...block, text: encoded };
      }
    }
    return block;
  });
  return { content: out, changed };
}

function looksLikeInitialize(result: Record<string, unknown>): boolean {
  return "protocolVersion" in result || "serverInfo" in result || "capabilities" in result;
}

/**
 * Transform a single parsed JSON-RPC message. Returns the (possibly) rewritten
 * message and whether anything changed. Never throws — on any problem it returns
 * the original message so the protocol is never broken.
 */
export function transformMessage(
  msg: JsonRpcMessage,
  options: TransformOptions = {},
): { message: JsonRpcMessage; changed: boolean } {
  const minRows = options.minRows ?? 2;
  try {
    const result = msg.result;
    if (!isPlainObject(result)) {
      return { message: msg, changed: false };
    }

    // Inject the TIF reading guide once, on the initialize response.
    if (looksLikeInitialize(result)) {
      const existing = typeof result.instructions === "string" ? result.instructions : "";
      if (existing.includes(TIF_MARKER)) {
        return { message: msg, changed: false };
      }
      const instructions = existing ? `${existing}\n\n${TIF_INSTRUCTIONS}` : TIF_INSTRUCTIONS;
      return { message: { ...msg, result: { ...result, instructions } }, changed: true };
    }

    // Re-encode tool-result content blocks.
    if (Array.isArray(result.content)) {
      const { content, changed } = encodeContentBlocks(result.content as ContentBlock[], minRows);
      if (!changed) {
        return { message: msg, changed: false };
      }
      return { message: { ...msg, result: { ...result, content } }, changed: true };
    }

    return { message: msg, changed: false };
  } catch {
    return { message: msg, changed: false };
  }
}

/**
 * Transform one line of the upstream stdout stream (newline-delimited JSON-RPC).
 * Non-JSON or non-transformable lines are returned byte-for-byte.
 */
export function transformLine(line: string, options: TransformOptions = {}): string {
  if (line.trim() === "") {
    return line;
  }
  let parsed: JsonRpcMessage;
  try {
    parsed = JSON.parse(line) as JsonRpcMessage;
  } catch {
    return line; // not JSON — pass through unchanged
  }
  const { message, changed } = transformMessage(parsed, options);
  return changed ? JSON.stringify(message) : line;
}

// --- request direction (client -> upstream): decode compact inputs ----------

/**
 * If `value` is a TIF-marked string, decode it back to records; otherwise return
 * it unchanged. This is how the model opts in to compact inputs per-argument: it
 * only fires when the value actually starts with the TIF marker, so normal JSON
 * arguments pass through and the upstream server only ever sees standard JSON.
 */
export function maybeDecodeTif(value: unknown): unknown {
  if (typeof value !== "string" || !value.startsWith(TIF_MARKER)) {
    return value;
  }
  try {
    return decode(value.slice(value.indexOf("\n") + 1));
  } catch {
    return value; // malformed — forward as-is rather than guess
  }
}

/**
 * Decode TIF-encoded arguments in a `tools/call` request before it reaches the
 * server. Never throws — on any problem the original message is returned so the
 * call still goes through untouched.
 */
export function transformRequestMessage(msg: JsonRpcMessage): {
  message: JsonRpcMessage;
  changed: boolean;
} {
  try {
    if (msg.method !== "tools/call" || !isPlainObject(msg.params)) {
      return { message: msg, changed: false };
    }
    const args = msg.params.arguments;
    if (!isPlainObject(args)) {
      return { message: msg, changed: false };
    }
    let changed = false;
    const decoded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      const out = maybeDecodeTif(v);
      if (out !== v) {
        changed = true;
      }
      decoded[k] = out;
    }
    if (!changed) {
      return { message: msg, changed: false };
    }
    return { message: { ...msg, params: { ...msg.params, arguments: decoded } }, changed: true };
  } catch {
    return { message: msg, changed: false };
  }
}

/** Transform one line of the client stdin stream (requests). */
export function transformRequestLine(line: string): string {
  if (line.trim() === "") {
    return line;
  }
  let parsed: JsonRpcMessage;
  try {
    parsed = JSON.parse(line) as JsonRpcMessage;
  } catch {
    return line;
  }
  const { message, changed } = transformRequestMessage(parsed);
  return changed ? JSON.stringify(message) : line;
}
