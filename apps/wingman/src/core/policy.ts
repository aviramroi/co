import type { WingmanConfig } from "../config.js";
import type { AgentDecision, Conversation, Platform } from "../types.js";
import type { Store } from "./store.js";

export interface PolicyVerdict {
  /** Whether the outbound send may proceed at all right now. */
  allow: boolean;
  /** If allowed, must a human approve before it goes out? */
  requireApproval: boolean;
  /** Human-readable explanation for the log / dashboard. */
  note: string;
}

const SCAM_SIGNALS = [
  "venmo",
  "zelle",
  "cashapp",
  "cash app",
  "gift card",
  "google play",
  "wire transfer",
  "western union",
  "crypto",
  "bitcoin",
  "usdt",
  "ssn",
  "social security",
  "bank account",
  "routing number",
  "verification code",
];

/**
 * Guardrails between "the brain wants to send X" and "X actually goes out".
 * Central place for rate limits, approval gating, and safety interlocks.
 */
export class Policy {
  constructor(
    private readonly cfg: WingmanConfig,
    private readonly store: Store,
  ) {}

  /** Should we even ask the brain about this thread right now? */
  shouldEngage(conv: Conversation): boolean {
    if (conv.status === "closed" || conv.status === "snoozed") return false;
    // Don't pile drafts on a thread that already has one queued/pending.
    if (this.store.hasPendingFor(conv.id)) return false;
    return true;
  }

  /** Evaluate an outbound decision against limits and safety rules. */
  evaluateOutbound(conv: Conversation, decision: AgentDecision): PolicyVerdict {
    const channel = this.cfg.channels[conv.platform];

    // Rate limit: hard daily cap per platform.
    if (this.store.sentToday(conv.platform) >= channel.dailyLimit) {
      return {
        allow: false,
        requireApproval: false,
        note: `Daily send limit reached for ${conv.platform} (${channel.dailyLimit}).`,
      };
    }

    // Safety interlock: if the thread trips scam signals, force human review
    // regardless of the channel's normal approval setting.
    if (this.tripsScamSignals(conv, decision)) {
      return {
        allow: true,
        requireApproval: true,
        note: "Scam/safety signal present — forcing human approval.",
      };
    }

    // Low-confidence drafts always get a human.
    if (decision.confidence < 0.55) {
      return {
        allow: true,
        requireApproval: true,
        note: `Low confidence (${decision.confidence.toFixed(2)}) — routing to approval.`,
      };
    }

    return {
      allow: true,
      requireApproval: channel.requireApproval,
      note: channel.requireApproval ? "Channel requires approval." : "Auto-send permitted.",
    };
  }

  private tripsScamSignals(conv: Conversation, decision: AgentDecision): boolean {
    const haystack = [
      decision.message ?? "",
      ...conv.messages.slice(-4).map((m) => m.text),
    ]
      .join(" ")
      .toLowerCase();
    return SCAM_SIGNALS.some((sig) => haystack.includes(sig));
  }

  remainingToday(platform: Platform): number {
    return Math.max(0, this.cfg.channels[platform].dailyLimit - this.store.sentToday(platform));
  }
}
