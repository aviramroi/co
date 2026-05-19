/**
 * The harness: local context collection -> single consolidated prompt ->
 * (optionally) one cloud round-trip for the actual actions.
 *
 * Invariant: the cloud client is touched only in the final step, and only
 * once. Everything before it is local and offline.
 */

import type { HarnessBudgets, HarnessOptions, HarnessResult } from "./types.ts";
import { collectContext } from "./context-collector.ts";
import { buildFinalPrompt } from "./prompt.ts";
import { DEFAULT_BUDGETS } from "./types.ts";

function resolveBudgets(partial?: Partial<HarnessBudgets>): HarnessBudgets {
  return { ...DEFAULT_BUDGETS, ...partial };
}

export async function runHarness(opts: HarnessOptions): Promise<HarnessResult> {
  const budgets = resolveBudgets(opts.budgets);
  const logger = opts.logger;

  // 1. Collect everything locally. No network here by construction:
  //    collectContext has no access to opts.cloudClient.
  logger?.("harness.collect.start", { repoDir: opts.repoDir });
  const context = await collectContext({
    repoDir: opts.repoDir,
    task: opts.task,
    localModel: opts.localModel,
    budgets,
    logger,
  });
  logger?.("harness.collect.done", {
    snippets: context.snippets.length,
    rounds: context.rounds,
    truncated: context.truncated,
  });

  // 2. Assemble the single consolidated prompt locally.
  const prompt = buildFinalPrompt(context, budgets);
  logger?.("harness.prompt", { chars: prompt.chars });

  // 3. The one and only cloud round-trip — skipped on dry runs or when no
  //    client was provided.
  let actions: HarnessResult["actions"];
  const willCallCloud = Boolean(opts.cloudClient) && !opts.dryRun;
  if (willCallCloud && opts.cloudClient) {
    logger?.("harness.cloud.start", { client: opts.cloudClient.name });
    actions = await opts.cloudClient.proposeActions(prompt);
    logger?.("harness.cloud.done", { model: actions.model });
  } else {
    logger?.("harness.cloud.skipped", { dryRun: Boolean(opts.dryRun) });
  }

  return {
    context,
    prompt,
    actions,
    stats: {
      rounds: context.rounds,
      searches: context.searchLog.length,
      snippets: context.snippets.length,
      promptChars: prompt.chars,
      truncated: context.truncated,
      cloudCalled: Boolean(actions),
    },
  };
}
