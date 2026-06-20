import { describe, expect, it } from "vitest";
import {
  dropNulls,
  estimateTokens,
  shapeDescribe,
  shapeQuery,
  stripRecord,
  type RawDescribe,
  type RawQueryResult,
} from "./shape.js";

function makeAccounts(n: number): RawQueryResult {
  const records = Array.from({ length: n }, (_, i) => ({
    attributes: {
      type: "Account",
      url: `/services/data/v60.0/sobjects/Account/0015g00000XyZ${String(i).padStart(2, "0")}AAB`,
    },
    Id: `0015g00000XyZ${String(i).padStart(2, "0")}AAB`,
    Name: `Company ${i}`,
    Industry: i % 2 ? "Technology" : "Manufacturing",
    AnnualRevenue: 1_000_000 * (i + 1),
    BillingCity: null,
    OwnerId: "0055g00000AbCdeFAAB",
  }));
  return { records, totalSize: n, done: true };
}

describe("shapeQuery", () => {
  it("strips the attributes block and null fields", () => {
    const shaped = shapeQuery(makeAccounts(2), { format: "objects" });
    expect(shaped).toMatchObject({ n: 2, truncated: false });
    const first = (shaped as { rows: Record<string, unknown>[] }).rows[0];
    expect(first.attributes).toBeUndefined();
    expect("BillingCity" in first).toBe(false); // null pruned
    expect(first.Name).toBe("Company 0");
  });

  it("columnar emits field names once", () => {
    const shaped = shapeQuery(makeAccounts(3), { format: "columns" }) as {
      cols: string[];
      rows: unknown[][];
    };
    expect(shaped.cols).toEqual(["Id", "Name", "Industry", "AnnualRevenue", "OwnerId"]);
    expect(shaped.rows).toHaveLength(3);
    expect(shaped.rows[0]).toHaveLength(shaped.cols.length);
  });

  it("respects the maxRows budget and flags truncation", () => {
    const shaped = shapeQuery(makeAccounts(500), { maxRows: 50 }) as {
      rows: unknown[][];
      truncated: boolean;
      n: number;
    };
    expect(shaped.rows).toHaveLength(50);
    expect(shaped.truncated).toBe(true);
    expect(shaped.n).toBe(500); // still reports the true total
  });

  it("columnar is dramatically cheaper than raw on multi-row results", () => {
    const raw = makeAccounts(100);
    const rawTokens = estimateTokens(raw);
    const columnarTokens = estimateTokens(shapeQuery(raw, { format: "columns" }));
    const tsvTokens = estimateTokens(shapeQuery(raw, { format: "tsv" }));

    // Expect at least a 40% reduction from columnar, and TSV cheaper still.
    expect(columnarTokens).toBeLessThan(rawTokens * 0.6);
    expect(tsvTokens).toBeLessThanOrEqual(columnarTokens);
  });

  it("tsv output is well-formed", () => {
    const shaped = shapeQuery(makeAccounts(2), { format: "tsv" }) as {
      tsv: string;
      cols: string[];
    };
    const lines = shaped.tsv.split("\n");
    expect(lines[0]).toBe(shaped.cols.join("\t"));
    expect(lines).toHaveLength(3); // header + 2 rows
  });
});

describe("tif format (proxy ↔ TIF integration)", () => {
  it("returns a TIF document and is the most compact format", () => {
    const raw = makeAccounts(50);
    const tif = shapeQuery(raw, { format: "tif" }) as { tif: string; n: number };
    expect(typeof tif.tif).toBe("string");
    expect(tif.tif).toContain("@r="); // schema header
    // TIF should beat columnar, which already beats the raw payload.
    const tifTokens = estimateTokens(tif.tif);
    const columnarTokens = estimateTokens(shapeQuery(raw, { format: "columns" }));
    const rawTokens = estimateTokens(raw);
    expect(tifTokens).toBeLessThan(columnarTokens);
    expect(tifTokens).toBeLessThan(rawTokens * 0.4);
  });
});

describe("record helpers", () => {
  it("stripRecord removes only system keys", () => {
    const r = stripRecord({ attributes: { type: "X" }, Id: "1", Name: "a" });
    expect(r).toEqual({ Id: "1", Name: "a" });
  });
  it("dropNulls removes null and empty strings", () => {
    expect(dropNulls({ a: 1, b: null, c: "", d: "x" })).toEqual({ a: 1, d: "x" });
  });
});

describe("shapeDescribe", () => {
  const full: RawDescribe = {
    name: "Account",
    fields: [
      { name: "Id", type: "id", nillable: false },
      { name: "Name", type: "string", nillable: false },
      {
        name: "OwnerId",
        type: "reference",
        nillable: false,
        referenceTo: ["User"],
      },
      {
        name: "Industry",
        type: "picklist",
        nillable: true,
        picklistValues: Array.from({ length: 40 }, (_, i) => ({ value: `v${i}` })),
      },
    ],
  };

  it("slims fields and replaces picklist values with a count", () => {
    const slim = shapeDescribe(full) as { fields: Record<string, unknown>[]; schemaRef: string };
    expect(slim.schemaRef).toBe("sf:Account");
    const industry = slim.fields.find((f) => f.name === "Industry")!;
    expect(industry.picklist).toBe(40);
    expect("picklistValues" in industry).toBe(false);
    const id = slim.fields.find((f) => f.name === "Id")!;
    expect(id.required).toBe(true);
  });

  it("slim describe is much cheaper than full", () => {
    const slimTokens = estimateTokens(shapeDescribe(full, "slim"));
    const fullTokens = estimateTokens(shapeDescribe(full, "full"));
    expect(slimTokens).toBeLessThan(fullTokens * 0.7);
  });

  it("detail:full returns the raw payload untouched", () => {
    expect(shapeDescribe(full, "full")).toBe(full);
  });
});
