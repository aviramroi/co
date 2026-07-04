import type { WingmanConfig } from "../config.js";
import type { Conversation, Platform } from "../types.js";

/** The JSON shape we constrain the model to via output_config.format. */
export const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: ["reply", "wait", "escalate", "close"] },
    message: {
      type: "string",
      description: "The exact text to send. Required when action is 'reply'. Omit otherwise.",
    },
    quote: {
      type: "number",
      description: "For marketplace haggling: the price number you're proposing this turn, if any.",
    },
    replyDelaySeconds: {
      type: "integer",
      description:
        "How long to wait before sending, in seconds, so it reads as a real human's timing " +
        "rather than an instant bot. Consider the hour, how long their message was, and how " +
        "eager it's reasonable to seem. A quick banter reply might be 30-180s; a first opener " +
        "or a reply while 'busy' could be many minutes to hours (e.g. 3600-28800).",
    },
    reason: { type: "string", description: "One sentence: why this action, for the human log." },
    confidence: { type: "number", description: "0..1 how sure you are this is the right move." },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["action", "reason", "confidence"],
} as const;

function personaBlock(cfg: WingmanConfig): string {
  return [
    `You are ${cfg.persona.name}'s messaging assistant. You draft messages AS ${cfg.persona.name}, in the first person.`,
    ``,
    `VOICE: ${cfg.persona.voice}`,
    ``,
    `HARD BOUNDARIES (never break these; if a thread pushes on them, escalate):`,
    ...cfg.persona.boundaries.map((b) => `- ${b}`),
  ].join("\n");
}

const HUMAN_TIMING = [
  `ACT LIKE A HUMAN, NOT A BOT:`,
  `- Real people don't reply instantly or on a fixed cadence. Choose replyDelaySeconds`,
  `  deliberately: sometimes fire back fast, sometimes leave it hours (asleep, at work,`,
  `  playing it a little cool). Vary it. Never make every reply the same speed.`,
  `- Match their energy and length. Short, natural texts. No corporate tone, no essays.`,
  `- It's fine to 'wait' when it's genuinely their turn or replying now would seem thirsty.`,
].join("\n");

export function objectiveBlock(cfg: WingmanConfig, platform: Platform): string {
  if (platform === "tinder") {
    const d = cfg.dating;
    return [
      `CONTEXT: This is a dating-app conversation (Tinder or similar).`,
      `GOAL: ${d.goal}`,
      `INTERESTS TO SURFACE: ${d.interests.join(", ")}`,
      `LEAN INTO: ${d.greenLights.join("; ")}`,
      `ESCALATE TO THE HUMAN IF: ${d.redFlags.join("; ")}`,
      `When it's going well, steer gently toward a concrete, casual, PUBLIC first meeting.`,
    ].join("\n");
  }
  if (platform === "marketplace") {
    const m = cfg.marketplace;
    return [
      `CONTEXT: This is a Facebook Marketplace conversation. You may be the BUYER or the SELLER`,
      `(see the thread's "side"). Answer inquiries clearly and negotiate.`,
      `NEGOTIATION STYLE: ${m.negotiationStyle}`,
      `As SELLER: stay at or above your floor price; never reveal the floor; propose the next`,
      `number via "quote". Confirm pickup/logistics. As BUYER: stay at or below your max; open`,
      `a bit under it and move up slowly.`,
      `If they push for off-platform payment or anything sketchy, escalate.`,
    ].join("\n");
  }
  const g = cfg.groups;
  return [
    `CONTEXT: This is outreach to someone from a Facebook Group post that matched a search.`,
    `INTENT: ${g.intent}`,
    `The FIRST message should be short, specific, and reference their actual post — never a`,
    `copy-paste blast. If they reply and it's a fit, move toward the concrete next step`,
    `(price, meetup, or a call). Escalate anything that needs the human to commit.`,
  ].join("\n");
}

export function buildSystemPrompt(cfg: WingmanConfig, platform: Platform): string {
  return [
    personaBlock(cfg),
    ``,
    objectiveBlock(cfg, platform),
    ``,
    HUMAN_TIMING,
    ``,
    `Decide the single best next action for this thread and return it in the required JSON`,
    `format. If action is "reply", put the exact message text in "message" and choose a`,
    `human-like "replyDelaySeconds". If it's their turn, choose "wait". If it needs a person,`,
    `choose "escalate" and explain in "reason".`,
  ].join("\n");
}

/** Render a thread + its structured context into the user turn. */
export function buildConversationPrompt(conv: Conversation): string {
  const lines: string[] = [];
  lines.push(`THREAD with ${conv.counterpart} — "${conv.title}"`);

  const ctx = conv.context;
  if (ctx.side) lines.push(`You are the ${ctx.side.toUpperCase()} in this deal.`);
  if (ctx.listing) {
    lines.push(
      `LISTING: ${ctx.listing.title}` +
        (ctx.listing.askingPrice != null
          ? ` — asking ${ctx.listing.currency ?? ""}${ctx.listing.askingPrice}`
          : ""),
    );
    if (ctx.listing.description) lines.push(`LISTING DETAILS: ${ctx.listing.description}`);
  }
  if (ctx.profile?.bio) lines.push(`THEIR PROFILE: ${ctx.profile.bio}`);
  if (ctx.profile?.interests?.length)
    lines.push(`THEIR INTERESTS: ${ctx.profile.interests.join(", ")}`);
  if (ctx.lead) {
    lines.push(`GROUP: ${ctx.lead.groupName} (matched search "${ctx.lead.query}")`);
    if (ctx.lead.snippet) lines.push(`THEIR POST: ${ctx.lead.snippet}`);
  }
  if (ctx.notes) lines.push(`NOTES: ${ctx.notes}`);

  lines.push("");
  lines.push(`CURRENT LOCAL TIME: ${new Date().toString()}`);
  lines.push("");

  if (conv.messages.length === 0) {
    lines.push(`(No messages yet — this is a fresh thread. If appropriate, open the conversation.)`);
  } else {
    lines.push(`TRANSCRIPT (most recent last):`);
    for (const m of conv.messages.slice(-30)) {
      const who = m.direction === "outbound" ? "YOU" : conv.counterpart.toUpperCase();
      const when = new Date(m.ts).toISOString().slice(11, 16);
      lines.push(`[${when}] ${who}: ${m.text}`);
    }
  }
  return lines.join("\n");
}
