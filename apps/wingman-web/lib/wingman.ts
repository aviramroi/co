"use client";

import type { AppId, OnboardingState } from "./types";

// All agent calls go through the same-origin BFF proxy (/api/agent/*), which
// injects the operator's token server-side.
const AGENT = "/api/agent";

function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Translate the onboarding form into the agent's config payload. */
export function toAgentConfig(s: OnboardingState) {
  const channels: Record<string, { mode: string; requireApproval: boolean; dailyLimit: number }> = {};
  for (const app of ["tinder", "marketplace", "groups"] as AppId[]) {
    channels[app] = {
      mode: s.selectedApps.includes(app) ? "live" : "off",
      requireApproval: s.behavior.requireApproval,
      dailyLimit: s.behavior.dailyLimit,
    };
  }

  return {
    persona: {
      name: s.persona.name || "there",
      voice: s.persona.voice,
      boundaries: splitList(s.persona.boundaries),
    },
    dating: {
      goal: s.dating.goal,
      interests: splitList(s.dating.interests),
      greenLights: ["shared hobbies", "planning a casual public first date"],
      redFlags: splitList(s.dating.redFlags),
    },
    marketplace: {
      buying: s.marketplace.buyQuery
        ? [{ query: s.marketplace.buyQuery, maxPrice: Number(s.marketplace.maxPrice) || 0, currency: "USD" }]
        : [],
      selling: s.marketplace.sellTitle
        ? [
            {
              title: s.marketplace.sellTitle,
              askingPrice: Number(s.marketplace.asking) || 0,
              floorPrice: Number(s.marketplace.floor) || 0,
              currency: "USD",
            },
          ]
        : [],
      negotiationStyle: s.marketplace.negotiationStyle,
    },
    groups: {
      groups: splitList(s.groups.groups),
      queries: splitList(s.groups.queries),
      intent: s.groups.intent,
    },
    channels,
  };
}

export async function activateAgent(s: OnboardingState): Promise<boolean> {
  const res = await fetch(`${AGENT}/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toAgentConfig(s)),
  });
  return res.ok;
}

// --- channel login ---------------------------------------------------------

export interface ChannelStatus {
  platform: string;
  connected: boolean;
  state: "idle" | "awaiting" | "connected" | "error";
  message?: string;
}

export async function startChannelLogin(platform: AppId): Promise<ChannelStatus | null> {
  const r = await fetch(`${AGENT}/channels/${platform}/login/start`, { method: "POST" });
  if (!r.ok) return null;
  return r.json();
}

export async function completeChannelLogin(platform: AppId): Promise<ChannelStatus | null> {
  const r = await fetch(`${AGENT}/channels/${platform}/login/complete`, { method: "POST" });
  if (!r.ok) return null;
  return r.json();
}

export async function channelStatus(platform: AppId): Promise<ChannelStatus | null> {
  const r = await fetch(`${AGENT}/channels/${platform}/status`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

// --- dashboard state -------------------------------------------------------

export interface AgentState {
  brain: string;
  stats: Record<string, number>;
  approvals: {
    id: string;
    platform: string;
    counterpart: string;
    proposedText: string;
    reason: string;
  }[];
  conversations: {
    id: string;
    platform: string;
    title: string;
    counterpart: string;
    status: string;
    updatedAt: number;
    messages: { direction: string; text: string; ts: number }[];
  }[];
  pending: { platform: string; sendAt: number; text: string }[];
}

export async function fetchState(): Promise<AgentState | null> {
  try {
    const res = await fetch(`${AGENT}/state`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as AgentState;
  } catch {
    return null;
  }
}

export async function decideApproval(id: string, decision: "approve" | "reject", text?: string) {
  await fetch(`${AGENT}/approvals/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision, text }),
  });
}
