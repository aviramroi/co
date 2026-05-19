/**
 * The local collection loop.
 *
 * This module is intentionally cloud-free: it has no reference to any
 * CloudActionClient and performs zero network I/O. The local model proposes
 * searches; the harness runs them against the local filesystem; relevant
 * slices accumulate until the model says "done" or budgets are hit.
 */

import path from "node:path";
import type {
  CollectedContext,
  HarnessBudgets,
  LocalModel,
  Logger,
  RepoFileSnippet,
  SearchLogEntry,
  SearchQuery,
} from "./types.ts";
import {
  globRepo,
  grepRepo,
  readSnippet,
  scoreSnippet,
  snippetAroundHit,
  taskTerms,
} from "./repo-search.ts";

const HIT_RADIUS = 8;

function snippetKey(s: RepoFileSnippet): string {
  return `${s.path}:${s.startLine}-${s.endLine}`;
}

function mergeSnippet(map: Map<string, RepoFileSnippet>, snippet: RepoFileSnippet): void {
  const key = snippetKey(snippet);
  const existing = map.get(key);
  if (!existing || snippet.score > existing.score) {
    map.set(key, snippet);
  }
}

async function runQuery(
  repoDir: string,
  query: SearchQuery,
  budgets: HarnessBudgets,
  terms: string[],
  out: Map<string, RepoFileSnippet>,
): Promise<number> {
  if (query.kind === "read") {
    const snippet = await readSnippet(repoDir, query.pattern, {
      startLine: query.startLine,
      endLine: query.endLine,
      maxFileBytes: budgets.maxFileBytes,
      source: query.reason ? `read:${query.reason}` : "read",
    });
    if (!snippet) {
      return 0;
    }
    snippet.score = scoreSnippet(snippet, terms) + 2; // explicit reads are valued
    mergeSnippet(out, snippet);
    return 1;
  }

  if (query.kind === "glob") {
    const files = await globRepo(repoDir, query.pattern, Math.min(query.maxResults ?? 50, 200));
    let added = 0;
    for (const file of files) {
      const snippet = await readSnippet(repoDir, file, {
        maxFileBytes: Math.min(budgets.maxFileBytes, 16 * 1024),
        endLine: 200,
        source: `glob:${query.pattern}`,
      });
      if (!snippet) {
        continue;
      }
      snippet.score = scoreSnippet(snippet, terms);
      mergeSnippet(out, snippet);
      added++;
    }
    return added;
  }

  // grep
  const hits = await grepRepo(repoDir, query.pattern, {
    scope: query.path,
    maxResults: Math.min(query.maxResults ?? budgets.maxHitsPerSearch, budgets.maxHitsPerSearch),
  });
  let added = 0;
  for (const hit of hits) {
    const snippet = await snippetAroundHit(repoDir, hit, HIT_RADIUS, {
      maxFileBytes: budgets.maxFileBytes,
      source: `grep:${query.pattern}`,
    });
    if (!snippet) {
      continue;
    }
    snippet.score = scoreSnippet(snippet, terms) + 1;
    mergeSnippet(out, snippet);
    added++;
  }
  return added;
}

function summarize(snippets: RepoFileSnippet[], max = 30): string {
  return snippets
    .slice(0, max)
    .map((s) => `- ${s.path}:${s.startLine}-${s.endLine} (score ${s.score.toFixed(1)})`)
    .join("\n");
}

export async function collectContext(args: {
  repoDir: string;
  task: string;
  localModel: LocalModel;
  budgets: HarnessBudgets;
  logger?: Logger;
}): Promise<CollectedContext> {
  const { repoDir, task, localModel, budgets, logger } = args;
  const terms = taskTerms(task);
  const snippetMap = new Map<string, RepoFileSnippet>();
  const searchLog: SearchLogEntry[] = [];
  let truncated = false;
  let round = 0;

  while (round < budgets.maxRounds) {
    round++;
    const ranked = [...snippetMap.values()].toSorted((a, b) => b.score - a.score);
    const plan = await localModel.planSearches({
      task,
      round,
      contextSummary: summarize(ranked),
      filesSeen: [...new Set(ranked.map((s) => s.path))],
    });
    logger?.("collector.plan", {
      round,
      queries: plan.queries.length,
      done: plan.done,
      reason: plan.reason,
    });

    for (const query of plan.queries) {
      const hits = await runQuery(repoDir, query, budgets, terms, snippetMap);
      searchLog.push({ round, query, hits, reason: query.reason });
      logger?.("collector.search", {
        round,
        kind: query.kind,
        pattern: query.pattern,
        hits,
      });
      if (snippetMap.size >= budgets.maxSnippets * 3) {
        truncated = true;
        break;
      }
    }

    if (plan.done) {
      break;
    }
    if (truncated) {
      break;
    }
    if (plan.queries.length === 0) {
      break;
    }
  }

  if (round >= budgets.maxRounds) {
    truncated = true;
  }

  const snippets = [...snippetMap.values()]
    .toSorted((a, b) => b.score - a.score)
    .slice(0, budgets.maxSnippets);
  const filesSeen = [...new Set(snippets.map((s) => path.normalize(s.path)))].toSorted();

  return {
    task,
    repoDir,
    snippets,
    filesSeen,
    searchLog,
    rounds: round,
    truncated,
  };
}
