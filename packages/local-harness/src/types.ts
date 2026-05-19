/**
 * Shared types for the local-model coding-agent harness.
 *
 * Design contract:
 *  - The *local model* drives context collection. It only ever asks for
 *    local searches; it never reaches the network.
 *  - All repo search (grep / glob / file read) is executed locally.
 *  - The *cloud* LLM API is invoked at most once, after the full prompt has
 *    been assembled, to produce the actual actions.
 */

export type SearchKind = "grep" | "glob" | "read";

/** A single search the local model asked the harness to run locally. */
export interface SearchQuery {
  kind: SearchKind;
  /** grep: regex/literal; glob: glob pattern; read: relative file path. */
  pattern: string;
  /** Optional sub-path to scope a grep/glob to. */
  path?: string;
  /** For `read`: 1-based inclusive start line. */
  startLine?: number;
  /** For `read`: 1-based inclusive end line. */
  endLine?: number;
  /** Cap on results for grep/glob. */
  maxResults?: number;
  /** Why the local model wants this search (for logs / prompt provenance). */
  reason?: string;
}

/** One grep match found locally. */
export interface RepoSearchHit {
  path: string;
  line: number;
  text: string;
}

/** A ranked slice of a file gathered locally for the final prompt. */
export interface RepoFileSnippet {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  /** Relevance score (higher = more relevant to the task). */
  score: number;
  /** Where this snippet came from (the search that surfaced it). */
  source: string;
}

export interface SearchLogEntry {
  round: number;
  query: SearchQuery;
  hits: number;
  reason?: string;
}

/** Everything gathered locally, ready to be turned into a prompt. */
export interface CollectedContext {
  task: string;
  repoDir: string;
  snippets: RepoFileSnippet[];
  filesSeen: string[];
  searchLog: SearchLogEntry[];
  rounds: number;
  /** True if budgets forced collection to stop before the model said "done". */
  truncated: boolean;
}

export interface SearchPlan {
  /** Searches to run locally this round. */
  queries: SearchQuery[];
  /** When true, the local model believes it has enough context. */
  done: boolean;
  /** Short rationale, surfaced in logs and the final prompt. */
  reason: string;
}

export interface PlanInput {
  task: string;
  round: number;
  /** Compact summary of what has been collected so far. */
  contextSummary: string;
  /** Files already pulled into context (so the model can avoid repeats). */
  filesSeen: string[];
}

/**
 * The local harness brain. Implementations must be fully local — a
 * conforming implementation MUST NOT perform any network I/O.
 */
export interface LocalModel {
  readonly name: string;
  planSearches(input: PlanInput): Promise<SearchPlan>;
  /** Optional resource cleanup (e.g. free a llama.cpp context). */
  dispose?(): Promise<void>;
}

export interface FinalPrompt {
  system: string;
  user: string;
  /** Approximate character count of system + user. */
  chars: number;
}

export interface CloudActionResult {
  model: string;
  text: string;
  raw?: unknown;
}

/**
 * The single cloud round-trip. This is the *only* component allowed to do
 * network I/O, and the harness calls it at most once per run.
 */
export interface CloudActionClient {
  readonly name: string;
  proposeActions(prompt: FinalPrompt): Promise<CloudActionResult>;
}

export interface HarnessBudgets {
  /** Max local planning rounds. */
  maxRounds: number;
  /** Max snippets kept in the final prompt. */
  maxSnippets: number;
  /** Hard cap on bytes read from any single file. */
  maxFileBytes: number;
  /** Hard cap on the assembled prompt size (system + user), in chars. */
  maxPromptChars: number;
  /** Per-grep result cap. */
  maxHitsPerSearch: number;
}

export const DEFAULT_BUDGETS: HarnessBudgets = {
  maxRounds: 6,
  maxSnippets: 40,
  maxFileBytes: 256 * 1024,
  maxPromptChars: 120_000,
  maxHitsPerSearch: 60,
};

export type Logger = (event: string, detail?: Record<string, unknown>) => void;

export interface HarnessOptions {
  repoDir: string;
  task: string;
  localModel: LocalModel;
  /** Omitted (or with `dryRun`) => the cloud step is skipped. */
  cloudClient?: CloudActionClient;
  budgets?: Partial<HarnessBudgets>;
  logger?: Logger;
  /** Collect + build the prompt locally, but do not call the cloud client. */
  dryRun?: boolean;
}

export interface HarnessStats {
  rounds: number;
  searches: number;
  snippets: number;
  promptChars: number;
  truncated: boolean;
  cloudCalled: boolean;
}

export interface HarnessResult {
  context: CollectedContext;
  prompt: FinalPrompt;
  actions?: CloudActionResult;
  stats: HarnessStats;
}
