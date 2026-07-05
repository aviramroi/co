import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { WingmanConfig } from "../config.js";
import { saveConfig } from "../config.js";
import type { Store } from "../core/store.js";
import type { Orchestrator } from "../core/orchestrator.js";
import { AuthStore, type User } from "../auth/authStore.js";
import { signJwt, verifyJwt } from "../auth/jwt.js";
import { RateLimiter } from "../auth/rateLimit.js";
import { LoginManager } from "../channels/loginManager.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import { createLogger } from "../logger.js";
import type { Platform } from "../types.js";

const log = createLogger("server");
const PLATFORMS: Platform[] = ["tinder", "marketplace", "groups"];

interface ServerDeps {
  cfg: WingmanConfig;
  store: Store;
  orchestrator: Orchestrator;
}

/**
 * Control panel + JSON API, with JWT auth on everything except health and the
 * auth endpoints. The Next.js app talks to this through its own BFF (token in an
 * httpOnly cookie server-side), so the browser never holds the token directly.
 */
export function startServer(deps: ServerDeps) {
  const { cfg, store, orchestrator } = deps;
  const auth = new AuthStore(cfg.stateDir);
  const logins = new LoginManager(cfg.stateDir);
  const loginLimiter = new RateLimiter(10, 5 * 60_000);
  setInterval(() => loginLimiter.sweep(), 60_000).unref();

  const server = createServer(async (req, res) => {
    securityHeaders(res);
    applyCors(res, req, cfg.auth.webOrigin);
    if (req.method === "OPTIONS") return end(res, 204);

    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";

    try {
      // --- public routes ---
      if (method === "GET" && path === "/") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        return end(res, 200, DASHBOARD_HTML);
      }
      if (method === "GET" && path === "/api/health") {
        return json(res, 200, { ok: true, brain: orchestrator.brainKind() });
      }
      if (method === "POST" && path === "/api/auth/signup") {
        return handleSignup(req, res, cfg, auth, loginLimiter);
      }
      if (method === "POST" && path === "/api/auth/login") {
        return handleLogin(req, res, cfg, auth, loginLimiter);
      }

      // --- everything below requires a valid token ---
      const user = authenticate(req, cfg.auth.secret, auth);
      if (!user) return json(res, 401, { error: "unauthorized" });

      if (method === "GET" && path === "/api/auth/me") {
        return json(res, 200, { id: user.id, email: user.email });
      }
      if (method === "GET" && path === "/api/state") {
        return json(res, 200, buildState(deps, logins));
      }
      if (method === "GET" && path === "/api/config") {
        return json(res, 200, publicConfig(cfg));
      }
      if (method === "POST" && path === "/api/config") {
        const body = await readJson(req);
        const err = applyConfig(cfg, body);
        if (err) return json(res, 400, { error: err });
        saveConfig(cfg);
        log.info(`Config updated by ${user.email}.`);
        return json(res, 200, publicConfig(cfg));
      }

      const approvalMatch = path.match(/^\/api\/approvals\/([\w-]+)$/);
      if (method === "POST" && approvalMatch) {
        return handleApproval(req, res, store, approvalMatch[1]!);
      }

      // --- channel login ---
      if (method === "GET" && path === "/api/channels") {
        return json(res, 200, { channels: channelStatus(cfg, logins) });
      }
      const loginMatch = path.match(/^\/api\/channels\/(\w+)\/login\/(start|complete|cancel)$/);
      if (method === "POST" && loginMatch) {
        const platform = loginMatch[1] as Platform;
        if (!PLATFORMS.includes(platform)) return json(res, 404, { error: "unknown platform" });
        const action = loginMatch[2];
        const result =
          action === "start"
            ? await logins.start(platform)
            : action === "complete"
              ? await logins.complete(platform)
              : (await logins.cancel(platform), logins.status(platform));
        return json(res, 200, { platform, ...result });
      }
      const statusMatch = path.match(/^\/api\/channels\/(\w+)\/status$/);
      if (method === "GET" && statusMatch) {
        const platform = statusMatch[1] as Platform;
        if (!PLATFORMS.includes(platform)) return json(res, 404, { error: "unknown platform" });
        return json(res, 200, { platform, ...logins.status(platform) });
      }
      const sessionMatch = path.match(/^\/api\/channels\/(\w+)\/session$/);
      if (method === "POST" && sessionMatch) {
        const platform = sessionMatch[1] as Platform;
        if (!PLATFORMS.includes(platform)) return json(res, 404, { error: "unknown platform" });
        const body = await readJson(req);
        const state = body?.storageState ?? body;
        const result = logins.importSession(platform, state);
        const status = result.state === "error" ? 400 : 200;
        return json(res, status, { platform, ...result });
      }

      return json(res, 404, { error: "not found" });
    } catch (err) {
      log.error(`request error: ${(err as Error).message}`);
      return json(res, 500, { error: "internal error" });
    }
  });

  server.on("close", () => void logins.closeAll());
  server.listen(cfg.server.port, cfg.server.host, () => {
    log.info(`Control panel → http://${cfg.server.host}:${cfg.server.port}`);
    if (auth.count() === 0) {
      log.warn(
        "No operator account yet. Create one via the web sign-up, `wingman useradd`, " +
          "or POST /api/auth/signup.",
      );
    }
  });
  return server;
}

