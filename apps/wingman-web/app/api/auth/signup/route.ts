import { NextResponse, type NextRequest } from "next/server";
import { AGENT_URL, COOKIE, cookieOptions } from "@/lib/agent";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let r: Response;
  try {
    r = await fetch(`${AGENT_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json({ error: "agent unreachable" }, { status: 502 });
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ error: data.error ?? "signup failed" }, { status: r.status });

  const res = NextResponse.json({ user: data.user }, { status: 201 });
  res.cookies.set(COOKIE, data.token, cookieOptions(data.expiresIn ?? 604800));
  return res;
}
