import type { Platform } from "../types.js";
import { BrowserSession } from "./browser.js";
import { LOGIN_URLS } from "./live.js";
import { createLogger } from "../logger.js";

const log = createLogger("login");

export type LoginState = "idle" | "awaiting" | "connected" | "error";

interface Job {
  state: LoginState;
  session: BrowserSession;
  message?: string;
  poller?: NodeJS.Timeout;
  startedAt: number;
}

/**
 * Drives interactive browser logins triggered from the API/dashboard. Opens a
 * headed browser on the host running the agent; a poller auto-detects a
 * successful login and saves the session, or the operator confirms via the
 * `complete` endpoint. Designed for a self-hosted agent (browser opens where the
 * agent runs — typically the operator's machine).
 */
export class LoginManager {
  private jobs = new Map<Platform, Job>();

  constructor(private readonly stateDir: string) {}

  private ensureSession(platform: Platform): BrowserSession {
    return new BrowserSession(platform, this.stateDir, false);
  }

  status(platform: Platform): { connected: boolean; state: LoginState; message?: string } {
    const job = this.jobs.get(platform);
    const connected = new BrowserSession(platform, this.stateDir, false).hasSavedSession();
    if (connected && (!job || job.state !== "awaiting")) {
      return { connected: true, state: "connected" };
    }
    return {
      connected,
      state: job?.state ?? (connected ? "connected" : "idle"),
      message: job?.message,
    };
  }

  /** Open the login browser (idempotent while a job is awaiting). */
  async start(platform: Platform): Promise<{ state: LoginState; message?: string }> {
    const existing = this.jobs.get(platform);
    if (existing && existing.state === "awaiting") {
      return { state: "awaiting", message: "Login already in progress — finish it in the browser." };
    }

    const session = this.ensureSession(platform);
    const job: Job = { state: "awaiting", session, startedAt: Date.now() };
    this.jobs.set(platform, job);

    try {
      await session.openForLogin(LOGIN_URLS[platform]);
    } catch (err) {
      job.state = "error";
      job.message = (err as Error).message;
      log.error(`[${platform}] login start failed: ${job.message}`);
      return { state: "error", message: job.message };
    }

    // Auto-detect success; also self-times-out after 5 minutes.
    job.poller = setInterval(async () => {
      if (job.state !== "awaiting") return;
      if (Date.now() - job.startedAt > 5 * 60_000) {
        await this.finalize(platform, "error", "Login timed out after 5 minutes.");
        return;
      }
      if (await session.looksLoggedIn()) {
        await this.complete(platform);
      }
    }, 3000);

    return { state: "awaiting", message: "Finish logging in in the opened browser." };
  }

  /** Save the session and mark connected. */
  async complete(platform: Platform): Promise<{ state: LoginState; message?: string }> {
    const job = this.jobs.get(platform);
    if (!job || !job.session.isOpen()) {
      return { state: "error", message: "No login browser is open. Start login first." };
    }
    try {
      await job.session.saveSession();
      await this.finalize(platform, "connected", "Connected.");
      return { state: "connected" };
    } catch (err) {
      await this.finalize(platform, "error", (err as Error).message);
      return { state: "error", message: (err as Error).message };
    }
  }

  async cancel(platform: Platform): Promise<void> {
    await this.finalize(platform, "idle", "Login cancelled.");
  }

  /** Import a storage-state captured elsewhere (no display needed on this host). */
  importSession(platform: Platform, storageState: unknown): { state: LoginState; message?: string } {
    try {
      this.ensureSession(platform).writeSessionState(storageState);
      const job = this.jobs.get(platform);
      if (job) {
        if (job.poller) clearInterval(job.poller);
        job.state = "connected";
      }
      return { state: "connected" };
    } catch (err) {
      return { state: "error", message: (err as Error).message };
    }
  }

  private async finalize(platform: Platform, state: LoginState, message: string): Promise<void> {
    const job = this.jobs.get(platform);
    if (!job) return;
    if (job.poller) clearInterval(job.poller);
    job.state = state;
    job.message = message;
    await job.session.close().catch(() => {});
    log.info(`[${platform}] login → ${state} (${message})`);
  }

  async closeAll(): Promise<void> {
    for (const [, job] of this.jobs) {
      if (job.poller) clearInterval(job.poller);
      await job.session.close().catch(() => {});
    }
  }
}
