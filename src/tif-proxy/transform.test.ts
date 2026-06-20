import { describe, expect, it } from "vitest";
import { decode } from "../tif/index.js";
import {
  isRecordArray,
  maybeEncodeText,
  TIF_MARKER,
  transformLine,
  transformMessage,
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
