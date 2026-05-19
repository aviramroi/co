/**
 * Assemble the single consolidated prompt handed to the cloud model.
 *
 * By the time this runs, all repository understanding has already been
 * gathered locally. The cloud model receives a self-contained brief and is
 * asked only to produce the actual actions (edits / commands / patch).
 */

import type { CollectedContext, FinalPrompt, HarnessBudgets } from "./types.ts";

const SYSTEM = `You are a senior coding agent. A local harness has already
searched the repository for you and assembled the relevant code below. Do not
ask for more files; work only from the provided context. Produce concrete,
ready-to-apply actions: unified diffs for edits, exact shell commands for the
rest. Be precise and minimal — change only what the task requires.`;

function fence(lang: string, body: string): string {
  const ticks = body.includes("```") ? "````" : "```";
  return `${ticks}${lang}\n${body}\n${ticks}`;
}

export function buildFinalPrompt(context: CollectedContext, budgets: HarnessBudgets): FinalPrompt {
  const header = [
    `# Task`,
    context.task,
    "",
    `# Repository context (collected locally, ${context.snippets.length} snippets, ${context.rounds} search rounds)`,
    context.truncated
      ? "_Note: context was truncated to fit the budget; highest-relevance snippets were kept._"
      : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const blocks: string[] = [];
  let used = header.length + SYSTEM.length;
  for (const s of context.snippets) {
    const lang = s.path.split(".").pop() ?? "";
    const block = [
      `## ${s.path} (lines ${s.startLine}-${s.endLine}) — via ${s.source}`,
      fence(lang, s.content),
      "",
    ].join("\n");
    if (used + block.length > budgets.maxPromptChars) {
      break;
    }
    blocks.push(block);
    used += block.length;
  }

  const footer = [
    "",
    "# Files in context",
    context.filesSeen.map((f) => `- ${f}`).join("\n"),
    "",
    "# Instructions",
    "Implement the task using ONLY the context above. Respond with:",
    "1. A short plan (max 5 bullets).",
    "2. Unified diffs for every file you change.",
    "3. Any shell commands to run, in order.",
  ].join("\n");

  const user = `${header}${blocks.join("\n")}${footer}`;
  return { system: SYSTEM, user, chars: SYSTEM.length + user.length };
}
