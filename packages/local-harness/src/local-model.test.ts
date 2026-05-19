import { describe, expect, it } from "vitest";
import { HeuristicLocalModel, loadLocalModel } from "./local-model.ts";

describe("HeuristicLocalModel", () => {
  it("emits keyword greps on round 1 and finishes deterministically", async () => {
    const m = new HeuristicLocalModel();
    const r1 = await m.planSearches({
      task: "add a retry to the uploader fetch",
      round: 1,
      contextSummary: "",
      filesSeen: [],
    });
    expect(r1.done).toBe(false);
    expect(r1.queries.some((q) => q.kind === "grep" && q.pattern === "retry")).toBe(true);
    expect(r1.queries.some((q) => q.kind === "glob")).toBe(true);

    const r3 = await m.planSearches({
      task: "add a retry to the uploader fetch",
      round: 3,
      contextSummary: "stuff",
      filesSeen: ["src/uploader.ts"],
    });
    expect(r3.done).toBe(true);
    expect(r3.queries).toHaveLength(0);
  });

  it("only ever proposes local searches (no network kinds)", async () => {
    const m = new HeuristicLocalModel();
    for (const round of [1, 2, 3]) {
      const plan = await m.planSearches({
        task: "wire up the gateway client",
        round,
        contextSummary: "",
        filesSeen: [],
      });
      for (const q of plan.queries) {
        expect(["grep", "glob", "read"]).toContain(q.kind);
      }
    }
  });
});

describe("loadLocalModel", () => {
  it("returns the heuristic model when no model path is given", async () => {
    const m = await loadLocalModel();
    expect(m.name).toBe("heuristic-local");
  });

  it("falls back to heuristic when the GGUF path cannot be loaded", async () => {
    const m = await loadLocalModel({ modelPath: "/definitely/not/a/model.gguf" });
    expect(m.name).toBe("heuristic-local");
  });
});
