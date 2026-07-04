import { randomUUID } from "node:crypto";
import type { WingmanConfig } from "../config.js";
import type {
  Conversation,
  ConversationContext,
  GroupLead,
  InboundEvent,
  Platform,
} from "../types.js";
import type { Channel } from "../channels/channel.js";
import { buildChannels } from "../channels/registry.js";
import type { Brain } from "../agent/brain.js";
import { createBrain } from "../agent/brain.js";
import { Store } from "./store.js";
import { Policy } from "./policy.js";
import { createLogger } from "../logger.js";

const log = createLogger("orchestrator");

/**
 * The control loop. Each tick: pull new activity from every channel, ask the
 * brain what to do on threads where it's our turn, gate the result through the
 * policy, then dispatch any messages whose human-like delay has elapsed.
 */
export class Orchestrator {
  private readonly channels: Channel[];
  private readonly byPlatform = new Map<Platform, Channel>();
  private readonly brain: Brain;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** conv.id → the updatedAt we last asked the brain about (dedupe re-decides). */
  private lastConsidered = new Map<string, number>();

  constructor(
    private readonly cfg: WingmanConfig,
    readonly store: Store,
    readonly policy: Policy,
  ) {
    this.channels = buildChannels(cfg);
    for (const ch of this.channels) this.byPlatform.set(ch.platform, ch);
    this.brain = createBrain(cfg);
  }

  brainKind(): string {
    return this.brain.kind;
  }

