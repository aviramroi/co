import { randomUUID } from "node:crypto";
import type { ChannelConfig, WingmanConfig } from "../config.js";
import type { GroupLead, InboundEvent, Platform } from "../types.js";
import type { Channel } from "./channel.js";
import { createLogger } from "../logger.js";

/**
 * A synthetic channel that fabricates realistic inbound activity so the whole
 * pipeline (poll → brain → approve → human-delay → send) runs end-to-end with
 * no accounts, keys, or network. Also the reference for what a live adapter
 * must emit.
 */
export class MockChannel implements Channel {
  private readonly log;
  /** Sent messages, so a "counterpart" can reply to them over time. */
  private threads = new Map<string, { counterpart: string; replied: number }>();
  private tick = 0;

  constructor(
    readonly platform: Platform,
    readonly config: ChannelConfig,
    private readonly cfg: WingmanConfig,
  ) {
    this.log = createLogger(`mock:${platform}`);
  }

  async init(): Promise<void> {
    this.log.info("Mock channel ready (synthetic activity enabled).");
  }

  async poll(): Promise<InboundEvent[]> {
    this.tick++;
    const events: InboundEvent[] = [];

    // Seed a couple of fresh threads early, then trickle occasional messages.
    if (this.tick === 1) events.push(...this.seedThreads());
    if (this.tick > 1 && Math.random() < 0.4) {
      const reply = this.simulateReply();
      if (reply) events.push(reply);
    }
    return events;
  }

  async sendMessage(externalId: string, text: string): Promise<void> {
    const t = this.threads.get(externalId);
    this.log.info(`↗ [${externalId}] ${text}`);
    if (t) t.replied = Date.now();
  }

  async searchLeads(): Promise<GroupLead[]> {
    if (this.platform !== "groups") return [];
    // Nothing configured to search for → no synthetic leads.
    if (this.cfg.groups.queries.length === 0 || this.cfg.groups.groups.length === 0) return [];
    // Surface a new lead occasionally.
    if (this.tick > 1 && Math.random() > 0.35) return [];
    const q = pick(this.cfg.groups.queries);
    const group = pick(this.cfg.groups.groups);
    return [
      {
        groupName: group,
        query: q,
        author: pick(NAMES),
        postUrl: `https://facebook.com/groups/mock/${randomUUID().slice(0, 8)}`,
        snippet: `Selling/looking: ${q}. DM me if interested — can meet this weekend.`,
        ts: Date.now(),
      },
    ];
  }

  async close(): Promise<void> {}

  // --- synthetic activity --------------------------------------------------

  private seedThreads(): InboundEvent[] {
    if (this.platform === "tinder") {
      const id = this.register("Jordan");
      return [
        {
          type: "new_thread",
          platform: "tinder",
          externalId: id,
          title: "Jordan",
          counterpart: "Jordan",
          opener: "heyy, saw you're into climbing — indoor or outdoor person?",
          ts: Date.now(),
          context: { profile: { bio: "Weekend boulderer, coffee snob, dog mom.", interests: ["climbing", "coffee"] } },
        },
      ];
    }
    if (this.platform === "marketplace") {
      const buyerId = this.register("Sam");
      return [
        {
          type: "new_thread",
          platform: "marketplace",
          externalId: buyerId,
          title: this.cfg.marketplace.selling[0]?.title ?? "Item for sale",
          counterpart: "Sam",
          opener: "Hi, is this still available? Would you take $90?",
          ts: Date.now(),
          context: {
            side: "seller",
            listing: this.cfg.marketplace.selling[0]
              ? {
                  title: this.cfg.marketplace.selling[0].title,
                  askingPrice: this.cfg.marketplace.selling[0].askingPrice,
                  currency: this.cfg.marketplace.selling[0].currency,
                  description: this.cfg.marketplace.selling[0].description,
                }
              : undefined,
          },
        },
      ];
    }
    return [];
  }

  private simulateReply(): InboundEvent | null {
    const entries = [...this.threads.entries()].filter(([, t]) => t.replied > 0);
    if (entries.length === 0) return null;
    const [externalId, t] = pick(entries);
    return {
      type: "new_message",
      platform: this.platform,
      externalId,
      title: t.counterpart,
      counterpart: t.counterpart,
      text: pick(REPLIES[this.platform]),
      ts: Date.now(),
    };
  }

  private register(counterpart: string): string {
    const id = `mock-${this.platform}-${randomUUID().slice(0, 8)}`;
    this.threads.set(id, { counterpart, replied: 0 });
    return id;
  }
}

const NAMES = ["Riley", "Casey", "Taylor", "Morgan", "Avery", "Quinn"];
const REPLIES: Record<Platform, string[]> = {
  tinder: [
    "outdoor for sure! though my gym has a killer bouldering wall haha",
    "ok that's a green flag ngl. what are you up to this weekend?",
    "haha you're funny. coffee sometime?",
  ],
  marketplace: [
    "Could you do $100? I can pick up today.",
    "Great, what time works for pickup?",
    "Is the condition really that good? Any scratches?",
  ],
  groups: [
    "yeah still available! where are you based?",
    "cool, can you do $500?",
    "sounds good, when are you free to meet?",
  ],
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
