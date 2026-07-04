import { mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Platform } from "../types.js";
import { createLogger } from "../logger.js";

// Playwright types are referenced structurally so the package stays optional —
// mock-only deployments don't need it installed. `any` at the boundary keeps
// this file compilable without @types from playwright.
type Browser = any;
type BrowserContext = any;
type Page = any;

const log = createLogger("browser");

/**
 * Persistent, per-platform browser session. Logins are stored to disk as
 * Playwright storage state so you authenticate once (via `wingman login <platform>`)
 * and the agent reuses the cookies on every run.
 */
export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly statePath: string;

  private headless: boolean;

  constructor(
    private readonly platform: Platform,
    stateDir: string,
    headless = true,
  ) {
    this.headless = headless;
    const dir = resolve(process.cwd(), stateDir, "sessions");
    mkdirSync(dir, { recursive: true });
    this.statePath = join(dir, `${platform}.json`);
  }

  hasSavedSession(): boolean {
    return existsSync(this.statePath);
  }

  private async playwright() {
    try {
      // Lazy, optional dependency. Non-literal specifier keeps TS from requiring
      // the types at compile time (the package may not be installed).
      const specifier = "playwright";
      const mod = await import(specifier);
      return mod.chromium;
    } catch {
      throw new Error(
        "Playwright is not installed. Run `npm install playwright` (or set the channel " +
          "mode to `mock`) to use live browser automation.",
      );
    }
  }

  async page_(): Promise<Page> {
    if (this.page) return this.page;
    const chromium = await this.playwright();

    // Honor the pre-installed Chromium in this environment if present.
    const launchOpts: Record<string, unknown> = { headless: this.headless };
    if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
      launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    }

    this.browser = await chromium.launch(launchOpts);
    this.context = await this.browser.newContext({
      storageState: this.hasSavedSession() ? this.statePath : undefined,
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });
    this.page = await this.context.newPage();
    log.info(`[${this.platform}] browser session ready (headless=${this.headless}).`);
    return this.page;
  }

  /** Open a login flow interactively and persist the resulting session. */
  async login(startUrl: string): Promise<void> {
    // Force headed so the human can complete login/2FA.
    this.headless = false;
    const page = await this.page_();
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    log.info(
      `[${this.platform}] Complete the login in the opened browser, then press Enter here…`,
    );
    await waitForEnter();
    await this.context!.storageState({ path: this.statePath });
    log.info(`[${this.platform}] session saved → ${this.statePath}`);
    await this.close();
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.context = null;
    this.browser = null;
    this.page = null;
  }
}

/** Human-like typing: per-character delay so input doesn't look robotic. */
export async function typeLikeHuman(page: Page, selector: string, text: string): Promise<void> {
  const el = await page.waitForSelector(selector, { timeout: 15_000 });
  await el.click();
  for (const ch of text) {
    await el.type(ch, { delay: 40 + Math.floor(Math.random() * 120) });
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((res) => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      res();
    });
  });
}