  async start(): Promise<void> {
    for (const ch of this.channels) await ch.init();
    log.info(
      `Started with channels: ${this.channels.map((c) => `${c.platform}(${c.config.mode})`).join(", ") || "none"}`,
    );
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      try {
        await this.tick();
      } catch (err) {
        log.error(`tick failed: ${(err as Error).message}`);
      }
      if (this.running) this.timer = setTimeout(loop, this.cfg.pollIntervalMs);
    };
    void loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    for (const ch of this.channels) await ch.close();
    this.store.flush();
  }

  /** One full pass of the control loop. */
  private async tick(): Promise<void> {
    await this.ingest();
    await this.consider();
    await this.dispatchDue();
    this.promoteApprovedApprovals();
    await this.dispatchDue();
  }

  // --- 1. pull new activity -------------------------------------------------

  private async ingest(): Promise<void> {
    for (const ch of this.channels) {
      let events: InboundEvent[] = [];
      try {
        events = await ch.poll();
      } catch (err) {
        log.error(`[${ch.platform}] poll error: ${(err as Error).message}`);
      }
      for (const ev of events) this.applyEvent(ev);

      if (ch.platform === "groups" && ch.searchLeads) {
        try {
          const leads = await ch.searchLeads();
          for (const lead of leads) this.applyLead(lead);
        } catch (err) {
          log.error(`[groups] searchLeads error: ${(err as Error).message}`);
        }
      }
    }
  }

  private applyEvent(ev: InboundEvent): void {
    let conv = this.store.findByExternalId(ev.platform, ev.externalId);
    if (!conv) {
      conv = this.newConversation(ev.platform, ev.externalId, ev.title, ev.counterpart, ev.context);
      this.store.upsertConversation(conv);
    } else if (ev.context) {
      conv.context = { ...conv.context, ...ev.context };
      this.store.upsertConversation(conv);
    }

    const text = ev.type === "new_message" ? ev.text : ev.opener;
    if (text) {
      // Skip if we already recorded this exact inbound as the latest message.
      const last = conv.messages[conv.messages.length - 1];
      if (!(last && last.direction === "inbound" && last.text === text)) {
        this.store.addMessage(conv.id, {
          direction: "inbound",
          author: ev.counterpart,
          text,
          ts: ev.ts,
        });
        conv.status = "active";
        this.store.upsertConversation(conv);
        log.info(`[${ev.platform}] ↙ ${ev.counterpart}: ${truncate(text)}`);
      }
    }
  }

  private applyLead(lead: GroupLead): void {
    const fingerprint = `${lead.groupName}|${lead.query}|${lead.snippet.slice(0, 60)}`;
    if (this.store.isLeadSeen(fingerprint)) return;
    this.store.markLeadSeen(fingerprint);

    const externalId = `lead-${randomUUID().slice(0, 8)}`;
    const context: ConversationContext = {
      lead: {
        groupName: lead.groupName,
        query: lead.query,
        postUrl: lead.postUrl,
        snippet: lead.snippet,
      },
    };
    const conv = this.newConversation(
      "groups",
      externalId,
      `${lead.groupName}: ${lead.query}`,
      lead.author,
      context,
    );
    // Empty thread — it's our turn to open with outreach.
    this.store.upsertConversation(conv);
    log.info(`[groups] new lead in "${lead.groupName}" for "${lead.query}" → ${lead.author}`);
  }

  // --- 2. ask the brain on threads where it's our turn ----------------------

  private async consider(): Promise<void> {
    for (const conv of this.store.listConversations()) {
      if (!this.policy.shouldEngage(conv)) continue;
      if (!ourTurn(conv)) continue;
      if (this.lastConsidered.get(conv.id) === conv.updatedAt) continue;

      this.lastConsidered.set(conv.id, conv.updatedAt);
      await this.considerOne(conv);
    }
  }

  private async considerOne(conv: Conversation): Promise<void> {
    let decision;
    try {
      decision = await this.brain.decide(conv);
    } catch (err) {
      log.error(`[${conv.platform}] brain error on ${conv.id}: ${(err as Error).message}`);
      return;
    }

    log.info(
      `[${conv.platform}] decision for ${conv.counterpart}: ${decision.action} — ${decision.reason}`,
    );

    if (decision.action === "wait") {
      conv.status = "waiting_on_them";
      this.store.upsertConversation(conv);
      return;
    }
    if (decision.action === "close") {
      conv.status = "closed";
      this.store.upsertConversation(conv);
      return;
    }
    if (decision.action === "escalate") {
      // Surface as an approval with no auto-text so the human takes over.
      this.store.createApproval({
        conversationId: conv.id,
        platform: conv.platform,
        proposedText: decision.message ?? "(agent asked a human to take this thread)",
        reason: decision.reason,
      });
      conv.status = "waiting_approval";
      this.store.upsertConversation(conv);
      return;
    }

    // action === "reply"
    const verdict = this.policy.evaluateOutbound(conv, decision);
    if (!verdict.allow) {
      log.warn(`[${conv.platform}] blocked: ${verdict.note}`);
      return;
    }

    if (verdict.requireApproval) {
      this.store.createApproval({
        conversationId: conv.id,
        platform: conv.platform,
        proposedText: decision.message!,
        reason: `${decision.reason} | ${verdict.note}`,
      });
      conv.status = "waiting_approval";
      this.store.upsertConversation(conv);
      log.info(`[${conv.platform}] draft queued for approval → "${truncate(decision.message!)}"`);
    } else {
      // Auto-send, but honor the human-like delay the brain chose.
      const delayMs = (decision.replyDelaySeconds ?? 120) * 1000;
      this.store.schedulePendingSend({
        conversationId: conv.id,
        platform: conv.platform,
        text: decision.message!,
        quote: decision.quote,
        sendAt: Date.now() + delayMs,
      });
      conv.status = "waiting_on_them";
      this.store.upsertConversation(conv);
      log.info(
        `[${conv.platform}] auto-reply scheduled in ${fmtDelay(delayMs)} → "${truncate(decision.message!)}"`,
      );
    }
  }

  // --- 3. dispatch messages whose delay has elapsed -------------------------

  private async dispatchDue(): Promise<void> {
    const now = Date.now();
    for (const send of this.store.duePendingSends(now)) {
      const conv = this.store.getConversation(send.conversationId);
      const channel = this.byPlatform.get(send.platform);
      if (!conv || !channel) {
        this.store.removePendingSend(send.id);
        continue;
      }
      try {
        await channel.sendMessage(conv.externalId, send.text);
        this.store.addMessage(conv.id, {
          direction: "outbound",
          author: "you",
          text: send.text,
          ts: Date.now(),
        });
        this.store.incrementSent(send.platform);
        conv.status = "waiting_on_them";
        this.store.upsertConversation(conv);
        log.info(`[${send.platform}] ✓ sent to ${conv.counterpart}: ${truncate(send.text)}`);
      } catch (err) {
        log.error(`[${send.platform}] send failed: ${(err as Error).message}`);
      } finally {
        this.store.removePendingSend(send.id);
      }
    }
  }

  // --- 4. turn human-approved drafts into scheduled sends -------------------

  private promoteApprovedApprovals(): void {
    for (const a of this.store.listApprovals("approved")) {
      const conv = this.store.getConversation(a.conversationId);
      if (!conv) {
        this.store.updateApproval(a.id, { status: "sent" });
        continue;
      }
      // Small human-like delay even after approval, so it doesn't fire the
      // instant a human clicks.
      const delayMs = 20_000 + Math.floor(Math.random() * 100_000);
      this.store.schedulePendingSend({
        conversationId: conv.id,
        platform: conv.platform,
        text: a.proposedText,
        sendAt: Date.now() + delayMs,
      });
      this.store.updateApproval(a.id, { status: "sent", decidedAt: Date.now() });
      log.info(`[${conv.platform}] approved draft → sending in ${fmtDelay(delayMs)}`);
    }
  }

  private newConversation(
    platform: Platform,
    externalId: string,
    title: string,
    counterpart: string,
    context?: Partial<ConversationContext>,
  ): Conversation {
    const now = Date.now();
    return {
      id: randomUUID(),
      platform,
      externalId,
      title,
      counterpart,
      status: "active",
      context: context ?? {},
      messages: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
  }
}

export function createOrchestrator(cfg: WingmanConfig): Orchestrator {
  const store = new Store(cfg.stateDir);
  const policy = new Policy(cfg, store);
  return new Orchestrator(cfg, store, policy);
}

/** It's our move if they spoke last, or the thread is empty (we should open). */
function ourTurn(conv: Conversation): boolean {
  const last = conv.messages[conv.messages.length - 1];
  if (!last) return true;
  return last.direction === "inbound";
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function fmtDelay(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  return `${(m / 60).toFixed(1)}h`;
}
