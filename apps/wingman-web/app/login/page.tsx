"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { loadOnboarding, saveOnboarding, setSession } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Enter a valid email.");
    if (!password) return setError("Enter your password.");

    const state = loadOnboarding();
    if (!state.account) state.account = { email };
    saveOnboarding(state);
    setSession(email);
    // Resume where they left off: dashboard if activated, else onboarding.
    router.push(state.activated ? "/dashboard" : "/onboarding");
  }

  return (
    <>
      <Nav cta={false} />
      <div className="center-wrap">
        <form className="panel" onSubmit={submit}>
          <h1>Welcome back</h1>
          <p className="muted">Log in to your Wingman.</p>

          <div className="field">
            <label>Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button className="btn primary lg" style={{ width: "100%", marginTop: 8 }} type="submit">
            Log in →
          </button>
          <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
            New here? <Link href="/signup">Create an account</Link>
          </p>
        </form>
      </div>
    </>
  );
}
