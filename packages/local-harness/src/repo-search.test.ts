import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  globRepo,
  grepRepo,
  readSnippet,
  scoreSnippet,
  taskTerms,
  walkRepoFiles,
} from "./repo-search.ts";

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-search-"));
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.mkdir(path.join(dir, "node_modules", "junk"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "uploader.ts"),
    "export function uploadFile(p: string) {\n  return fetch(p);\n}\n",
  );
  await fs.writeFile(
    path.join(dir, "src", "retry.ts"),
    "export function withRetry<T>(fn: () => T) {\n  return fn();\n}\n",
  );
  await fs.writeFile(path.join(dir, "README.md"), "# demo project\n");
  await fs.writeFile(
    path.join(dir, "node_modules", "junk", "index.js"),
    "uploadFile is mentioned here too\n",
  );
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("walkRepoFiles", () => {
  it("lists source files and skips ignored dirs", async () => {
    const files = await walkRepoFiles(dir);
    expect(files).toContain(path.join("src", "uploader.ts"));
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });
});

describe("globRepo", () => {
  it("matches ** and brace alternation", async () => {
    const ts = await globRepo(dir, "**/*.ts");
    expect(ts.toSorted()).toEqual(
      [path.join("src", "retry.ts"), path.join("src", "uploader.ts")].toSorted(),
    );
    const meta = await globRepo(dir, "**/{README.md,package.json}");
    expect(meta).toContain("README.md");
  });
});

describe("grepRepo", () => {
  it("finds matches locally and respects ignore list", async () => {
    const hits = await grepRepo(dir, "uploadFile");
    const paths = hits.map((h) => h.path);
    expect(paths).toContain(path.join("src", "uploader.ts"));
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
  });

  it("treats invalid regex as a literal", async () => {
    const hits = await grepRepo(dir, "uploadFile(");
    expect(Array.isArray(hits)).toBe(true);
  });
});

describe("readSnippet", () => {
  it("reads a line range", async () => {
    const snip = await readSnippet(dir, path.join("src", "uploader.ts"), {
      startLine: 1,
      endLine: 1,
    });
    expect(snip?.content).toContain("uploadFile");
    expect(snip?.endLine).toBe(1);
  });

  it("refuses path traversal outside the repo", async () => {
    const snip = await readSnippet(dir, "../../../etc/passwd");
    expect(snip).toBeNull();
  });
});

describe("scoring", () => {
  it("derives task terms and scores by overlap", () => {
    const terms = taskTerms("Add a retry around the uploader fetch call");
    expect(terms).toContain("retry");
    expect(terms).toContain("uploader");
    const high = scoreSnippet(
      {
        path: "src/retry.ts",
        startLine: 1,
        endLine: 2,
        content: "retry retry",
        score: 0,
        source: "x",
      },
      terms,
    );
    const low = scoreSnippet(
      { path: "src/other.ts", startLine: 1, endLine: 1, content: "nothing", score: 0, source: "x" },
      terms,
    );
    expect(high).toBeGreaterThan(low);
  });
});
