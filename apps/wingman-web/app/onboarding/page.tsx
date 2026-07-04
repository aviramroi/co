"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { APPS, type AppId, type OnboardingState } from "@/lib/types";
import { loadOnboarding, saveOnboarding, getSession } from "@/lib/store";
import { activateAgent } from "@/lib/wingman";

const STEPS = ["Choose apps", "Connect", "Your voice", "Goals", "Behavior", "Activate"];

export default function OnboardingPage() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!getSession()) {
      router.replace("/signup");
      return;
    }
    setState(loadOnboarding());
  }, [router]);

  if (!state) return null;

  function update(patch: Partial<OnboardingState>) {
    setState((prev) => {
      const next = { ...prev!, ...patch };
      saveOnboarding(next);
      return next;
    });
  }

  function toggleApp(id: AppId) {
    const selected = state!.selectedApps.includes(id)
      ? state!.selectedApps.filter((a) => a !== id)
      : [...state!.selectedApps, id];
    update({ selectedApps: selected });
  }

  function connect(id: AppId) {
    // In production this opens a secure browser login and saves the session
    // (equivalent to `wingman login <app>`). Here we mark it connected.
    update({ connected: { ...state!.connected, [id]: true } });
  }

  function canAdvance(): boolean {
    setError("");
    if (step === 0 && state!.selectedApps.length === 0) {
      setError("Pick at least one app to manage.");
      return false;
    }
    if (step === 1 && !state!.selectedApps.every((a) => state!.connected[a])) {
      setError("Connect every app you selected (or go back and deselect it).");
      return false;
    }
    if (step === 2 && !state!.persona.name.trim()) {
      setError("Tell the agent what name to go by.");
      return false;
    }
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function activate() {
    setActivating(true);
    setError("");
    let ok = false;
    try {
      ok = await activateAgent(state!);
    } catch {
      ok = false;
    }
    update({ activated: true });
    setActivating(false);
    if (!ok) {
      setError(
        "Saved your setup, but couldn't reach the agent API. Start it with `wingman run` — the dashboard will connect when it's up.",
      );
    }
    router.push("/dashboard");
  }

  const selected = state.selectedApps;

  return (
    <div className="center-wrap">
      <div className="panel wide">
        <div className="stepper">
          {STEPS.map((_, i) => (
            <div key={i} className={`dot ${i < step ? "done" : ""} ${i === step ? "active" : ""}`} />
          ))}
        </div>

        <p className="muted" style={{ marginBottom: 6 }}>
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 style={{ marginBottom: 18 }}>{STEPS[step]}</h1>

        {/* STEP 0 — choose apps */}
        {step === 0 && (
          <>
            <p className="muted">Which conversations should your agent handle?</p>
            <div className="choices">
              {APPS.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button
                    type="button"
                    key={a.id}
                    className={`choice ${on ? "on" : ""}`}
                    onClick={() => toggleApp(a.id)}
                  >
                    <div className="check">{on ? "✓" : ""}</div>
                    <div className="icon">{a.icon}</div>
                    <h4>{a.name}</h4>
                    <p>{a.blurb}</p>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* STEP 1 — connect / log in */}
        {step === 1 && (
          <>
            <p className="muted">
              Link each account. In production this opens a secure browser login and saves the
              session so your agent stays signed in — your password never touches our servers.
            </p>
            {selected.map((id) => {
              const app = APPS.find((a) => a.id === id)!;
              const connected = state.connected[id];
              return (
                <div className="connect-row" key={id}>
                  <div className="left">
                    <span style={{ fontSize: 22 }}>{app.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{app.name}</div>
                      <div className="hint" style={{ margin: 0 }}>
                        {connected ? "Session saved" : "Not connected"}
                      </div>
                    </div>
                  </div>
                  {connected ? (
                    <span className="badge ok">● Connected</span>
                  ) : (
                    <button className="btn primary" type="button" onClick={() => connect(id)}>
                      Connect
                    </button>
                  )}
                </div>
              );
            })}
            <p className="hint">
              CLI equivalent: <code>wingman login {selected[0] ?? "tinder"}</code>
            </p>
          </>
        )}

        {/* STEP 2 — persona / voice */}
        {step === 2 && (
          <>
            <div className="field">
              <label>What name should the agent go by?</label>
              <input
                className="input"
                value={state.persona.name}
                onChange={(e) => update({ persona: { ...state.persona, name: e.target.value } })}
                placeholder="Alex"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Your texting voice</label>
              <textarea
                className="input"
                value={state.persona.voice}
                onChange={(e) => update({ persona: { ...state.persona, voice: e.target.value } })}
              />
              <div className="hint">How you sound — tone, length, emoji, punctuation.</div>
            </div>
            <div className="field">
              <label>Hard boundaries (one per line)</label>
              <textarea
                className="input"
                value={state.persona.boundaries}
                onChange={(e) =>
                  update({ persona: { ...state.persona, boundaries: e.target.value } })
                }
              />
              <div className="hint">Rules the agent will never break — it escalates to you instead.</div>
            </div>
          </>
        )}

        {/* STEP 3 — goals per selected app */}
        {step === 3 && (
          <>
            {selected.includes("tinder") && (
              <div className="mt24">
                <h4>🔥 Dating</h4>
                <div className="field">
                  <label>What are you looking for?</label>
                  <input
                    className="input"
                    value={state.dating.goal}
                    onChange={(e) => update({ dating: { ...state.dating, goal: e.target.value } })}
                  />
                </div>
                <div className="field">
                  <label>Your interests (comma-separated)</label>
                  <input
                    className="input"
                    value={state.dating.interests}
                    onChange={(e) =>
                      update({ dating: { ...state.dating, interests: e.target.value } })
                    }
                  />
                </div>
              </div>
            )}

            {selected.includes("marketplace") && (
              <div className="mt24">
                <h4>🛒 Marketplace</h4>
                <div className="field">
                  <label>Selling — item title</label>
                  <input
                    className="input"
                    placeholder="IKEA MALM dresser (white)"
                    value={state.marketplace.sellTitle}
                    onChange={(e) =>
                      update({ marketplace: { ...state.marketplace, sellTitle: e.target.value } })
                    }
                  />
                </div>
                <div className="row">
                  <div className="field">
                    <label>Asking price</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="120"
                      value={state.marketplace.asking}
                      onChange={(e) =>
                        update({ marketplace: { ...state.marketplace, asking: e.target.value } })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Floor (never go below)</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="85"
                      value={state.marketplace.floor}
                      onChange={(e) =>
                        update({ marketplace: { ...state.marketplace, floor: e.target.value } })
                      }
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Buying — what you want</label>
                    <input
                      className="input"
                      placeholder="used road bike 56cm"
                      value={state.marketplace.buyQuery}
                      onChange={(e) =>
                        update({ marketplace: { ...state.marketplace, buyQuery: e.target.value } })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Max price</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="600"
                      value={state.marketplace.maxPrice}
                      onChange={(e) =>
                        update({ marketplace: { ...state.marketplace, maxPrice: e.target.value } })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {selected.includes("groups") && (
              <div className="mt24">
                <h4>👥 Groups</h4>
                <div className="field">
                  <label>Groups to monitor (one per line)</label>
                  <textarea
                    className="input"
                    placeholder={"Bay Area Cycling Buy/Sell/Trade\nSF Rock Climbers"}
                    value={state.groups.groups}
                    onChange={(e) => update({ groups: { ...state.groups, groups: e.target.value } })}
                  />
                </div>
                <div className="field">
                  <label>Searches to run (comma-separated)</label>
                  <input
                    className="input"
                    placeholder="56cm road bike, climbing partner"
                    value={state.groups.queries}
                    onChange={(e) => update({ groups: { ...state.groups, queries: e.target.value } })}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* STEP 4 — behavior */}
        {step === 4 && (
          <>
            <label className="connect-row" style={{ cursor: "pointer" }}>
              <div className="left">
                <span style={{ fontSize: 22 }}>⏳</span>
                <div>
                  <div style={{ fontWeight: 600 }}>Human-like timing</div>
                  <div className="hint" style={{ margin: 0 }}>
                    The agent decides when to reply — sometimes fast, sometimes hours later.
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={state.behavior.humanLikeTiming}
                onChange={(e) =>
                  update({ behavior: { ...state.behavior, humanLikeTiming: e.target.checked } })
                }
              />
            </label>
            <label className="connect-row" style={{ cursor: "pointer" }}>
              <div className="left">
                <span style={{ fontSize: 22 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 600 }}>Approve every message before it sends</div>
                  <div className="hint" style={{ margin: 0 }}>
                    Recommended. Turn off only for channels you fully trust.
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={state.behavior.requireApproval}
                onChange={(e) =>
                  update({ behavior: { ...state.behavior, requireApproval: e.target.checked } })
                }
              />
            </label>
            <div className="field mt24">
              <label>Daily message limit per app: {state.behavior.dailyLimit}</label>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={state.behavior.dailyLimit}
                onChange={(e) =>
                  update({ behavior: { ...state.behavior, dailyLimit: Number(e.target.value) } })
                }
                style={{ width: "100%" }}
              />
              <div className="hint">A safety cap so it never blasts messages.</div>
            </div>
          </>
        )}

        {/* STEP 5 — review & activate */}
        {step === 5 && (
          <>
            <p className="muted">Here&apos;s what goes live. You can change any of this later.</p>
            <div className="connect-row">
              <div className="left">
                <span style={{ fontSize: 22 }}>🪽</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{state.persona.name || "Your agent"}</div>
                  <div className="hint" style={{ margin: 0 }}>
                    {state.behavior.humanLikeTiming ? "Human-like timing" : "Instant replies"} ·{" "}
                    {state.behavior.requireApproval ? "Approve-first" : "Auto-send"} ·{" "}
                    {state.behavior.dailyLimit}/day
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
              {selected.map((id) => (
                <span key={id} className={`tag ${id}`}>
                  {APPS.find((a) => a.id === id)!.name}
                </span>
              ))}
            </div>
            <button
              className="btn primary lg"
              style={{ width: "100%" }}
              disabled={activating}
              onClick={activate}
            >
              {activating ? "Activating…" : "Activate my Wingman →"}
            </button>
          </>
        )}

        {error && <div className="error">{error}</div>}

        <div className="between mt24">
          <button className="btn ghost" onClick={back} disabled={step === 0}>
            ← Back
          </button>
          {step < STEPS.length - 1 && (
            <button className="btn primary" onClick={next}>
              Continue →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