// --- auth handlers ---------------------------------------------------------

async function handleSignup(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WingmanConfig,
  auth: AuthStore,
  limiter: RateLimiter,
) {
  if (!limiter.check(`signup:${clientIp(req)}`)) return json(res, 429, { error: "too many attempts" });
  // Bootstrap: allow the first account always; further signups only if enabled.
  if (auth.count() > 0 && !cfg.auth.allowSignup) {
    return json(res, 403, { error: "signups are closed" });
  }
  const body = await readJson(req);
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const bad = validateCredentials(email, password);
  if (bad) return json(res, 400, { error: bad });
  if (auth.getByEmail(email)) return json(res, 409, { error: "account already exists" });

  const user = auth.create(email, password);
  return json(res, 201, issueToken(user, cfg));
}

async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WingmanConfig,
  auth: AuthStore,
  limiter: RateLimiter,
) {
  const body = await readJson(req);
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!limiter.check(`login:${clientIp(req)}:${email.toLowerCase()}`)) {
    return json(res, 429, { error: "too many attempts, try again later" });
  }
  const user = auth.verify(email, password);
  if (!user) return json(res, 401, { error: "invalid email or password" });
  return json(res, 200, issueToken(user, cfg));
}

function issueToken(user: User, cfg: WingmanConfig) {
  const token = signJwt({ sub: user.id, email: user.email }, cfg.auth.secret, cfg.auth.ttlSeconds);
  return { token, expiresIn: cfg.auth.ttlSeconds, user: { id: user.id, email: user.email } };
}

function authenticate(req: IncomingMessage, secret: string, auth: AuthStore): User | null {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) return null;
  const payload = verifyJwt(header.slice(7), secret);
  if (!payload) return null;
  return auth.getById(payload.sub) ?? null;
}

async function handleApproval(
  req: IncomingMessage,
  res: ServerResponse,
  store: Store,
  id: string,
) {
  const body = await readJson(req);
  const approval = store.getApproval(id);
  if (!approval) return json(res, 404, { error: "not found" });
  if (body.decision === "approve") {
    if (typeof body.text === "string" && body.text.trim()) {
      store.updateApproval(id, { proposedText: body.text.trim() });
    }
    store.updateApproval(id, { status: "approved", decidedAt: Date.now() });
  } else if (body.decision === "reject") {
    store.updateApproval(id, { status: "rejected", decidedAt: Date.now() });
  } else {
    return json(res, 400, { error: "decision must be approve or reject" });
  }
  return json(res, 200, { ok: true });
}

// --- state / config --------------------------------------------------------

function channelStatus(cfg: WingmanConfig, logins: LoginManager) {
  return PLATFORMS.map((p) => ({
    platform: p,
    mode: cfg.channels[p].mode,
    ...logins.status(p),
  }));
}

function buildState(deps: ServerDeps, logins: LoginManager) {
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
    channels: channelStatus(cfg, logins),
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

/** Validate + apply a partial config update. Returns an error string or null. */
function applyConfig(cfg: WingmanConfig, body: any): string | null {
  if (typeof body !== "object" || body === null) return "invalid body";
  if (body.persona) {
    if (body.persona.name != null && typeof body.persona.name !== "string") return "persona.name must be a string";
    Object.assign(cfg.persona, body.persona);
  }
  if (body.dating) Object.assign(cfg.dating, body.dating);
  if (body.marketplace) Object.assign(cfg.marketplace, body.marketplace);
  if (body.groups) Object.assign(cfg.groups, body.groups);
  if (body.channels) {
    for (const [platform, patch] of Object.entries(body.channels)) {
      const key = platform as Platform;
      if (!PLATFORMS.includes(key)) continue;
      const p = patch as any;
      if (p.mode && !["mock", "live", "off"].includes(p.mode)) return `invalid mode for ${platform}`;
      if (p.dailyLimit != null && (typeof p.dailyLimit !== "number" || p.dailyLimit < 0))
        return `invalid dailyLimit for ${platform}`;
      Object.assign(cfg.channels[key], patch);
    }
  }
  return null;
}

function validateCredentials(email: string, password: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "invalid email";
  if (password.length < 8) return "password must be at least 8 characters";
  if (password.length > 200) return "password too long";
  return null;
}

// --- http helpers ----------------------------------------------------------

function securityHeaders(res: ServerResponse) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
}

function applyCors(res: ServerResponse, req: IncomingMessage, allowed: string) {
  const origin = req.headers.origin;
  if (allowed === "*") {
    res.setHeader("access-control-allow-origin", "*");
  } else if (origin && origin === allowed) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  }
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization");
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
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
