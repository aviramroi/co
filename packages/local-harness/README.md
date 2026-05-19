# @openclaw/local-harness

A coding-agent harness driven by a **local model**. All repository search and
context gathering happens locally; the cloud LLM API is called **at most
once**, after the full prompt has been assembled.

## Why

Cloud coding agents burn tokens (and money, and latency) doing iterative
`grep` / `read` round-trips just to _find_ the relevant code. That part is
cheap to do locally. This package splits the agent into two phases:

1. **Local phase (free, offline).** A local model — either a deterministic
   heuristic planner or a GGUF model via `node-llama-cpp` — decides which
   searches to run. The harness executes them against the local filesystem
   (ripgrep, with a pure-Node fallback) and accumulates ranked snippets until
   the local model says it has enough.
2. **Cloud phase (one shot).** The collected context is turned into a single
   consolidated prompt and sent to the cloud model **once**, only to produce
   the actual actions (diffs, commands).

The cloud client is the only component that performs network I/O, and the
harness invokes it exactly once per run — never during search.

## Architecture

```
task ─▶ LocalModel.planSearches ──▶ repo-search (grep/glob/read, LOCAL)
            ▲                              │
            └──────── collectContext ◀─────┘   (loop, no network)
                          │
                          ▼
                 buildFinalPrompt  (one consolidated prompt)
                          │
                          ▼
              CloudActionClient.proposeActions   ◀── the ONLY network call
```

| File                   | Responsibility                                 |
| ---------------------- | ---------------------------------------------- |
| `repo-search.ts`       | Local grep/glob/read + ranking. No network.    |
| `local-model.ts`       | Heuristic + llama.cpp planners. No network.    |
| `context-collector.ts` | The local search loop. Has no cloud reference. |
| `prompt.ts`            | Assembles the single cloud prompt.             |
| `cloud-actions.ts`     | The only network component (Anthropic / echo). |
| `harness.ts`           | Orchestrates the phases; one cloud call max.   |
| `cli.ts`               | `local-harness` command.                       |

## Usage

```bash
pnpm --filter @openclaw/local-harness build

# Heuristic planner, dry run — prints the locally assembled prompt, no API call
local-harness --task "add a retry around uploadFile" --repo . --dry-run

# Use a local GGUF model as the planner
local-harness -t "wire telemetry into the gateway" -m ~/models/qwen.gguf

# Real run (needs ANTHROPIC_API_KEY) — collection still 100% local
ANTHROPIC_API_KEY=... local-harness -t "fix the flaky retry test" --json
```

Without `ANTHROPIC_API_KEY` (or with `--dry-run`) the cloud step is skipped
and the assembled prompt is printed, which is also the easiest way to verify
that the entire search phase ran locally.

### Library

```ts
import { runHarness, loadLocalModel, AnthropicCloudClient } from "@openclaw/local-harness";

const localModel = await loadLocalModel({ modelPath: process.env.GGUF });
const result = await runHarness({
  repoDir: process.cwd(),
  task: "add input validation to the upload endpoint",
  localModel,
  cloudClient: new AnthropicCloudClient(),
});
console.log(result.stats); // rounds / searches / snippets / cloudCalled
console.log(result.actions?.text); // proposed diffs + commands
```

## Tests

```bash
pnpm --filter @openclaw/local-harness test
```

Tests assert the core invariant: the cloud client is called exactly once and
only after local collection completes, and never on a dry run.
