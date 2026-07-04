"use client";

// Client-side auth — talks to same-origin Next.js route handlers, which set an
// httpOnly cookie. No token ever lives in JS/localStorage.

export interface Me {
  id: string;
  email: string;
}

async function post(path: string, body: unknown): Promise<{ user?: Me }> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "request failed");
  return data;
}

export function signup(email: string, password: string) {
  return post("/api/auth/signup", { email, password });
}

export function login(email: string, password: string) {
  return post("/api/auth/login", { email, password });
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function me(): Promise<Me | null> {
  try {
    const r = await fetch("/api/auth/me", { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}
