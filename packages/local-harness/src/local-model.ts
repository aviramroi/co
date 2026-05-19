/**
 * Local harness "brain".
 *
 * Two implementations:
 *  - HeuristicLocalModel: deterministic, dependency-free planner. Works
 *    offline, is fully testable, and is the default fallback.
 *  - LlamaLocalModel: runs a local GGUF model via node-llama-cpp and asks
 *    it (in JSON) which local searches to run next.
 *
 * Neither implementation performs any network I/O. They only ever emit
 * SearchQuery objects that the harness executes against the local FS.
 */

import type { LocalModel, PlanInput, SearchPlan, SearchQuery } from "./types.ts";
import { taskTerms } from "./repo-search.ts";

/**
 * Deterministic planner. Strategy:
 *   round 1: grep the repo for each salient task term + glob obvious files
 *   round 2: read the files that the round-1 greps surfaced (handled by the
 *            collector promoting hits to reads), then declare done
 */
export class HeuristicLocalModel implements LocalModel {
  readonly name = "heuristic-local";

  async planSearches(input: PlanInput): Promise<SearchPlan> {
    const terms = taskTerms(input.task);
    if (input.round === 1) {
      const queries: SearchQuery[] = terms.slice(0, 6).map((t) => ({
        kind: "grep",
        pattern: t,
        maxResults: 40,
        reason: `task keyword "${t}"`,
      }));
      // Common entrypoints worth pulling in regardless of keywords.
      queries.push({
        kind: "glob",
        pattern: "**/{package.json,README.md,tsconfig.json}",
        maxResults: 10,
        reason: "project metadata",
      });
      return {
        queries,
        done: queries.length === 0,
        reason: "initial keyword sweep of the repository",
      };
    }
    if (input.round === 2 && terms.length > 0) {
      // Second pass: widen with identifier-style camelCase/underscore variants.
      const variants = terms.slice(0, 4).map((t) => ({
        kind: "grep" as const,
        pattern: `${t}[A-Za-z0-9_]*`,
        maxResults: 25,
        reason: `widen "${t}"`,
      }));
      return {
        queries: variants,
        done: false,
        reason: "widen search around the most relevant identifiers",
      };
    }
    return { queries: [], done: true, reason: "heuristic budget exhausted" };
  }
}

interface LlamaChatSession {
  prompt(text: string, opts?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

interface LlamaContext {
  getSequence(): unknown;
  dispose?(): Promise<void> | void;
}

interface LlamaModel {
  createContext(opts?: { contextSize?: number }): Promise<LlamaContext>;
  dispose?(): Promise<void> | void;
}

interface NodeLlamaCpp {
  getLlama(params: { logLevel?: number }): Promise<{
    loadModel(params: { modelPath: string }): Promise<LlamaModel>;
  }>;
  LlamaChatSession: new (params: {
    contextSequence: unknown;
    systemPrompt?: string;
  }) => LlamaChatSession;
}

const PLANNER_SYSTEM = `You are the local search planner for a coding agent.
You CANNOT edit files or run commands. You only decide which LOCAL searches
to run so a downstream model gets a complete, focused context.
Reply with ONLY a JSON object, no prose:
{"queries":[{"kind":"grep|glob|read","pattern":"...","path":"optional","reason":"..."}],"done":boolean,"reason":"..."}
Use "grep" for code/identifier search, "glob" to list files, "read" to pull a
specific file into context. Set "done": true once the gathered context is
enough to implement the task. Keep queries minimal and high-signal.`;

function parsePlan(raw: string): SearchPlan | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const rawQueries: unknown[] = Array.isArray(obj.queries) ? (obj.queries as unknown[]) : [];
  const queries: SearchQuery[] = [];
  for (const q of rawQueries) {
    if (typeof q !== "object" || q === null) {
      continue;
    }
    const qq = q as Record<string, unknown>;
    const kind = qq.kind;
    const pattern = qq.pattern;
    if (
      (kind === "grep" || kind === "glob" || kind === "read") &&
      typeof pattern === "string" &&
      pattern.length > 0
    ) {
      queries.push({
        kind,
        pattern,
        path: typeof qq.path === "string" ? qq.path : undefined,
        reason: typeof qq.reason === "string" ? qq.reason : undefined,
      });
    }
  }
  return {
    queries,
    done: obj.done === true,
    reason: typeof obj.reason === "string" ? obj.reason : "local model plan",
  };
}

/**
 * GGUF-backed planner. Falls back to the heuristic planner if the model
 * returns something we cannot parse, so a weak local model never stalls.
 */
export class LlamaLocalModel implements LocalModel {
  readonly name: string;
  private readonly session: LlamaChatSession;
  private readonly model: LlamaModel;
  private readonly context: LlamaContext;
  private readonly fallback = new HeuristicLocalModel();

  private constructor(
    modelPath: string,
    model: LlamaModel,
    context: LlamaContext,
    session: LlamaChatSession,
  ) {
    this.name = `llama:${modelPath.split(/[/\\]/).pop() ?? modelPath}`;
    this.model = model;
    this.context = context;
    this.session = session;
  }

  static async create(modelPath: string): Promise<LlamaLocalModel> {
    // Non-literal specifier so this stays an optional, lazy dependency and
    // TypeScript does not hard-require its types at build time.
    const specifier: string = "node-llama-cpp";
    const mod = (await import(specifier)) as unknown as NodeLlamaCpp;
    const llama = await mod.getLlama({ logLevel: 0 });
    const model = await llama.loadModel({ modelPath });
    const context = await model.createContext({ contextSize: 8192 });
    const session = new mod.LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: PLANNER_SYSTEM,
    });
    return new LlamaLocalModel(modelPath, model, context, session);
  }

  async planSearches(input: PlanInput): Promise<SearchPlan> {
    const prompt = [
      `TASK: ${input.task}`,
      `ROUND: ${input.round}`,
      `FILES ALREADY IN CONTEXT (${input.filesSeen.length}): ${input.filesSeen.slice(0, 40).join(", ") || "none"}`,
      "",
      "CONTEXT SUMMARY:",
      input.contextSummary || "(empty)",
      "",
      "Return the JSON plan for the next local searches.",
    ].join("\n");
    let raw: string;
    try {
      raw = await this.session.prompt(prompt, { maxTokens: 512, temperature: 0 });
    } catch {
      return this.fallback.planSearches(input);
    }
    const plan = parsePlan(raw);
    if (!plan || (plan.queries.length === 0 && !plan.done)) {
      return this.fallback.planSearches(input);
    }
    return plan;
  }

  async dispose(): Promise<void> {
    await this.context.dispose?.();
    await this.model.dispose?.();
  }
}

export interface LoadLocalModelOptions {
  /** Path to a local GGUF model. If omitted, the heuristic model is used. */
  modelPath?: string;
  /** Print why a fallback happened. */
  logger?: (event: string, detail?: Record<string, unknown>) => void;
}

/**
 * Resolve a local model. Prefers a real GGUF model when a path is given and
 * node-llama-cpp is installed; otherwise returns the deterministic heuristic
 * planner so the harness always has a working local brain.
 */
export async function loadLocalModel(opts: LoadLocalModelOptions = {}): Promise<LocalModel> {
  if (!opts.modelPath) {
    return new HeuristicLocalModel();
  }
  try {
    return await LlamaLocalModel.create(opts.modelPath);
  } catch (err) {
    opts.logger?.("local-model.fallback", {
      reason: err instanceof Error ? err.message : String(err),
    });
    return new HeuristicLocalModel();
  }
}
