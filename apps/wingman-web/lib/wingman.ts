"use client";

import type { AppId, OnboardingState } from "./types";

/** Base URL of the running Wingman agent's control API. */
export const WINGMAN_API =
  process.env.NEXT_PUBLIC_WINGMAN_API ?? "http://127.0.0.1:4600";

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
        ? [
            {
              query: s.marketplace.buyQuery,
              maxPrice: Number(s.marketplace.maxPrice) || 0,
              currency: "USD",
            },
          ]
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

/** Push the built config to the agent. Returns true on success. */
export async function activateAgent(s: OnboardingState): Promise<boolean> {
  const res = await fetch(`${WINGMAN_API}/api/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toAgentConfig(s)),
  });
  return res.ok;
}

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
    const res = await fetch(`${WINGMAN_API}/api/state`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as AgentState;
  } catch {
    return null;
  }
}

export async function decideApproval(id: string, decision: "approve" | "reject", text?: string) {
  await fetch(`${WINGMAN_API}/api/approvals/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision, text }),
  });
}
