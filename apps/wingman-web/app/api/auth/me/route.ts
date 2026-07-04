import { NextResponse, type NextRequest } from "next/server";
import { AGENT_URL, tokenFrom } from "@/lib/agent";

export async function GET(req: NextRequest) {
  const token = tokenFrom(req);
  if (!token) return NextResponse.json({ user: null }, { status: 401 });

  try {
    const r = await fetch(`${AGENT_URL}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ user: null }, { status: 401 });
    const user = await r.json();
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null, error: "agent unreachable" }, { status: 502 });
  }
}
