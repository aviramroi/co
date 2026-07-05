"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { login } from "@/lib/auth";
import { loadOnboarding } from "@/lib/store";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Enter a valid email.");
    if (!password) return setError("Enter your password.");

    setBusy(true);
    try {
      await login(email, password);
      const next = params.get("next");
      const dest = next || (loadOnboarding().activated ? "/dashboard" : "/onboarding");
      router.push(dest);
    } catch (err) {
      setError((err as Error).message || "Login failed.");
    } finally {
      setBusy(false);
    }
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

          <button className="btn primary lg" style={{ width: "100%", marginTop: 8 }} type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Log in →"}
          </button>
          <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
            New here? <Link href="/signup">Create an account</Link>
          </p>
        </form>
      </div>
    </>
  );
}
