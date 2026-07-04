// Core domain types shared across the agent, channels, and orchestrator.

export type Platform = "tinder" | "marketplace" | "groups";

export type Direction = "inbound" | "outbound";

/** Which side of a marketplace deal we're playing in a given conversation. */
export type DealSide = "buyer" | "seller";

export interface Message {
  id: string;
  conversationId: string;
  direction: Direction;
  /** Display name of who wrote it ("them", "you", or a real handle). */
  author: string;
  text: string;
  ts: number;
}

export type ConversationStatus =
  | "active" // awaiting our move or theirs
  | "waiting_on_them" // we replied, ball in their court
  | "waiting_approval" // a draft is pending human approval
  | "snoozed"
  | "closed";

/**
 * A single thread on one platform. `context` carries platform-specific
 * structured facts the brain should condition on (listing price, match bio, etc.).
 */
export interface Conversation {
  id: string;
  platform: Platform;
  /** Stable handle used by the channel adapter to address the thread. */
  externalId: string;
  title: string;
  counterpart: string;
  status: ConversationStatus;
  context: ConversationContext;
  messages: Message[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationContext {
  /** For marketplace threads: are we buying from them or selling to them. */
  side?: DealSide;
  /** Free-form facts the brain conditions on: listing title, price, bio, etc. */
  listing?: {
    title: string;
    askingPrice?: number;
    currency?: string;
    url?: string;
    description?: string;
  };
  /** For dating: parsed bits from a profile. */
  profile?: {
    bio?: string;
    interests?: string[];
    matchedAt?: number;
  };
  /** For groups: the search that surfaced this lead. */
  lead?: {
    groupName: string;
    query: string;
    postUrl?: string;
    snippet?: string;
  };
  notes?: string;
}

/** Events surfaced by a channel when it polls the underlying platform. */
export type InboundEvent =
  | {
      type: "new_message";
      platform: Platform;
      externalId: string;
      title: string;
      counterpart: string;
      text: string;
      ts: number;
      context?: Partial<ConversationContext>;
    }
  | {
      type: "new_thread";
      platform: Platform;
      externalId: string;
      title: string;
      counterpart: string;
      opener?: string;
      ts: number;
      context?: Partial<ConversationContext>;
    };

/** A candidate surfaced by a group search that we may reach out to. */
export interface GroupLead {
  groupName: string;
  query: string;
  author: string;
  postUrl?: string;
  snippet: string;
  ts: number;
}

/** The structured decision the brain returns for one conversation turn. */
export interface AgentDecision {
  /**
   * reply    — send `message` to the counterpart
   * wait     — do nothing; it's their move or too soon
   * escalate — needs a human; surface `reason`
   * close    — archive the thread (spam, done, uninterested)
   */
  action: "reply" | "wait" | "escalate" | "close";
  message?: string;
  /** For marketplace negotiation: the number we're proposing, if any. */
  quote?: number;
  /**
   * Human-like delay (seconds) the brain chooses before this reply is sent.
   * A real person doesn't answer instantly: they're at work, asleep, or just
   * playing it cool. The LLM picks this based on time of day, message length,
   * and how eager it's reasonable to seem. The scheduler honors it.
   */
  replyDelaySeconds?: number;
  reason: string;
  confidence: number; // 0..1
  tags?: string[];
}

export interface Approval {
  id: string;
  conversationId: string;
  platform: Platform;
  proposedText: string;
  reason: string;
  createdAt: number;
  status: "pending" | "approved" | "rejected" | "sent";
  decidedAt?: number;
}

/**
 * An outbound message the brain has committed to but that hasn't been sent
 * yet — it's waiting out the human-like delay the LLM chose. The main loop
 * dispatches it once `sendAt` passes.
 */
export interface PendingSend {
  id: string;
  conversationId: string;
  platform: Platform;
  text: string;
  quote?: number;
  createdAt: number;
  sendAt: number;
}

export interface PersistedState {
  conversations: Record<string, Conversation>;
  approvals: Record<string, Approval>;
  pendingSends: Record<string, PendingSend>;
  /** Monotonic counters for per-platform rate limiting, keyed by yyyy-mm-dd. */
  sentCounts: Record<string, number>;
  seenLeads: string[];
}
