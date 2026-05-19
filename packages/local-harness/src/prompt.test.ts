import { describe, expect, it } from "vitest";
import type { CollectedContext } from "./types.ts";
import { buildFinalPrompt } from "./prompt.ts";
import { DEFAULT_BUDGETS } from "./types.ts";

function ctx(overrides: Partial<CollectedContext> = {}): CollectedContext {
  return {
    task: "do the thing",
    repoDir: "/repo",
    snippets: [
      {
        path: "src/a.ts",
        startLine: 1,
        endLine: 3,
        content: "line1\nline2\nline3",
        score: 9,
        source: "grep:thing",
      },
    ],
    filesSeen: ["src/a.ts"],
    searchLog: [],
    rounds: 2,
    truncated: false,
    ...overrides,
  };
}

describe("buildFinalPrompt", () => {
  it("includes task, snippets, file list, and instructions", () => {
    const p = buildFinalPrompt(ctx(), DEFAULT_BUDGETS);
    expect(p.user).toContain("# Task");
    expect(p.user).toContain("do the thing");
    expect(p.user).toContain("src/a.ts (lines 1-3)");
    expect(p.user).toContain("# Files in context");
    expect(p.user).toContain("# Instructions");
    expect(p.chars).toBe(p.system.length + p.user.length);
  });

  it("respects the prompt char budget by dropping low-priority snippets", () => {
    const big = "x".repeat(5_000);
    const many = Array.from({ length: 20 }, (_, i) => ({
      path: `src/f${i}.ts`,
      startLine: 1,
      endLine: 1,
      content: big,
      score: 20 - i,
      source: "grep",
    }));
    const p = buildFinalPrompt(ctx({ snippets: many }), {
      ...DEFAULT_BUDGETS,
      maxPromptChars: 12_000,
    });
    expect(p.chars).toBeLessThanOrEqual(12_000 + 2_000);
    // The highest-scored snippet must survive truncation.
    expect(p.user).toContain("src/f0.ts");
  });

  it("notes truncation when context was cut", () => {
    const p = buildFinalPrompt(ctx({ truncated: true }), DEFAULT_BUDGETS);
    expect(p.user).toContain("truncated");
  });
});
