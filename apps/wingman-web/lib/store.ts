"use client";

import { defaultOnboarding, type OnboardingState } from "./types";

const KEY = "wingman.onboarding";
const SESSION_KEY = "wingman.session";

/** Local persistence for the demo account + onboarding progress. */
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

export function setSession(email: string) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ email, at: Date.now() }));
}

export function getSession(): { email: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
