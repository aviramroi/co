import type { ChannelConfig, WingmanConfig } from "../config.js";
import type { GroupLead, InboundEvent, Platform } from "../types.js";
import type { Channel } from "./channel.js";
import { BrowserSession, typeLikeHuman } from "./browser.js";
import { createLogger } from "../logger.js";

/**
 * Live browser-automation adapters (Tinder / Marketplace / Groups).
 *
 * Selectors are centralized in DEFAULT_SELECTORS and can be overridden at runtime
 * without a code change via `WINGMAN_<APP>_SELECTORS` (a JSON object merged over
 * the defaults) — these sites revise their markup periodically, so this keeps the
 * agent adjustable in config. Authenticate once per platform (`wingman login`,
 * `wingman import-session`, or the dashboard Connect button) before setting a
 * channel to `mode: "live"`.
 */

const DEFAULT_SELECTORS = {
  tinder: {
    loginUrl: "https://tinder.com/app/messages",
    inboxUrl: "https://tinder.com/app/messages",
    // Each conversation preview in the left rail.
    threadItem: 'a[href^="/app/messages/"]',
    // Within an open thread:
    messageBubble: '[class*="msg"]',
    composer: 'textarea',
  },
  marketplace: {
    loginUrl: "https://www.facebook.com/marketplace/inbox",
    inboxUrl: "https://www.facebook.com/marketplace/inbox",
    threadItem: 'a[href*="/marketplace/item/"], [role="row"]',
    messageBubble: '[role="row"] [dir="auto"]',
    composer: 'div[contenteditable="true"][role="textbox"]',
  },
  groups: {
    // Group search results page pattern; {group} + {query} filled in per search.
    loginUrl: "https://www.facebook.com/",
    messengerUrl: "https://www.facebook.com/messages/t/",
    composer: 'div[contenteditable="true"][role="textbox"]',
  },
} as const;

/** Merge any `WINGMAN_<APP>_SELECTORS` env overrides over the defaults. */
function buildSelectors(): typeof DEFAULT_SELECTORS {
  const merged = JSON.parse(JSON.stringify(DEFAULT_SELECTORS));
  for (const p of ["tinder", "marketplace", "groups"] as const) {
    const raw = process.env[`WINGMAN_${p.toUpperCase()}_SELECTORS`];
    if (!raw) continue;
    try {
      Object.assign(merged[p], JSON.parse(raw));
    } catch {
      createLogger("live").warn(`Ignoring invalid WINGMAN_${p.toUpperCase()}_SELECTORS (not JSON).`);
    }
  }
  return merged as typeof DEFAULT_SELECTORS;
}

const SELECTORS = buildSelectors();

abstract class LiveBase implements Channel {
  protected readonly log;
  protected readonly session: BrowserSession;

  constructor(
    readonly platform: Platform,
    readonly config: ChannelConfig,
    protected readonly cfg: WingmanConfig,
  ) {
    this.log = createLogger(`live:${platform}`);
    this.session = new BrowserSession(
      platform,
      cfg.stateDir,
      process.env.WINGMAN_HEADFUL ? false : true,
    );
  }

  async init(): Promise<void> {
    if (!this.session.hasSavedSession()) {
      this.log.warn(
        `No saved session. Run \`wingman login ${this.platform}\` first, or set this ` +
          `channel back to mock mode. Channel will no-op until then.`,
      );
    }
  }

  abstract poll(): Promise<InboundEvent[]>;
  abstract sendMessage(externalId: string, text: string): Promise<void>;

  async close(): Promise<void> {
    await this.session.close();
  }
}

export class TinderLive extends LiveBase {
  private lastMessageByThread = new Map<string, string>();

