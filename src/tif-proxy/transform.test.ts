import { describe, expect, it } from "vitest";
import { decode, encode } from "../tif/index.js";
import {
  isRecordArray,
  maybeDecodeTif,
  maybeEncodeText,
  TIF_MARKER,
  transformLine,
  transformMessage,
  transformRequestLine,
  transformRequestMessage,
} from "./transform.js";

const records = [
  { Id: "001", Name: "Acme", Industry: "Tech", OwnerId: "005x" },
  { Id: "002", Name: "Globex", Industry: "Tech", OwnerId: "005x" },
  { Id: "003", Name: "Initech", Industry: "Finance", OwnerId: "005x" },
];

describe("isRecordArray", () => {
  it("accepts arrays of objects above the row threshold", () => {
    expect(isRecordArray(records, 2)).toBe(true);
  });
  it("rejects scalars, short arrays, and arrays of non-objects", () => {
    expect(isRecordArray([1, 2, 3], 2)).toBe(false);
    expect(isRecordArray([{ a: 1 }], 2)).toBe(false);
    expect(isRecordArray("nope", 2)).toBe(false);
  });
});

describe("maybeEncodeText", () => {
  it("encodes a JSON record array to a smaller, lossless TIF block", () => {
    const json = JSON.stringify(records);
    const encoded = maybeEncodeText(json, 2)!;
    expect(encoded).not.toBeNull();
    expect(encoded.startsWith(TIF_MARKER)).toBe(true);
    expect(encoded.length).toBeLessThan(json.length);
    // strip marker line and confirm round-trip
    const tif = encoded.slice(encoded.indexOf("\n") + 1);
    expect(decode(tif)).toEqual(records);
  });
  it("leaves non-record text alone", () => {
    expect(maybeEncodeText("just a sentence", 2)).toBeNull();
    expect(maybeEncodeText('{"a":1}', 2)).toBeNull(); // object, not array
    expect(maybeEncodeText("[1,2,3]", 2)).toBeNull(); // scalars
  });
});

describe("transformMessage", () => {
  it("re-encodes tool-result content blocks", () => {
    const msg = {
      jsonrpc: "2.0",
      id: 7,
      result: { content: [{ type: "text", text: JSON.stringify(records) }] },
    };
    const { message, changed } = transformMessage(msg, { minRows: 2 });
    expect(changed).toBe(true);
    const text = (message.result as { content: { text: string }[] }).content[0].text;
    expect(text.startsWith(TIF_MARKER)).toBe(true);
  });

  it("injects TIF instructions into the initialize response once", () => {
    const init = {
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2025-06-18", serverInfo: { name: "x" }, capabilities: {} },
    };
    const first = transformMessage(init);
    expect(first.changed).toBe(true);
    const instructions = (first.message.result as { instructions: string }).instructions;
    expect(instructions).toContain(TIF_MARKER);
    // idempotent: a second pass does not double-inject
    const second = transformMessage(first.message);
    expect(second.changed).toBe(false);
  });

  it("passes through errors and non-record results untouched", () => {
    const err = { jsonrpc: "2.0", id: 2, error: { code: -32000, message: "boom" } };
    expect(transformMessage(err).changed).toBe(false);
    const plain = { jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: "hello" }] } };
    expect(transformMessage(plain).changed).toBe(false);
  });
});

describe("transformLine", () => {
  it("rewrites a tool-result line and preserves valid JSON framing", () => {
    const line = JSON.stringify({
      jsonrpc: "2.0",
      id: 9,
      result: { content: [{ type: "text", text: JSON.stringify(records) }] },
    });
    const out = transformLine(line);
    expect(out).not.toEqual(line);
    expect(() => JSON.parse(out)).not.toThrow();
    expect(out.length).toBeLessThan(line.length);
  });
  it("passes through non-JSON and blank lines verbatim", () => {
    expect(transformLine("not json")).toBe("not json");
    expect(transformLine("")).toBe("");
  });
});

describe("input decoding (client -> upstream)", () => {
  it("maybeDecodeTif round-trips a TIF-marked argument and leaves others alone", () => {
    const tifArg = `${TIF_MARKER}\n${encode(records)}`;
    expect(maybeDecodeTif(tifArg)).toEqual(records);
    expect(maybeDecodeTif("plain string")).toBe("plain string");
    expect(maybeDecodeTif(42)).toBe(42);
    expect(maybeDecodeTif({ a: 1 })).toEqual({ a: 1 });
  });

  it("decodes TIF tool-call arguments back to JSON for the server", () => {
    const tifArg = `${TIF_MARKER}\n${encode(records)}`;
    const msg = {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "bulk_create", arguments: { sobject: "Account", records: tifArg } },
    };
    const { message, changed } = transformRequestMessage(msg);
    expect(changed).toBe(true);
    const args = (message.params as { arguments: { records: unknown; sobject: string } }).arguments;
    expect(args.sobject).toBe("Account"); // untouched
    expect(args.records).toEqual(records); // decoded to real JSON
  });

  it("leaves normal JSON arguments and non-tool-call requests untouched", () => {
    const normal = {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "x", arguments: { a: 1, b: "two" } },
    };
    expect(transformRequestMessage(normal).changed).toBe(false);
    const list = { jsonrpc: "2.0", id: 6, method: "tools/list" };
    expect(transformRequestMessage(list).changed).toBe(false);
  });

  it("transformRequestLine rewrites only when something was decoded", () => {
    const tifArg = `${TIF_MARKER}\n${encode(records)}`;
    const line = JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "bulk", arguments: { rows: tifArg } },
    });
    const out = transformRequestLine(line);
    const parsed = JSON.parse(out) as { params: { arguments: { rows: unknown } } };
    expect(parsed.params.arguments.rows).toEqual(records);
    expect(transformRequestLine('{"jsonrpc":"2.0","method":"ping"}')).toBe(
      '{"jsonrpc":"2.0","method":"ping"}',
    );
  });
});
