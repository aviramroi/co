export type AppId = "tinder" | "marketplace" | "groups";

export const APPS: { id: AppId; name: string; icon: string; blurb: string }[] = [
  {
    id: "tinder",
    name: "Tinder & dating",
    icon: "🔥",
    blurb: "Reads your matches and drafts replies in your voice — banter, timing, and all.",
  },
  {
    id: "marketplace",
    name: "FB Marketplace",
    icon: "🛒",
    blurb: "Answers inquiries and negotiates quotes on both sides — buying and selling.",
  },
  {
    id: "groups",
    name: "FB Groups",
    icon: "👥",
    blurb: "Searches groups for what you want and opens a warm, specific message.",
  },
];

export interface OnboardingState {
  account: { email: string } | null;
  selectedApps: AppId[];
  connected: Record<AppId, boolean>;
  persona: {
    name: string;
    voice: string;
    boundaries: string;
  };
  dating: { goal: string; interests: string; redFlags: string };
  marketplace: {
    sellTitle: string;
    asking: string;
    floor: string;
    buyQuery: string;
    maxPrice: string;
    negotiationStyle: string;
  };
  groups: { groups: string; queries: string; intent: string };
  behavior: {
    humanLikeTiming: boolean;
    requireApproval: boolean;
    dailyLimit: number;
  };
  activated: boolean;
}

export function defaultOnboarding(): OnboardingState {
  return {
    account: null,
    selectedApps: [],
    connected: { tinder: false, marketplace: false, groups: false },
    persona: {
      name: "",
      voice:
        "Warm, witty, and concise. Text like a real person — one or two sentences and a light question. One emoji at most.",
      boundaries:
        "Never send money, gift cards, or crypto. Never share my home address or full legal name. Suggest a public place for any first meeting.",
    },
    dating: {
      goal: "Find a genuine connection; keep it fun and low-pressure.",
      interests: "climbing, specialty coffee, live music",
      redFlags: "asking for money, pushing to move off-app immediately, hostile messages",
    },
    marketplace: {
      sellTitle: "",
      asking: "",
      floor: "",
      buyQuery: "",
      maxPrice: "",
      negotiationStyle: "Friendly but firm. Anchor near asking, concede slowly, hold above the floor.",
    },
    groups: {
      groups: "",
      queries: "",
      intent: "Find people selling what I want, and open a specific message referencing their post.",
    },
    behavior: { humanLikeTiming: true, requireApproval: false, dailyLimit: 30 },
    activated: false,
  };
}
