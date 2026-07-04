import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { config as loadEnv } from "dotenv";
import type { Platform } from "./types.js";

loadEnv();

export type ChannelMode = "mock" | "live" | "off";

export interface ChannelConfig {
  mode: ChannelMode;
  /** Max outbound messages this channel may send per day (safety cap). */
  dailyLimit: number;
  /** Draft-and-approve (true) vs auto-send low-risk replies (false). */
  requireApproval: boolean;
}

export interface Persona {
  /** Who the agent is speaking as. */
  name: string;
  /** Voice/style guidance the brain follows in every message. */
  voice: string;
  /** Hard rules the agent must never break (used as guardrails in the prompt). */
  boundaries: string[];
}

export interface DatingObjective {
  goal: string; // e.g. "find a genuine relationship", "casual, low-pressure"
  interests: string[];
  /** Topics/opening lines to lean into. */
  greenLights: string[];
  /** Things that should trigger escalation to the human. */
  redFlags: string[];
}

export interface MarketplaceObjective {
  /** Items the user is actively trying to buy (with a max price). */
  buying: { query: string; maxPrice: number; currency: string }[];
  /** Listings the user is selling (with a floor price). */
  selling: {
    title: string;
    askingPrice: number;
    floorPrice: number;
    currency: string;
    description?: string;
  }[];
  /** Negotiation posture: how hard to haggle. */
  negotiationStyle: string;
}

export interface GroupsObjective {
  /** Groups (names or URLs) to monitor. */
  groups: string[];
  /** Keyword searches to run inside those groups. */
  queries: string[];
  /** What a good lead looks like and what the outreach should accomplish. */
  intent: string;
}

export interface WingmanConfig {
  persona: Persona;
  dating: DatingObjective;
  marketplace: MarketplaceObjective;
  groups: GroupsObjective;
  channels: Record<Platform, ChannelConfig>;
  /** How often the orchestrator polls channels, in ms. */
  pollIntervalMs: number;
  /** Where state + browser sessions are persisted. */
  stateDir: string;
  /** HTTP control panel. */
  server: { enabled: boolean; port: number; host: string };
  /** Auth + API security. */
  auth: {
    /** HMAC secret for signing JWTs. MUST be set in production. */
    secret: string;
    /** Token lifetime in seconds. */
    ttlSeconds: number;
    /** Allow open account creation (else only the first/bootstrap account). */
    allowSignup: boolean;
    /** CORS allow-origin for the web app (exact origin, or "*" to disable check). */
    webOrigin: string;
  };
  llm: {
    model: string;
    /** effort for the brain: low|medium|high. Messaging is fine at medium. */
    effort: "low" | "medium" | "high";
    /** If no API key is present, fall back to a deterministic heuristic brain. */
    apiKey?: string;
  };
}

const DEFAULT_CONFIG: WingmanConfig = {
  persona: {
    name: "Alex",
    voice:
      "Warm, witty, and concise. Text like a real person: lowercase-friendly, " +
      "one or two sentences, a light question to keep things going. Never salesy, " +
      "never a wall of text, no emoji spam (one at most).",
    boundaries: [
      "Never send money, gift cards, or crypto, and never share financial details.",
      "Never share the user's home address, exact location, or full legal name unprompted.",
      "Never agree to meet at a private residence for a first meeting — suggest a public place.",
      "Never impersonate a different real person or lie about material facts.",
      "If anything feels like a scam, coercion, or minors are involved, stop and escalate.",
    ],
  },
  dating: {
    goal: "Find a genuine connection; keep conversations fun and low-pressure.",
    interests: ["climbing", "specialty coffee", "live music", "trail running"],
    greenLights: [
      "shared hobbies or a specific detail from their profile",
      "planning a concrete, casual first date (coffee, a walk, a show)",
    ],
    redFlags: [
      "asking for money or off-platform payment apps early",
      "pushing to move to WhatsApp/Telegram immediately",
      "aggressive, hostile, or explicit messages",
    ],
  },
  marketplace: {
    buying: [{ query: "used road bike 56cm", maxPrice: 600, currency: "USD" }],
    selling: [
      {
        title: "IKEA MALM 6-drawer dresser (white)",
        askingPrice: 120,
        floorPrice: 85,
        currency: "USD",
        description: "Great condition, from a smoke-free home. Pickup only.",
      },
    ],
    negotiationStyle:
      "Friendly but firm. Anchor near asking, concede in small steps, hold above the floor, " +
      "and prefer a quick clean sale over squeezing the last few dollars.",
  },
  groups: {
    groups: ["Bay Area Cycling Buy/Sell/Trade", "SF Rock Climbers"],
    queries: ["56cm road bike", "climbing partner", "belay"],
    intent:
      "Find people selling gear I'm looking for, or looking for a climbing partner, and open " +
      "a friendly, specific message that references their post.",
  },
  channels: {
    tinder: { mode: "mock", dailyLimit: 40, requireApproval: true },
    marketplace: { mode: "mock", dailyLimit: 40, requireApproval: true },
    groups: { mode: "mock", dailyLimit: 15, requireApproval: true },
  },
  pollIntervalMs: 15_000,
  stateDir: ".wingman",
  server: { enabled: true, port: 4600, host: "127.0.0.1" },
  auth: { secret: "", ttlSeconds: 7 * 24 * 3600, allowSignup: false, webOrigin: "http://localhost:3000" },
  llm: { model: "claude-opus-4-8", effort: "medium" },
};

