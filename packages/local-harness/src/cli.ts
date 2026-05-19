/**
 * CLI for the local-model coding-agent harness.
 *
 *   local-harness --task "add a retry to the uploader" [--repo .] \
 *     [--model /path/to/model.gguf] [--dry-run] [--json]
 *
 * Without --model the deterministic local planner is used. Without an API
 * key (or with --dry-run) the cloud step is skipped and the assembled prompt
 * is printed — proving the whole search phase ran locally.
 */

import type { CloudActionClient, Logger } from "./types.ts";
import { AnthropicCloudClient, EchoCloudClient } from "./cloud-actions.ts";
import { runHarness } from "./harness.ts";
import { loadLocalModel } from "./local-model.ts";
import { DEFAULT_BUDGETS } from "./types.ts";

interface CliArgs {
  task?: string;
  repo: string;
  model?: string;
  dryRun: boolean;
  json: boolean;
  verbose: boolean;
  cloudModel?: string;
  maxRounds?: number;
  maxSnippets?: number;
  maxChars?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { repo: process.cwd(), dryRun: false, json: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => argv[++i] ?? "";
    switch (a) {
      case "--task":
      case "-t":
        args.task = next();
        break;
      case "--repo":
      case "-r":
        args.repo = next();
        break;
      case "--model":
      case "-m":
        args.model = next();
        break;
      case "--cloud-model":
        args.cloudModel = next();
        break;
      case "--max-rounds":
        args.maxRounds = Number(next());
        break;
      case "--max-snippets":
        args.maxSnippets = Number(next());
        break;
      case "--max-chars":
        args.maxChars = Number(next());
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--verbose":
      case "-v":
        args.verbose = true;
        break;
      case "--help":
      case "-h":
        args.task = undefined;
        return args;
      default:
        if (!a.startsWith("-") && !args.task) {
          args.task = a;
        }
    }
  }
  return args;
}

const HELP = `local-harness — local-model coding-agent harness

All repository search runs locally. The cloud LLM API is called at most once,
after the full prompt has been assembled.

Usage:
  local-harness --task "<what to do>" [options]

Options:
  -t, --task <text>       Task description (required)
  -r, --repo <dir>        Repo root to search (default: cwd)
  -m, --model <gguf>      Local GGUF model for planning (default: heuristic)
      --cloud-model <id>  Cloud model id (default: claude-opus-4-7)
      --max-rounds <n>    Max local planning rounds
      --max-snippets <n>  Max snippets in the prompt
      --max-chars <n>     Max prompt size in characters
      --dry-run           Collect + build prompt locally, skip the cloud call
      --json              Emit machine-readable JSON
  -v, --verbose           Print harness events to stderr
  -h, --help              Show this help

Env:
  ANTHROPIC_API_KEY       Enables the real cloud step (otherwise dry-run)`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if (!args.task) {
    process.stdout.write(`${HELP}\n`);
    return argv.includes("--help") || argv.includes("-h") ? 0 : 1;
  }

  const logger: Logger | undefined = args.verbose
    ? (event, detail) => process.stderr.write(`[${event}] ${JSON.stringify(detail ?? {})}\n`)
    : undefined;

  const localModel = await loadLocalModel({ modelPath: args.model, logger });

  let cloudClient: CloudActionClient;
  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  if (args.dryRun || !hasApiKey) {
    cloudClient = new EchoCloudClient();
    if (!hasApiKey && !args.dryRun) {
      process.stderr.write("No ANTHROPIC_API_KEY set — running dry (prompt only).\n");
    }
  } else {
    cloudClient = new AnthropicCloudClient({ model: args.cloudModel });
  }

  const result = await runHarness({
    repoDir: args.repo,
    task: args.task,
    localModel,
    cloudClient,
    dryRun: args.dryRun,
    logger,
    budgets: {
      ...DEFAULT_BUDGETS,
      ...(args.maxRounds ? { maxRounds: args.maxRounds } : {}),
      ...(args.maxSnippets ? { maxSnippets: args.maxSnippets } : {}),
      ...(args.maxChars ? { maxPromptChars: args.maxChars } : {}),
    },
  });

  await localModel.dispose?.();

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          stats: result.stats,
          filesSeen: result.context.filesSeen,
          searchLog: result.context.searchLog,
          actions: result.actions,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  process.stdout.write(
    `\nLocal model:   ${localModel.name}\n` +
      `Search rounds: ${result.stats.rounds}\n` +
      `Local searches:${result.stats.searches}\n` +
      `Snippets:      ${result.stats.snippets}\n` +
      `Prompt size:   ${result.stats.promptChars} chars\n` +
      `Cloud called:  ${result.stats.cloudCalled}\n\n`,
  );
  if (result.actions) {
    process.stdout.write(`--- actions (${result.actions.model}) ---\n${result.actions.text}\n`);
  } else {
    process.stdout.write(`--- assembled prompt (not sent) ---\n${result.prompt.user}\n`);
  }
  return 0;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      process.exit(1);
    },
  );
}
