/**
 * Local repo search. Everything here runs on the local filesystem only —
 * no network calls. grep uses ripgrep when available and falls back to a
 * pure-Node scan so the harness works without external tools.
 */

import type { Dirent } from "node:fs";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { RepoFileSnippet, RepoSearchHit } from "./types.ts";

const execFileAsync = promisify(execFile);

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".cache",
  "coverage",
  ".turbo",
  ".venv",
  "vendor",
]);

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".toml",
  ".css",
  ".scss",
  ".html",
  ".sh",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".sql",
  ".txt",
  ".env",
]);

function isProbablyText(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  if (ext === "") {
    return true;
  } // Dockerfile, Makefile, LICENSE, ...
  return TEXT_EXT.has(ext);
}

/** Recursively list candidate text files under `repoDir` (relative paths). */
export async function walkRepoFiles(repoDir: string, limit = 20_000): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (out.length >= limit) {
      return;
    }
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) {
        return;
      }
      if (entry.name.startsWith(".") && entry.name !== ".env" && entry.name !== ".env.example") {
        if (entry.isDirectory()) {
          continue;
        }
      }
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        await walk(abs);
      } else if (entry.isFile() && isProbablyText(entry.name)) {
        out.push(path.relative(repoDir, abs));
      }
    }
  }
  await walk(repoDir);
  return out.toSorted();
}