function deepMerge<T>(base: T, override: Partial<T> | undefined): T {
  if (!override) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = (base as any)[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      out[key] = deepMerge(current, value as any);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Load config from (in order of precedence, low → high):
 *   defaults → JSON file (WINGMAN_CONFIG or ./wingman.config.json) → env overrides.
 */
export function loadConfig(): WingmanConfig {
  let fileConfig: Partial<WingmanConfig> | undefined;
  const path = process.env.WINGMAN_CONFIG || resolve(process.cwd(), "wingman.config.json");
  if (existsSync(path)) {
    try {
      fileConfig = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      throw new Error(`Failed to parse config at ${path}: ${(err as Error).message}`);
    }
  }

  let cfg = deepMerge(DEFAULT_CONFIG, fileConfig);

  // Env overrides for the knobs most useful in deployment.
  cfg.llm.apiKey = process.env.ANTHROPIC_API_KEY || cfg.llm.apiKey;
  if (process.env.WINGMAN_MODEL) cfg.llm.model = process.env.WINGMAN_MODEL;
  if (process.env.WINGMAN_STATE_DIR) cfg.stateDir = process.env.WINGMAN_STATE_DIR;
  if (process.env.WINGMAN_PORT) cfg.server.port = Number(process.env.WINGMAN_PORT);
  if (process.env.WINGMAN_HOST) cfg.server.host = process.env.WINGMAN_HOST;
  if (process.env.PORT) cfg.server.port = Number(process.env.PORT); // PaaS convention
  if (process.env.WINGMAN_POLL_MS) cfg.pollIntervalMs = Number(process.env.WINGMAN_POLL_MS);

  // Per-channel mode override, e.g. WINGMAN_TINDER_MODE=live
  for (const platform of ["tinder", "marketplace", "groups"] as const) {
    const envMode = process.env[`WINGMAN_${platform.toUpperCase()}_MODE`] as ChannelMode | undefined;
    if (envMode) cfg.channels[platform].mode = envMode;
  }

  // Auth + security.
  if (process.env.WINGMAN_WEB_ORIGIN) cfg.auth.webOrigin = process.env.WINGMAN_WEB_ORIGIN;
  if (process.env.WINGMAN_ALLOW_SIGNUP) cfg.auth.allowSignup = process.env.WINGMAN_ALLOW_SIGNUP === "1";
  if (process.env.WINGMAN_AUTH_TTL) cfg.auth.ttlSeconds = Number(process.env.WINGMAN_AUTH_TTL);
  cfg.auth.secret = resolveAuthSecret(cfg.stateDir);

  return cfg;
}

/**
 * Resolve the JWT signing secret. In production `WINGMAN_AUTH_SECRET` is required.
 * In dev, fall back to a per-install secret persisted under the state dir so
 * tokens survive restarts (with a warning).
 */
function resolveAuthSecret(stateDir: string): string {
  const fromEnv = process.env.WINGMAN_AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "WINGMAN_AUTH_SECRET must be set (>=16 chars) in production. " +
        "Generate one with: openssl rand -hex 32",
    );
  }

  const dir = resolve(process.cwd(), stateDir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "secret.key");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(32).toString("hex");
  writeFileSync(file, secret, { mode: 0o600 });
  console.warn(
    "[config] WINGMAN_AUTH_SECRET not set — generated a dev secret at " +
      `${file}. Set an explicit secret in production.`,
  );
  return secret;
}

/**
 * Persist the runtime config back to the JSON file the onboarding app manages.
 * Persona/goal edits apply live (the brain reads config on every decision);
 * channel-mode changes take effect on the next restart.
 */
export function saveConfig(cfg: WingmanConfig, path?: string) {
  const target = path || process.env.WINGMAN_CONFIG || resolve(process.cwd(), "wingman.config.json");
  const persisted = {
    persona: cfg.persona,
    dating: cfg.dating,
    marketplace: cfg.marketplace,
    groups: cfg.groups,
    channels: cfg.channels,
    pollIntervalMs: cfg.pollIntervalMs,
    stateDir: cfg.stateDir,
    server: cfg.server,
    llm: { model: cfg.llm.model, effort: cfg.llm.effort },
  };
  writeFileSync(target, JSON.stringify(persisted, null, 2));
}
