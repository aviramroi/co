import Link from "next/link";
import { Nav } from "@/components/Nav";
import { APPS } from "@/lib/types";

export default function LandingPage() {
  return (
    <>
      <Nav />

      <header className="container hero">
        <span className="eyebrow">Your AI wingman · always on</span>
        <h1>
          One agent that runs your <span className="grad">dating</span> and{" "}
          <span className="grad">marketplace</span> chats.
        </h1>
        <p className="sub">
          Wingman reads your Tinder matches, Facebook Marketplace inquiries, and group posts —
          then drafts replies in your voice, negotiates deals, and reaches out to leads. It waits,
          types, and replies like a human, and never sends anything you haven&apos;t okayed.
        </p>
        <div className="hero-cta">
          <Link href="/signup" className="btn primary lg">
            Get started free →
          </Link>
          <Link href="/login" className="btn ghost lg">
            I have an account
          </Link>
        </div>
      </header>

      <section className="block container">
        <div className="section-title">
          <h2>Three channels, one brain</h2>
          <p>Pick what you want it to handle. Turn any of them off anytime.</p>
        </div>
        <div className="grid-3">
          {APPS.map((a) => (
            <div className="feature" key={a.id}>
              <div className="icon">{a.icon}</div>
              <h3>{a.name}</h3>
              <p>{a.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="block container" id="how">
        <div className="section-title">
          <h2>From sign-up to on-your-behalf in minutes</h2>
          <p>A quick, guided onboarding gets your agent live and drafting.</p>
        </div>
        <div className="steps">
          {[
            ["Create your account", "Email and a password. That's it to start."],
            ["Choose your apps", "Tinder, Marketplace, Groups — pick any mix."],
            ["Connect & log in", "Securely link each account with a saved session."],
            ["Set your voice & goals", "Tell it how you sound and what you want."],
            ["Activate", "It goes live — drafting, timing, and negotiating for you."],
          ].map(([h, p], i) => (
            <div className="step" key={i}>
              <div className="n">{i + 1}</div>
              <h4>{h}</h4>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="block container">
        <div className="feature" style={{ textAlign: "center", padding: "34px" }}>
          <div className="icon">🧠⏳</div>
          <h3 style={{ fontSize: 22 }}>It behaves like a human, not a bot</h3>
          <p style={{ maxWidth: 620, margin: "8px auto 0" }}>
            The agent decides <em>when</em> to reply, not just what to say — sometimes fast, sometimes
            hours later, matching the hour, the vibe, and how eager it&apos;s reasonable to seem. It types
            at human speed and holds back when it&apos;s genuinely their turn.
          </p>
        </div>
      </section>

      <section className="block container" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 30, marginBottom: 8 }}>Ready to meet your wingman?</h2>
        <p style={{ color: "var(--mut)", marginBottom: 22 }}>
          You stay in control — approve drafts, set boundaries, pause anytime.
        </p>
        <Link href="/signup" className="btn primary lg">
          Create your account
        </Link>
      </section>

      <footer className="footer">
        <div className="container between">
          <span>🪽 Wingman · your AI agent for dating &amp; marketplace</span>
          <span>You&apos;re always in control — approve drafts, set boundaries, pause anytime.</span>
        </div>
      </footer>
    </>
  );
}
