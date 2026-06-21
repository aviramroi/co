import { describe, expect, it } from "vitest";
import type { Record_ } from "./types.js";
import { decode, decodeAll, encode } from "./index.js";

function roundtrip(records: Record_[]): Record_[] {
  return decode(encode(records));
}

describe("TIF round-trip", () => {
  it("flat string/number records", () => {
    const data = [
      { user_id: 1, name: "John", company: "Acme Inc", role: "admin" },
      { user_id: 2, name: "Jane", company: "Acme Inc", role: "admin" },
    ];
    expect(roundtrip(data)).toEqual(data);
  });

  it("preserves types (int, float, bool, null, string)", () => {
    const data = [
      { a: 1, b: 1.5, c: true, d: null, e: "x" },
      { a: -3, b: -0.25, c: false, d: null, e: "y" },
    ];
    expect(roundtrip(data)).toEqual(data);
  });

  it("keeps numeric-looking strings as strings (uniform string column)", () => {
    const data = [{ code: "007" }, { code: "42" }];
    expect(roundtrip(data)).toEqual(data);
  });

  it("handles mixed-type columns without losing string-ness", () => {
    const data = [{ v: "true" }, { v: 5 }, { v: true }, { v: "10" }];
    expect(roundtrip(data)).toEqual(data);
  });

  it("scalar list fields", () => {
    const data = [
      { id: 1, name: "John", roles: ["admin", "owner"] },
      { id: 2, name: "Jane", roles: ["viewer"] },
      { id: 3, name: "Empty", roles: [] },
    ];
    expect(roundtrip(data)).toEqual(data);
  });

  it("distinguishes null, empty string and empty array", () => {
    const data = [{ s: "", a: [], n: null }];
    const out = roundtrip(data)[0];
    expect(out.s).toBe("");
    expect(out.a).toEqual([]);
    expect(out.n).toBeNull();
  });

  it("escapes separators and special leading chars", () => {
    const data = [
      {
        a: "pipe|inside",
        b: "comma,inside",
        c: "$literal",
        d: "'quote",
        e: "back\\slash",
        f: "line\nbreak",
      },
    ];
    expect(roundtrip(data)).toEqual(data);
  });

  it("nested objects/arrays via JSON fallback column", () => {
    const data = [
      { id: 1, meta: { a: 1, tags: ["x", "y"] } },
      { id: 2, meta: { a: 2, tags: [] } },
    ];
    expect(roundtrip(data)).toEqual(data);
  });

  it("ragged records (missing keys become null)", () => {
    const data = [{ a: 1, b: 2 }, { a: 3 }];
    expect(roundtrip(data)).toEqual([
      { a: 1, b: 2 },
      { a: 3, b: null },
    ]);
  });

  it("dictionary references resolve back to the original strings", () => {
    const data = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      company: "Acme Inc",
      role: "admin",
    }));
    const text = encode(data);
    expect(text).toContain("$0="); // a dictionary entry was emitted
    expect(decode(text)).toEqual(data);
  });
});

describe("TIF shape", () => {
  it("emits schema once and positional rows", () => {
    const text = encode([
      { id: 1, name: "John", city: "NY" },
      { id: 2, name: "Jane", city: "SF" },
    ]);
    const lines = text.split("\n");
    expect(lines.some((l) => l.startsWith("@r="))).toBe(true);
    expect(text).toContain("1|John|NY");
    expect(text).toContain("2|Jane|SF");
  });

  it("supports a custom table name and multi-table decode", () => {
    const text = encode([{ id: 1 }], { name: "u" });
    expect(text).toContain("@u=");
    expect(Object.keys(decodeAll(text))).toEqual(["u"]);
  });

  it("can disable the dictionary", () => {
    const text = encode([{ c: "Acme Inc" }, { c: "Acme Inc" }], { dictionary: false });
    expect(text).not.toContain("$0=");
    expect(text).toContain("Acme Inc");
  });
});
