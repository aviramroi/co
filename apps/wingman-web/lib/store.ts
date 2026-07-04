"use client";

import { defaultOnboarding, type OnboardingState } from "./types";

const KEY = "wingman.onboarding";

// Onboarding form progress is non-sensitive UI state — fine to keep in
// localStorage. Auth is handled separately via httpOnly cookies (see lib/auth).
export function loadOnboarding(): OnboardingState {
  if (typeof window === "undefined") return defaultOnboarding();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultOnboarding();
    return { ...defaultOnboarding(), ...JSON.parse(raw) };
  } catch {
    return defaultOnboarding();
  }
}

export function saveOnboarding(state: OnboardingState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
}
