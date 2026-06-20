import { describe, expect, it, vi } from "vitest";
import type { RawDescribe, RawQueryResult, SlimDescribe } from "./shape.js";
import {
  dispatch,
  FACADE_TOOLS,
  validateSoql,
  ValidationError,
  type SalesforceClient,
} from "./facade.js";

function fakeClient(overrides: Partial<SalesforceClient> = {}): SalesforceClient {
  return {
    query: vi.fn(
      async (): Promise<RawQueryResult> => ({
        totalSize: 1,
        done: true,
        records: [
          {
            attributes: { type: "Account", url: "/x/001" },
            Id: "001",
            Name: "Acme",
            BillingCity: null,
          },
        ],
      }),
    ),
    describe: vi.fn(
      async (): Promise<RawDescribe> => ({
        name: "Account",
        fields: [{ name: "Id", type: "id", nillable: false }],
      }),
    ),
    dml: vi.fn(async () => [{ id: "001", success: true }]),
    ...overrides,
  };
}

describe("FACADE_TOOLS", () => {
  it("exposes a tiny consolidated surface", () => {
    expect(FACADE_TOOLS.map((t) => t.name)).toEqual(["soql", "describe", "dml", "run_flow"]);
  });

  it("keeps each tool schema small (input-token budget)", () => {
    for (const t of FACADE_TOOLS) {
      const tokens = Math.ceil(JSON.stringify(t).length / 4);
      expect(tokens).toBeLessThan(160);
    }
  });
});

describe("validateSoql", () => {
  it("accepts a projection-explicit SELECT", () => {
    expect(() => validateSoql("SELECT Id, Name FROM Account")).not.toThrow();
  });
  it("rejects non-SELECT statements", () => {
    expect(() => validateSoql("DELETE FROM Account")).toThrow(ValidationError);
  });
  it("rejects SELECT *", () => {
    expect(() => validateSoql("SELECT * FROM Account")).toThrow(/explicit fields/);
  });
  it("rejects smuggled mutation keywords", () => {
    expect(() => validateSoql("SELECT Id FROM Account; DELETE x")).toThrow(ValidationError);
  });
});

describe("dispatch", () => {
  it("routes soql and shapes the response", async () => {
    const client = fakeClient();
    const { content } = await dispatch(client, "soql", { query: "SELECT Id, Name FROM Account" });
    expect(client.query).toHaveBeenCalledOnce();
    // attributes stripped, nulls dropped, columnar by default
    expect(content).toMatchObject({ n: 1, cols: ["Id", "Name"] });
  });

  it("validates before hitting the network", async () => {
    const client = fakeClient();
    await expect(dispatch(client, "soql", { query: "SELECT * FROM Account" })).rejects.toThrow(
      ValidationError,
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it("caches describe by sobject+detail (lever E)", async () => {
    const client = fakeClient();
    const cache = new Map<string, SlimDescribe | RawDescribe>();
    await dispatch(client, "describe", { sobject: "Account" }, { describeCache: cache });
    await dispatch(client, "describe", { sobject: "Account" }, { describeCache: cache });
    expect(client.describe).toHaveBeenCalledOnce(); // second call served from cache
    expect(cache.has("Account:slim")).toBe(true);
  });

  it("routes dml through to the client", async () => {
    const client = fakeClient();
    const { content } = await dispatch(client, "dml", {
      op: "create",
      sobject: "Account",
      records: [{ Name: "New" }],
    });
    expect(client.dml).toHaveBeenCalledWith("create", "Account", [{ Name: "New" }]);
    expect(content).toEqual([{ id: "001", success: true }]);
  });

  it("throws on unknown tools", async () => {
    await expect(dispatch(fakeClient(), "nope", {})).rejects.toThrow(/Unknown facade tool/);
  });
});