/** Minimal glob: supports `*`, `**`, `?` and `{a,b}` alternation. */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") {
          i++;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
      } else {
        const alts = glob
          .slice(i + 1, end)
          .split(",")
          .map((a) => a.replace(/[.+^${}()|[\]\\]/g, "\\$&"));
        re += `(?:${alts.join("|")})`;
        i = end;
      }
    } else if (".+^$()|[]\\".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

export async function globRepo(
  repoDir: string,
  pattern: string,
  maxResults = 200,
): Promise<string[]> {
  const files = await walkRepoFiles(repoDir);
  const rx = globToRegExp(pattern.replace(/^\.?\//, ""));
  const matched: string[] = [];
  for (const f of files) {
    if (rx.test(f) || rx.test(path.basename(f))) {
      matched.push(f);
    }
    if (matched.length >= maxResults) {
      break;
    }
  }
  return matched;
}

async function ripgrepAvailable(): Promise<boolean> {
  try {
    await execFileAsync("rg", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function grepWithRipgrep(
  repoDir: string,
  pattern: string,
  scope: string | undefined,
  maxResults: number,
): Promise<RepoSearchHit[]> {
  const args = [
    "--no-heading",
    "--line-number",
    "--color=never",
    // Match the pure-Node fallback, which compiles patterns case-insensitively.
    "--ignore-case",
    "--max-count",
    String(Math.max(1, Math.ceil(maxResults / 4))),
    "--max-filesize",
    "1M",
  ];
  // Mirror the Node fallback's ignore list so both backends behave the same
  // even in repos without a .gitignore.
  for (const ignored of IGNORED_DIRS) {
    args.push("-g", `!**/${ignored}/**`);
  }
  // Always pass an explicit search path. Without one, ripgrep reads from
  // stdin (which is an open, never-closed pipe under execFile) and hangs.
  args.push("-e", pattern, ".");
  const cwd = scope ? path.join(repoDir, scope) : repoDir;
  const { stdout } = await execFileAsync("rg", args, {
    cwd,
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  }).catch((err: unknown) => {
    // rg exits 1 when there are no matches; treat that as empty output.
    const e = err as { code?: number; stdout?: string };
    if (e && e.code === 1) {
      return { stdout: e.stdout ?? "" };
    }
    throw err;
  });
  const hits: RepoSearchHit[] = [];
  for (const raw of stdout.split("\n")) {
    if (!raw) {
      continue;
    }
    const m = /^(.*?):(\d+):(.*)$/.exec(raw);
    if (!m) {
      continue;
    }
    const file = m[1].replace(/^\.[/\\]/, "");
    const rel = scope ? path.join(scope, file) : file;
    hits.push({ path: rel, line: Number(m[2]), text: m[3].slice(0, 400) });
    if (hits.length >= maxResults) {
      break;
    }
  }
  return hits;
}

function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
}

async function grepWithNode(
  repoDir: string,
  pattern: string,
  scope: string | undefined,
  maxResults: number,
): Promise<RepoSearchHit[]> {
  const rx = compilePattern(pattern);
  const root = scope ? path.join(repoDir, scope) : repoDir;
  const files = await walkRepoFiles(root);
  const hits: RepoSearchHit[] = [];
  for (const rel of files) {
    if (hits.length >= maxResults) {
      break;
    }
    const abs = path.join(root, rel);
    let content: string;
    try {
      const stat = await fs.stat(abs);
      if (stat.size > 1024 * 1024) {
        continue;
      }
      content = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length && hits.length < maxResults; i++) {
      if (rx.test(lines[i])) {
        const relPath = scope ? path.join(scope, rel) : rel;
        hits.push({ path: relPath, line: i + 1, text: lines[i].slice(0, 400) });
      }
    }
  }
  return hits;
}

export async function grepRepo(
  repoDir: string,
  pattern: string,
  opts: { scope?: string; maxResults?: number } = {},
): Promise<RepoSearchHit[]> {
  const maxResults = opts.maxResults ?? 60;
  if (await ripgrepAvailable()) {
    try {
      return await grepWithRipgrep(repoDir, pattern, opts.scope, maxResults);
    } catch {
      // Fall through to the pure-Node scanner.
    }
  }
  return grepWithNode(repoDir, pattern, opts.scope, maxResults);
}

/** Read a (optionally sliced) file into a snippet. Local filesystem only. */
export async function readSnippet(
  repoDir: string,
  relPath: string,
  opts: {
    startLine?: number;
    endLine?: number;
    maxFileBytes?: number;
    source?: string;
    score?: number;
  } = {},
): Promise<RepoFileSnippet | null> {
  const safeRel = path.normalize(relPath).replace(/^(\.\.[/\\])+/, "");
  const abs = path.resolve(repoDir, safeRel);
  if (!abs.startsWith(path.resolve(repoDir))) {
    return null;
  }
  let content: string;
  try {
    const stat = await fs.stat(abs);
    if (stat.size > (opts.maxFileBytes ?? 256 * 1024)) {
      const fh = await fs.open(abs, "r");
      try {
        const buf = Buffer.alloc(opts.maxFileBytes ?? 256 * 1024);
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        content = buf.subarray(0, bytesRead).toString("utf8");
      } finally {
        await fh.close();
      }
    } else {
      content = await fs.readFile(abs, "utf8");
    }
  } catch {
    return null;
  }
  const lines = content.split("\n");
  const start = Math.max(1, opts.startLine ?? 1);
  const end = Math.min(lines.length, opts.endLine ?? lines.length);
  const sliced = lines.slice(start - 1, end).join("\n");
  return {
    path: safeRel,
    startLine: start,
    endLine: end,
    content: sliced,
    score: opts.score ?? 0,
    source: opts.source ?? "read",
  };
}

/** Pull a focused window around a grep hit. */
export async function snippetAroundHit(
  repoDir: string,
  hit: RepoSearchHit,
  radius: number,
  opts: { maxFileBytes?: number; source?: string; score?: number } = {},
): Promise<RepoFileSnippet | null> {
  return readSnippet(repoDir, hit.path, {
    startLine: Math.max(1, hit.line - radius),
    endLine: hit.line + radius,
    maxFileBytes: opts.maxFileBytes,
    source: opts.source ?? `grep:${hit.line}`,
    score: opts.score ?? 0,
  });
}

/** Tokenize a free-text task into keyword-ish terms for ranking. */
export function taskTerms(task: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "is",
    "are",
    "be",
    "this",
    "that",
    "it",
    "as",
    "by",
    "at",
    "from",
    "add",
    "fix",
    "make",
    "use",
    "all",
    "new",
  ]);
  return Array.from(
    new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((t) => t.length >= 3 && !stop.has(t)),
    ),
  );
}

/** Score a snippet by term overlap with the task. Pure, deterministic. */
export function scoreSnippet(snippet: RepoFileSnippet, terms: string[]): number {
  if (terms.length === 0) {
    return snippet.score;
  }
  const hay = `${snippet.path}\n${snippet.content}`.toLowerCase();
  let score = snippet.score;
  for (const term of terms) {
    let idx = hay.indexOf(term);
    while (idx !== -1) {
      score += 1;
      idx = hay.indexOf(term, idx + term.length);
    }
  }
  // Light bias toward source files over generated/lock noise.
  if (/\.(test|spec)\./.test(snippet.path)) {
    score *= 0.6;
  }
  if (snippet.path.endsWith(".lock") || snippet.path.includes("lock")) {
    score *= 0.3;
  }
  return score;
}