  async poll(): Promise<InboundEvent[]> {
    if (!this.session.hasSavedSession()) return [];
    const page = await this.session.page_();
    const events: InboundEvent[] = [];
    try {
      await page.goto(SELECTORS.tinder.inboxUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const threads = await page.$$(SELECTORS.tinder.threadItem);
      for (const t of threads.slice(0, 20)) {
        const href: string = (await t.getAttribute("href")) ?? "";
        const externalId = href.split("/").pop() ?? href;
        const name = (await t.innerText().catch(() => "")).split("\n")[0]?.trim() || "Match";
        const preview = (await t.innerText().catch(() => "")).split("\n").slice(1).join(" ").trim();
        if (!externalId || !preview) continue;
        if (this.lastMessageByThread.get(externalId) === preview) continue;
        this.lastMessageByThread.set(externalId, preview);
        events.push({
          type: "new_message",
          platform: "tinder",
          externalId,
          title: name,
          counterpart: name,
          text: preview,
          ts: Date.now(),
        });
      }
    } catch (err) {
      this.log.error(`poll failed (selectors may need tuning): ${(err as Error).message}`);
    }
    return events;
  }

  async sendMessage(externalId: string, text: string): Promise<void> {
    const page = await this.session.page_();
    await page.goto(`https://tinder.com/app/messages/${externalId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);
    await typeLikeHuman(page, SELECTORS.tinder.composer, text);
    await page.keyboard.press("Enter");
    this.log.info(`↗ [${externalId}] sent (${text.length} chars)`);
  }
}

export class MarketplaceLive extends LiveBase {
  private lastMessageByThread = new Map<string, string>();

  async poll(): Promise<InboundEvent[]> {
    if (!this.session.hasSavedSession()) return [];
    const page = await this.session.page_();
    const events: InboundEvent[] = [];
    try {
      await page.goto(SELECTORS.marketplace.inboxUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      const rows = await page.$$(SELECTORS.marketplace.threadItem);
      for (const r of rows.slice(0, 20)) {
        const txt = (await r.innerText().catch(() => "")).trim();
        const href: string = (await r.getAttribute("href")) ?? "";
        const externalId = href || txt.slice(0, 40);
        if (!externalId || !txt) continue;
        if (this.lastMessageByThread.get(externalId) === txt) continue;
        this.lastMessageByThread.set(externalId, txt);
        const [title, ...rest] = txt.split("\n");
        events.push({
          type: "new_message",
          platform: "marketplace",
          externalId,
          title: title?.trim() || "Marketplace",
          counterpart: title?.trim() || "Buyer/Seller",
          text: rest.join(" ").trim() || txt,
          ts: Date.now(),
          // Side/listing must be inferred from the thread; default to seller and
          // let the human correct in the dashboard if needed.
          context: { side: "seller" },
        });
      }
    } catch (err) {
      this.log.error(`poll failed (selectors may need tuning): ${(err as Error).message}`);
    }
    return events;
  }

  async sendMessage(externalId: string, text: string): Promise<void> {
    const page = await this.session.page_();
    const url = externalId.startsWith("http")
      ? externalId
      : `https://www.facebook.com${externalId}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await typeLikeHuman(page, SELECTORS.marketplace.composer, text);
    await page.keyboard.press("Enter");
    this.log.info(`↗ [${externalId}] sent (${text.length} chars)`);
  }
}

export class GroupsLive extends LiveBase {
  async poll(): Promise<InboundEvent[]> {
    // Replies to prior outreach arrive via Messenger; scraping that inbox is the
    // same shape as Marketplace. Left as a follow-on; searchLeads drives new
    // outreach, which is the primary Groups job.
    return [];
  }

  async searchLeads(): Promise<GroupLead[]> {
    if (!this.session.hasSavedSession()) return [];
    const page = await this.session.page_();
    const leads: GroupLead[] = [];
    try {
      for (const group of this.cfg.groups.groups) {
        for (const query of this.cfg.groups.queries) {
          // Facebook group search URL; group is a name here, so this navigates to
          // a keyword search scoped to groups. For precise scoping, replace with
          // the numeric group id search URL: /groups/<id>/search/?q=<query>.
          const url = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(
            `${group} ${query}`,
          )}`;
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(3000);
          const posts = await page.$$('[role="article"]');
          for (const p of posts.slice(0, 5)) {
            const snippet = (await p.innerText().catch(() => "")).trim().slice(0, 280);
            if (!snippet) continue;
            leads.push({
              groupName: group,
              query,
              author: snippet.split("\n")[0]?.trim() || "Member",
              snippet,
              ts: Date.now(),
            });
          }
        }
      }
    } catch (err) {
      this.log.error(`searchLeads failed (selectors may need tuning): ${(err as Error).message}`);
    }
    return leads;
  }

  async sendMessage(externalId: string, text: string): Promise<void> {
    const page = await this.session.page_();
    await page.goto(`${SELECTORS.groups.messengerUrl}${externalId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2500);
    await typeLikeHuman(page, SELECTORS.groups.composer, text);
    await page.keyboard.press("Enter");
    this.log.info(`↗ [${externalId}] outreach sent (${text.length} chars)`);
  }
}

export const LOGIN_URLS: Record<Platform, string> = {
  tinder: SELECTORS.tinder.loginUrl,
  marketplace: SELECTORS.marketplace.loginUrl,
  groups: SELECTORS.groups.loginUrl,
};
