"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { signup } from "@/lib/auth";
import { loadOnboarding, saveOnboarding } from "@/lib/store";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");

    setBusy(true);
    try {
      await signup(email, password);
      const state = loadOnboarding();
      state.account = { email };
      saveOnboarding(state);
      router.push("/onboarding");
    } catch (err) {
      setError((err as Error).message || "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav cta={false} />
      <div className="center-wrap">
        <form className="panel" onSubmit={submit}>
          <h1>Create your account</h1>
          <p className="muted">Start your agent in a few minutes.</p>

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
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input
              className="input"
              type="password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button className="btn primary lg" style={{ width: "100%", marginTop: 8 }} type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account →"}
          </button>
          <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
            Already have one? <Link href="/login">Log in</Link>
          </p>
        </form>
      </div>
    </>
  );
}
