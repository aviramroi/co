import { NextResponse, type NextRequest } from "next/server";
import { AGENT_URL, tokenFrom } from "@/lib/agent";

/**
 * BFF proxy: /api/agent/<x> → <agent>/api/<x>, injecting the operator's bearer
 * token from the httpOnly cookie. The browser never sees the token, and the
 * agent is never exposed to the browser directly.
 */
async function proxy(req: NextRequest, path: string[], method: "GET" | "POST") {
  const token = tokenFrom(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const target = `${AGENT_URL}/api/${path.join("/")}${req.nextUrl.search}`;
  const init: RequestInit = {
    method,
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  };
  if (method === "POST") {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = await req.text();
  }

  try {
    const r = await fetch(target, init);
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "agent unreachable" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path, "GET");
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path, "POST");
}
