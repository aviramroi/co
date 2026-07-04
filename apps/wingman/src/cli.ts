#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { loadConfig } from "./config.js";
import { createOrchestrator } from "./core/orchestrator.js";
import { startServer } from "./server/server.js";
import { BrowserSession } from "./channels/browser.js";
import { LOGIN_URLS } from "./channels/live.js";
import { AuthStore } from "./auth/authStore.js";
import { createLogger } from "./logger.js";
import type { Platform } from "./types.js";

const log = createLogger("cli");

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "run":
      return runAgent();
    case "login":
      return login(args[0] as Platform | undefined);
    case "useradd":
      return useradd();
    case "status":
      return status();
    case "help":
    case undefined:
      return help();
    default:
      log.error(`Unknown command: ${command}`);
      help();
      process.exit(1);
  }
}

async function runAgent() {
  const cfg = loadConfig();
  const orchestrator = createOrchestrator(cfg);

  let server: ReturnType<typeof startServer> | undefined;
  if (cfg.server.enabled) {
    server = startServer({ cfg, store: orchestrator.store, orchestrator });
  }

  await orchestrator.start();
  log.info("Wingman is running. Open the control panel to review drafts. Ctrl-C to stop.");

  const shutdown = async () => {
    log.info("Shutting down…");
    await orchestrator.stop();
    server?.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function login(platform?: Platform) {
  if (!platform || !["tinder", "marketplace", "groups"].includes(platform)) {
    log.error("Usage: wingman login <tinder|marketplace|groups>");
    process.exit(1);
  }
  const cfg = loadConfig();
  log.info(`Opening a browser to log into ${platform}. Finish login, then press Enter.`);
  const session = new BrowserSession(platform, cfg.stateDir, false);
  await session.login(LOGIN_URLS[platform]);
  log.info(`Saved ${platform} session. You can now set its channel mode to "live".`);
  process.exit(0);
}

async function useradd() {
  const cfg = loadConfig();
  const auth = new AuthStore(cfg.stateDir);
  let email = process.env.WINGMAN_ADMIN_EMAIL ?? "";
  let password = process.env.WINGMAN_ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    if (!email) email = (await rl.question("Email: ")).trim();
    if (!password) password = await rl.question("Password (min 8 chars): ");
    rl.close();
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    log.error("Invalid email.");
    process.exit(1);
  }
  if (password.length < 8) {
    log.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  try {
    const user = auth.create(email, password);
    log.info(`Created operator account ${user.email}. You can now log in via the web app.`);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }
  process.exit(0);
}

async function status() {
  const cfg = loadConfig();
  const orchestrator = createOrchestrator(cfg);
  const store = orchestrator.store;
  console.log(`brain:        ${cfg.llm.apiKey ? `claude (${cfg.llm.model})` : "heuristic (no key)"}`);
  console.log(`conversations: ${store.listConversations().length}`);
  console.log(`pending approvals: ${store.listApprovals("pending").length}`);
  console.log(`queued sends:  ${store.listPendingSends().length}`);
  for (const p of ["tinder", "marketplace", "groups"] as Platform[]) {
    console.log(`  ${p.padEnd(12)} mode=${cfg.channels[p].mode} sentToday=${store.sentToday(p)}/${cfg.channels[p].dailyLimit}`);
  }
  process.exit(0);
}

function help() {
  console.log(`
🪽  Wingman — your AI agent for Tinder, Marketplace, and Facebook Groups

Usage:
  wingman run                    Start the agent + control panel
  wingman useradd                Create the operator account (email + password)
  wingman login <platform>       Save a browser login for live mode
                                 (platform: tinder | marketplace | groups)
  wingman status                 Print a quick status summary
  wingman help                   Show this help

Env:
  ANTHROPIC_API_KEY   Enables the Claude brain (otherwise heuristic fallback)
  WINGMAN_CONFIG      Path to config JSON (default ./wingman.config.json)
  WINGMAN_<P>_MODE    Per-channel mode override (mock|live|off)
  PORT / WINGMAN_PORT Control-panel port (default 4600)
`);
}

main().catch((err) => {
  log.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
