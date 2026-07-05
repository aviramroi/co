"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logout } from "@/lib/auth";
import { fetchState, decideApproval, type AgentState } from "@/lib/wingman";

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<AgentState | null>(null);
  const [offline, setOffline] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const s = await fetchState();
    if (!s) {
      setOffline(true);
      return;
    }
    setOffline(false);
    setState(s);
  }, []);

  useEffect(() => {
    // Route is gated by middleware; just start polling.
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  async function decide(id: string, decision: "approve" | "reject") {
    await decideApproval(id, decision, drafts[id]);
    await refresh();
  }

  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">
          <span className="logo">🪽</span> Wingman
        </Link>
        <div className="nav-links">
          <span className="tag">{state ? `brain: ${state.brain}` : offline ? "offline" : "…"}</span>
          <button
            className="btn ghost"
            onClick={async () => {
              await logout();
              router.push("/");
            }}
          >
            Log out
          </button>
        </div>
      </nav>

      <div className="container" style={{ paddingBottom: 60 }}>
        <h1 style={{ margin: "10px 0 20px" }}>Your agent</h1>

        {offline && (
          <div className="banner">
            Can&apos;t reach the agent. Start it with <code>wingman run</code> (in{" "}
            <code>apps/wingman</code>). This page reconnects automatically.
          </div>
        )}

        {state && (
          <>
            <div className="stat-cards" style={{ marginBottom: 26 }}>
              {Object.entries(state.stats).map(([k, v]) => (
                <div className="stat" key={k}>
                  <div className="n">{v}</div>
                  <div className="l">{k}</div>
                </div>
              ))}
            </div>

            <h2 style={{ fontSize: 16, color: "var(--mut)", textTransform: "uppercase", letterSpacing: 0.6 }}>
              Pending approvals
            </h2>
            {state.approvals.length === 0 ? (
              <p className="muted">Nothing awaiting your approval right now.</p>
            ) : (
              state.approvals.map((a) => (
                <div className="thread" key={a.id}>
                  <div className="between">
                    <b>{a.counterpart}</b>
                    <span className={`tag ${a.platform}`}>{a.platform}</span>
                  </div>
                  <div className="hint">{a.reason}</div>
                  <textarea
                    className="input"
                    style={{ marginTop: 8 }}
                    defaultValue={a.proposedText}
                    onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="btn primary" onClick={() => decide(a.id, "approve")}>
                      Approve &amp; send
                    </button>
                    <button className="btn ghost" onClick={() => decide(a.id, "reject")}>
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}

            {state.pending.length > 0 && (
              <div className="banner" style={{ marginTop: 20 }}>
                ⏳ {state.pending.length} message(s) queued to send at a human-like time.
              </div>
            )}

            <h2
              style={{
                fontSize: 16,
                color: "var(--mut)",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginTop: 28,
              }}
            >
              Conversations
            </h2>
            {state.conversations.length === 0 ? (
              <p className="muted">No conversations yet — they&apos;ll show up as activity comes in.</p>
            ) : (
              state.conversations.map((c) => (
                <div className="thread" key={c.id}>
                  <div className="between">
                    <b>
                      {c.counterpart} · {c.title}
                    </b>
                    <span className={`tag ${c.platform}`}>{c.platform}</span>
                  </div>
                  <div className="hint">
                    {c.status} · {new Date(c.updatedAt).toLocaleString()}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {c.messages.slice(-6).map((m, i) => (
                      <div key={i} className={`bubble ${m.direction}`}>
                        {m.text}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}
