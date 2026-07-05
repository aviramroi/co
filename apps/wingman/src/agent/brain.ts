import Anthropic from "@anthropic-ai/sdk";
import type { WingmanConfig } from "../config.js";
import type { AgentDecision, Conversation } from "../types.js";
import { createLogger } from "../logger.js";
import {
  DECISION_SCHEMA,
  buildConversationPrompt,
  buildSystemPrompt,
} from "./prompts.js";

const log = createLogger("brain");

export interface Brain {
  /** Decide the next action for a single conversation. */
  decide(conv: Conversation): Promise<AgentDecision>;
  readonly kind: "claude" | "heuristic";
}

/** Claude-backed brain. Constrains output to DECISION_SCHEMA via output_config.format. */
class ClaudeBrain implements Brain {
  readonly kind = "claude" as const;
  private readonly client: Anthropic;

  constructor(private readonly cfg: WingmanConfig) {
    this.client = new Anthropic({ apiKey: cfg.llm.apiKey });
  }

  async decide(conv: Conversation): Promise<AgentDecision> {
    const system = buildSystemPrompt(this.cfg, conv.platform);
    const user = buildConversationPrompt(conv);

    // Adaptive thinking + output_config.effort/format are current API surface but
    // may be ahead of the installed SDK's static types — cast the body to keep
    // this compiling across SDK versions (the fields are valid at runtime).
    const res = await this.client.messages.create({
      model: this.cfg.llm.model,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      output_config: {
        effort: this.cfg.llm.effort,
        format: { type: "json_schema", schema: DECISION_SCHEMA },
      },
      system,
      messages: [{ role: "user", content: user }],
    } as any);

    if (res.stop_reason === "refusal") {
      return {
        action: "escalate",
        reason: "Model declined to respond to this thread; a human should review it.",
        confidence: 1,
        tags: ["refusal"],
      };
    }

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("No text block in model response");
    }
    return normalizeDecision(JSON.parse(text.text));
  }
}

/**
 * Deterministic fallback so the agent runs (and demos) without an API key.
 * It won't write charming prose, but it exercises the full pipeline and makes
 * sane, safe choices — always draft-for-approval, never auto-commit anything.
 */
class HeuristicBrain implements Brain {
  readonly kind = "heuristic" as const;
  constructor(private readonly cfg: WingmanConfig) {}

  async decide(conv: Conversation): Promise<AgentDecision> {
    const last = conv.messages[conv.messages.length - 1];
    const theirs = last && last.direction === "inbound" ? last.text : "";
    const lower = theirs.toLowerCase();

    // Safety-first escalation on obvious red flags.
    const RED = ["venmo", "zelle", "cashapp", "cash app", "gift card", "wire", "crypto", "bitcoin", "whatsapp", "telegram", "ssn", "bank"];
    if (RED.some((w) => lower.includes(w))) {
      return {
        action: "escalate",
        reason: "Detected a possible scam / off-platform payment signal; needs human eyes.",
        confidence: 0.9,
        tags: ["red-flag"],
      };
    }

    // If it's our turn (they spoke last, or the thread is empty), draft something.
    const ourTurn = !last || last.direction === "inbound";
    if (!ourTurn) {
      return { action: "wait", reason: "We spoke last; waiting on them.", confidence: 0.8 };
    }

    let message: string;
    if (conv.messages.length === 0) {
      message = openerFor(conv);
    } else if (conv.platform === "marketplace") {
      message = "Thanks for reaching out! Yes, it's still available. Want to set up a pickup?";
    } else {
      message = "haha love that — what's the rest of your week looking like?";
    }

    return {
      action: "reply",
      message,
      // Human-like: a heuristic can't reason about time, so jitter a natural window.
      replyDelaySeconds: humanJitterSeconds(),
      reason: "Heuristic draft (no LLM key configured); routed for human approval.",
      confidence: 0.4,
      tags: ["heuristic"],
    };
  }
}

function openerFor(conv: Conversation): string {
  if (conv.platform === "groups" && conv.context.lead) {
    return `hey! saw your post in ${conv.context.lead.groupName} about "${conv.context.lead.query}" — still around? would love to hear more.`;
  }
  if (conv.platform === "marketplace" && conv.context.listing) {
    return conv.context.side === "buyer"
      ? `hi! is "${conv.context.listing.title}" still available? interested if so.`
      : `hi! thanks for the interest — it's still available. happy to answer any questions.`;
  }
  return "hey! your profile made me smile — what's something you're weirdly passionate about?";
}

/** Random but plausible reply delay: usually minutes, sometimes hours. */
function humanJitterSeconds(): number {
  const r = Math.random();
  if (r < 0.5) return 60 + Math.floor(Math.random() * 600); // 1–11 min
  if (r < 0.85) return 900 + Math.floor(Math.random() * 5400); // 15 min–1.75 h
  return 7200 + Math.floor(Math.random() * 28800); // 2–10 h
}

function normalizeDecision(raw: any): AgentDecision {
  const action = ["reply", "wait", "escalate", "close"].includes(raw?.action) ? raw.action : "wait";
  const decision: AgentDecision = {
    action,
    reason: typeof raw?.reason === "string" ? raw.reason : "(no reason given)",
    confidence: clamp01(Number(raw?.confidence ?? 0.5)),
  };
  if (action === "reply") {
    decision.message = String(raw?.message ?? "").trim();
    if (!decision.message) {
      // Model chose reply but gave no text — treat as wait rather than send empty.
      return { action: "wait", reason: "Model returned an empty reply.", confidence: 0.3 };
    }
    if (typeof raw?.quote === "number") decision.quote = raw.quote;
    decision.replyDelaySeconds = sanitizeDelay(raw?.replyDelaySeconds);
  }
  if (Array.isArray(raw?.tags)) decision.tags = raw.tags.map(String);
  return decision;
}

function sanitizeDelay(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return humanJitterSeconds();
  // Clamp to a sane ceiling (24h) so a hallucinated huge value can't wedge a thread.
  return Math.min(Math.floor(n), 86_400);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function createBrain(cfg: WingmanConfig): Brain {
  if (cfg.llm.apiKey) {
    log.info(`Using Claude brain (${cfg.llm.model}, effort=${cfg.llm.effort}).`);
    return new ClaudeBrain(cfg);
  }
  log.warn("ANTHROPIC_API_KEY not set — falling back to the heuristic brain (drafts only).");
  return new HeuristicBrain(cfg);
}
