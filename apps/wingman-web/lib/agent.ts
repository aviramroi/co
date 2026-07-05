// Server-only helpers for talking to the Wingman agent API from Next.js route
// handlers. The agent URL is a server env var — never exposed to the browser.
// (Only imported by files under app/api/**, which always run on the server.)
import type { NextRequest } from "next/server";

/** Agent base URL. Accepts a scheme-less `host:port` (some PaaS service-discovery
 *  values omit the scheme) and defaults it to http:// for internal networking. */
function resolveAgentUrl(): string {
  const raw = process.env.WINGMAN_API ?? "http://127.0.0.1:4600";
  return /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
}

export const AGENT_URL = resolveAgentUrl();
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
