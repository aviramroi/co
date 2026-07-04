import Link from "next/link";
import type { CSSProperties } from "react";
import { Nav } from "@/components/Nav";

const theme = { "--accent": "#ff4d7d", "--accent-2": "#ff9d5c" } as CSSProperties;

export default function DatingLanding() {
  return (
    <div style={theme}>
      <Nav getStartedHref="/signup?use=dating" ctaLabel="Get started" />

      <header className="container hero">
        <span className="eyebrow">For the apps · Tinder, Hinge, Bumble</span>
        <h1>
          Never leave a <span className="grad">match</span> on read again.
        </h1>
        <p className="sub">
          Wingman reads your matches, replies in your voice, and paces it like a real person —
          quick banter here, a cool few hours there — until there&apos;s a date on the calendar.
        </p>
        <div className="hero-cta">
          <Link href="/signup?use=dating" className="btn primary lg">
            Get my dating wingman →
          </Link>
          <Link href="/marketplace" className="btn ghost lg">
            I&apos;m here to buy &amp; sell →
          </Link>
        </div>
      </header>

      <section className="block container">
        <div className="grid-3">
          <div className="feature">
            <div className="icon">💬</div>
            <h3>Talks like you</h3>
            <p>
              You set the voice; it opens on something real from their profile and keeps the banter
              going — never a copy-paste line.
            </p>
          </div>
          <div className="feature">
            <div className="icon">⏳</div>
            <h3>Human timing</h3>
            <p>
              It decides <em>when</em> to reply, not just what to say. Sometimes instant, sometimes
              hours later — never robotic, never thirsty.
            </p>
          </div>
          <div className="feature">
            <div className="icon">📅</div>
            <h3>Aims for the date</h3>
            <p>
              When it&apos;s going well it steers, gently, toward a concrete, low-pressure first
              meeting — and flags anything sketchy to you.
            </p>
          </div>
        </div>
      </section>

      <section className="block container" id="how">
        <div className="section-title">
          <h2>Wake up to conversations that moved forward</h2>
          <p>Connect once, set your vibe, and let it run — fully automated.</p>
        </div>
        <div className="steps">
          {[
            ["Connect your app", "Link Tinder (or Hinge/Bumble) once; your session stays saved."],
            ["Set your voice & goals", "How you text, what you're looking for, your boundaries."],
            ["It runs itself", "Reads matches, replies on your behalf, at human pace."],
            ["You show up to dates", "Jump in anytime — it hands off the moment you want to."],
          ].map(([h, p], i) => (
            <div className="step" key={i}>
              <div className="n">{i + 1}</div>
              <h4>{h}</h4>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="block container" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 30, marginBottom: 8 }}>Your wingman never sleeps on a match.</h2>
        <p style={{ color: "var(--mut)", marginBottom: 22 }}>
          Fully automated by default — with boundaries you set and a pause button that&apos;s always
          one tap away.
        </p>
        <Link href="/signup?use=dating" className="btn primary lg">
          Start for free
        </Link>
      </section>

      <footer className="footer">
        <div className="container between">
          <span>🪽 Wingman · for dating</span>
          <Link href="/marketplace">Looking to buy &amp; sell? →</Link>
        </div>
      </footer>
    </div>
  );
}
