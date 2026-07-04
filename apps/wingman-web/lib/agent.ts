// Server-only helpers for talking to the Wingman agent API from Next.js route
// handlers. The agent URL is a server env var — never exposed to the browser.
// (Only imported by files under app/api/**, which always run on the server.)
import type { NextRequest } from "next/server";

export const AGENT_URL = process.env.WINGMAN_API ?? "http://127.0.0.1:4600";
export const COOKIE = "wm_token";

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function tokenFrom(req: NextRequest): string | undefined {
  return req.cookies.get(COOKIE)?.value;
}
