import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CloudActionClient, FinalPrompt, LocalModel } from "./types.ts";
import { collectContext } from "./context-collector.ts";
import { runHarness } from "./harness.ts";
import { HeuristicLocalModel } from "./local-model.ts";
import { DEFAULT_BUDGETS } from "./types.ts";

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-harness-"));
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "uploader.ts"),
    "export async function uploadFile(p: string) {\n  return fetch(p);\n}\n",
  );
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "fixture" }, null, 2));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("collectContext", () => {
  it("gathers repo snippets locally with the heuristic model", async () => {
    const ctx = await collectContext({
      repoDir: dir,
      task: "add a retry to uploadFile in the uploader",
      localModel: new HeuristicLocalModel(),
      budgets: DEFAULT_BUDGETS,
    });
    expect(ctx.snippets.length).toBeGreaterThan(0);
    expect(ctx.filesSeen.some((f) => f.includes("uploader.ts"))).toBe(true);
    expect(ctx.searchLog.length).toBeGreaterThan(0);
  });
});

describe("runHarness", () => {
  it("calls the cloud client exactly once and only after collection", async () => {
    const order: string[] = [];
    const localModel: LocalModel = {
      name: "stub",
      async planSearches(input) {
        order.push(`plan:${input.round}`);
        if (input.round === 1) {
          return {
            queries: [{ kind: "grep", pattern: "uploadFile" }],
            done: false,
            reason: "find uploader",
          };
        }
        return { queries: [], done: true, reason: "enough" };
      },
    };
    const proposeActions = vi.fn(async (p: FinalPrompt) => {
      order.push("cloud");
      return { model: "spy", text: `ok ${p.chars}` };
    });
    const cloud: CloudActionClient = { name: "spy", proposeActions };

    const result = await runHarness({
      repoDir: dir,
      task: "add retry to uploadFile",
      localModel,
      cloudClient: cloud,
    });

    expect(proposeActions).toHaveBeenCalledTimes(1);
    // Cloud is the very last step, after every local plan round.
    expect(order[order.length - 1]).toBe("cloud");
    expect(order.filter((o) => o === "cloud")).toHaveLength(1);
    expect(result.stats.cloudCalled).toBe(true);
    expect(result.actions?.text).toContain("ok");
  });

  it("does not touch the cloud client on a dry run", async () => {
    const proposeActions = vi.fn(async () => ({ model: "spy", text: "nope" }));
    const cloud: CloudActionClient = { name: "spy", proposeActions };
    const result = await runHarness({
      repoDir: dir,
      task: "inspect uploader",
      localModel: new HeuristicLocalModel(),
      cloudClient: cloud,
      dryRun: true,
    });
    expect(proposeActions).not.toHaveBeenCalled();
    expect(result.stats.cloudCalled).toBe(false);
    expect(result.prompt.user).toContain("# Task");
  });

  it("skips the cloud step entirely when no client is given", async () => {
    const result = await runHarness({
      repoDir: dir,
      task: "inspect uploader",
      localModel: new HeuristicLocalModel(),
    });
    expect(result.actions).toBeUndefined();
    expect(result.stats.cloudCalled).toBe(false);
    expect(result.prompt.chars).toBeGreaterThan(0);
  });
});
