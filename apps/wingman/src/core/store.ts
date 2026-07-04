import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Approval,
  Conversation,
  Message,
  PendingSend,
  PersistedState,
  Platform,
} from "../types.js";
import { createLogger } from "../logger.js";

const log = createLogger("store");

function emptyState(): PersistedState {
  return { conversations: {}, approvals: {}, pendingSends: {}, sentCounts: {}, seenLeads: [] };
}

/**
 * JSON-file-backed state. Small enough for a single agent's workload; swap for
 * SQLite/Postgres by reimplementing this class against the same surface.
 * Writes are atomic (temp file + rename) and debounced.
 */
export class Store {
  private state: PersistedState;
  private readonly file: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(stateDir: string) {
    const dir = resolve(process.cwd(), stateDir);
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "state.json");
    this.state = this.read();
  }

  private read(): PersistedState {
    if (!existsSync(this.file)) return emptyState();
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as PersistedState;
      return { ...emptyState(), ...parsed };
    } catch (err) {
      log.error(`Corrupt state file, starting fresh: ${(err as Error).message}`);
      return emptyState();
    }
  }

  /** Debounced atomic write. */
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const tmp = `${this.file}.${randomUUID()}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      renameSync(tmp, this.file);
    }, 250);
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const tmp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
  }

  snapshot(): PersistedState {
    return this.state;
  }

  // --- conversations -------------------------------------------------------

  listConversations(): Conversation[] {
    return Object.values(this.state.conversations).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getConversation(id: string): Conversation | undefined {
    return this.state.conversations[id];
  }

  findByExternalId(platform: Platform, externalId: string): Conversation | undefined {
    return Object.values(this.state.conversations).find(
      (c) => c.platform === platform && c.externalId === externalId,
    );
  }

  upsertConversation(conv: Conversation) {
    this.state.conversations[conv.id] = conv;
    this.save();
  }

  addMessage(conversationId: string, msg: Omit<Message, "id" | "conversationId">): Message {
    const conv = this.state.conversations[conversationId];
    if (!conv) throw new Error(`No conversation ${conversationId}`);
    const full: Message = { id: randomUUID(), conversationId, ...msg };
    conv.messages.push(full);
    conv.updatedAt = full.ts;
    this.save();
    return full;
  }

  // --- approvals -----------------------------------------------------------

  createApproval(a: Omit<Approval, "id" | "createdAt" | "status">): Approval {
    const approval: Approval = {
      id: randomUUID(),
      createdAt: Date.now(),
      status: "pending",
      ...a,
    };
    this.state.approvals[approval.id] = approval;
    this.save();
    return approval;
  }

  getApproval(id: string): Approval | undefined {
    return this.state.approvals[id];
  }

  listApprovals(status?: Approval["status"]): Approval[] {
    return Object.values(this.state.approvals)
      .filter((a) => !status || a.status === status)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  updateApproval(id: string, patch: Partial<Approval>) {
    const a = this.state.approvals[id];
    if (!a) return;
    Object.assign(a, patch);
    this.save();
  }

  // --- pending sends (human-like delayed dispatch) -------------------------

  schedulePendingSend(p: Omit<PendingSend, "id" | "createdAt">): PendingSend {
    const send: PendingSend = { id: randomUUID(), createdAt: Date.now(), ...p };
    this.state.pendingSends[send.id] = send;
    this.save();
    return send;
  }

  listPendingSends(): PendingSend[] {
    return Object.values(this.state.pendingSends).sort((a, b) => a.sendAt - b.sendAt);
  }

  duePendingSends(now: number): PendingSend[] {
    return this.listPendingSends().filter((p) => p.sendAt <= now);
  }

  removePendingSend(id: string) {
    delete this.state.pendingSends[id];
    this.save();
  }

  /** True if a conversation already has a queued outbound (avoid double-drafting). */
  hasPendingFor(conversationId: string): boolean {
    return (
      Object.values(this.state.pendingSends).some((p) => p.conversationId === conversationId) ||
      this.listApprovals("pending").some((a) => a.conversationId === conversationId)
    );
  }

  // --- rate limiting -------------------------------------------------------

  private key(platform: Platform, day: string) {
    return `${platform}:${day}`;
  }

  sentToday(platform: Platform): number {
    return this.state.sentCounts[this.key(platform, today())] ?? 0;
  }

  incrementSent(platform: Platform) {
    const k = this.key(platform, today());
    this.state.sentCounts[k] = (this.state.sentCounts[k] ?? 0) + 1;
    this.save();
  }

  // --- group leads dedupe --------------------------------------------------

  isLeadSeen(fingerprint: string): boolean {
    return this.state.seenLeads.includes(fingerprint);
  }

  markLeadSeen(fingerprint: string) {
    if (!this.state.seenLeads.includes(fingerprint)) {
      this.state.seenLeads.push(fingerprint);
      // keep the list bounded
      if (this.state.seenLeads.length > 5000) this.state.seenLeads.splice(0, 1000);
      this.save();
    }
  }
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
