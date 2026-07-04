import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { WingmanConfig } from "../config.js";
import { saveConfig } from "../config.js";
import type { Store } from "../core/store.js";
import type { Orchestrator } from "../core/orchestrator.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import { createLogger } from "../logger.js";

const log = createLogger("server");

interface ServerDeps {
  cfg: WingmanConfig;
  store: Store;
  orchestrator: Orchestrator;
}

/**
 * Control panel + JSON API. Serves the dashboard and exposes the endpoints the
 * Next.js onboarding/dashboard app calls (state, approvals, config).
 */
export function startServer(deps: ServerDeps) {
  const { cfg, store, orchestrator } = deps;

  const server = createServer(async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") return end(res, 204);

    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        return end(res, 200, DASHBOARD_HTML);
      }
      if (req.method === "GET" && path === "/api/health") {
        return json(res, 200, { ok: true, brain: orchestrator.brainKind() });
      }
      if (req.method === "GET" && path === "/api/state") {
        return json(res, 200, buildState(deps));
      }
      if (req.method === "GET" && path === "/api/config") {
        return json(res, 200, publicConfig(cfg));
      }
      if (req.method === "POST" && path === "/api/config") {
        const body = await readJson(req);
        applyConfig(cfg, body);
        saveConfig(cfg);
        log.info("Config updated via API.");
        return json(res, 200, publicConfig(cfg));
      }
      const approvalMatch = path.match(/^\/api\/approvals\/([\w-]+)$/);
      if (req.method === "POST" && approvalMatch) {
        const id = approvalMatch[1]!;
        const body = await readJson(req);
        const approval = store.getApproval(id);
        if (!approval) return json(res, 404, { error: "not found" });
        if (body.decision === "approve") {
          if (typeof body.text === "string" && body.text.trim()) {
            store.updateApproval(id, { proposedText: body.text.trim() });
          }
          store.updateApproval(id, { status: "approved", decidedAt: Date.now() });
        } else {
          store.updateApproval(id, { status: "rejected", decidedAt: Date.now() });
        }
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: "not found" });
    } catch (err) {
      log.error(`request error: ${(err as Error).message}`);
      return json(res, 500, { error: (err as Error).message });
    }
  });

  server.listen(cfg.server.port, cfg.server.host, () => {
    log.info(`Control panel → http://${cfg.server.host}:${cfg.server.port}`);
  });
  return server;
}

function buildState(deps: ServerDeps) {
  const { cfg, store, orchestrator } = deps;
  const conversations = store.listConversations().map((c) => ({
    id: c.id,
    platform: c.platform,
    title: c.title,
    counterpart: c.counterpart,
    status: c.status,
    updatedAt: c.updatedAt,
    messages: c.messages.map((m) => ({ direction: m.direction, text: m.text, ts: m.ts })),
  }));

  const approvals = store.listApprovals("pending").map((a) => {
    const conv = store.getConversation(a.conversationId);
    return {
      id: a.id,
      platform: a.platform,
      counterpart: conv?.counterpart ?? "?",
      proposedText: a.proposedText,
      reason: a.reason,
      createdAt: a.createdAt,
    };
  });

  const stats: Record<string, number> = {
    conversations: conversations.length,
    pending: approvals.length,
    "tinder sent": store.sentToday("tinder"),
    "mktplace sent": store.sentToday("marketplace"),
    "groups sent": store.sentToday("groups"),
  };

  return {
    brain: orchestrator.brainKind(),
    stats,
    approvals,
    conversations,
    pending: store.listPendingSends().map((p) => ({
      platform: p.platform,
      sendAt: p.sendAt,
      text: p.text,
    })),
    channels: cfg.channels,
  };
}

function publicConfig(cfg: WingmanConfig) {
  return {
    persona: cfg.persona,
    dating: cfg.dating,
    marketplace: cfg.marketplace,
    groups: cfg.groups,
    channels: cfg.channels,
  };
}

/** Apply a partial config update from the onboarding app (persona/goals/modes). */
function applyConfig(cfg: WingmanConfig, body: any) {
  if (body.persona) Object.assign(cfg.persona, body.persona);
  if (body.dating) Object.assign(cfg.dating, body.dating);
  if (body.marketplace) Object.assign(cfg.marketplace, body.marketplace);
  if (body.groups) Object.assign(cfg.groups, body.groups);
  if (body.channels) {
    for (const [platform, patch] of Object.entries(body.channels)) {
      const key = platform as keyof typeof cfg.channels;
      if (cfg.channels[key]) Object.assign(cfg.channels[key], patch);
    }
  }
}

// --- http helpers ----------------------------------------------------------

function cors(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.setHeader("content-type", "application/json");
  end(res, status, JSON.stringify(body));
}

function end(res: ServerResponse, status: number, body = "") {
  res.statusCode = status;
  res.end(body);
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
