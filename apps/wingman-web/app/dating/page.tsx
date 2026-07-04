import Link from "next/link";
import type { CSSProperties } from "react";
import { PremiumNav } from "@/components/PremiumNav";
import { ChatMock } from "@/components/ChatMock";

const theme = {
  "--acc": "#ff4d7d",
  "--acc2": "#ff8a5b",
  "--acc-ink": "#ffb0c4",
} as CSSProperties;

export default function DatingLanding() {
  return (
    <div className="lp" style={theme}>
      <PremiumNav getStartedHref="/signup?use=dating" />

      {/* Hero */}
      <div className="lp-wrap lp-hero">
        <span className="lp-eyebrow">
          <span className="dot" /> For Tinder, Hinge &amp; Bumble
        </span>
        <h1 className="lp-h1">
          Never leave a <span className="lp-grad">match</span> on read again.
        </h1>
        <p className="lp-sub">
          Wingman reads your matches, replies in your voice, and paces every message like a real
          person — until there&apos;s a date on the calendar. Fully automated. You just show up.
        </p>
        <div className="lp-cta">
          <Link href="/signup?use=dating" className="lp-btn primary lg">
            Get my dating wingman →
          </Link>
          <Link href="/marketplace" className="lp-btn ghost lg">
            I&apos;m here to buy &amp; sell
          </Link>
        </div>
        <div className="lp-cta-note">
          <span>✦ Free to start · your voice · pause anytime</span>
        </div>

        <div className="lp-hero-visual">
          <ChatMock
            name="Maya"
            initials="M"
            platform="Tinder"
            status="replying in your voice"
            chip="human timing"
            messages={[
              { from: "them", text: "outdoor for sure — my gym has a killer bouldering wall tho 😄" },
              { from: "you", text: "ok that's a green flag. free saturday for a coffee before a climb?", time: "sent 2h later" },
              { from: "them", text: "haha yes actually. 10am?" },
            ]}
          />
        </div>

        {/* Logo cloud */}
        <div className="lp-cloud">
          <div className="lp-cloud-label">Runs on the apps you already use</div>
          <div className="lp-cloud-row">
            <span className="lp-logo">🔥 Tinder</span>
            <span className="lp-logo">💜 Hinge</span>
            <span className="lp-logo">🟡 Bumble</span>
            <span className="lp-logo">💬 Messenger</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="lp-wrap lp-section" style={{ paddingTop: 40 }}>
        <div className="lp-stats">
          {[
            ["0", "texts you have to write"],
            ["24/7", "always on, never bored"],
            ["~2h", "human-like reply delay"],
            ["100%", "in your own voice"],
          ].map(([n, l]) => (
            <div className="lp-stat" key={l}>
              <div className="n">{n}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="lp-wrap lp-section" style={{ paddingTop: 20 }}>
        <div className="lp-head-center">
          <div className="lp-kicker">Why it works</div>
          <h2 className="lp-h2">A wingman that actually sounds like you</h2>
          <p className="lp-lead">
            Not a canned auto-responder. It learns your voice, reads the room, and knows when a
            reply should land now — or three hours from now.
          </p>
        </div>
        <div className="lp-features">
          <div className="lp-card">
            <div className="lp-ic">💬</div>
            <h3>Opens like you would</h3>
            <p>Picks a real detail from their profile and starts a conversation worth having — never a copy-paste line.</p>
          </div>
          <div className="lp-card">
            <div className="lp-ic">⏳</div>
            <h3>Human timing</h3>
            <p>Decides when to reply, not just what to say. Quick banter here, a cool few hours there. Never robotic, never thirsty.</p>
          </div>
          <div className="lp-card">
            <div className="lp-ic">🛡️</div>
            <h3>Safe by design</h3>
            <p>Holds your boundaries, keeps first meetings public, and flags anything sketchy straight to you.</p>
          </div>
        </div>
      </div>

      {/* Split */}
      <div className="lp-wrap lp-section" style={{ paddingTop: 20 }}>
        <div className="lp-split">
          <div>
            <div className="lp-kicker">On autopilot</div>
            <h2>From match to date — without lifting a thumb.</h2>
            <p>
              Set your vibe and your goals once. Wingman handles the small talk, keeps the momentum,
              and steers gently toward a real, low-pressure first date.
            </p>
            <div className="lp-ticks">
              {[
                "Replies to every new match in your style",
                "Paces messages on realistic, human timing",
                "Nudges toward a concrete plan when it's going well",
                "Hands off to you the moment you want to jump in",
              ].map((t) => (
                <div className="lp-tick" key={t}>
                  <span className="ck">✓</span> {t}
                </div>
              ))}
            </div>
          </div>
          <div className="lp-split-media">
            <ChatMock
              name="Jordan"
              initials="J"
              platform="Hinge"
              status="scheduling a first date"
              chip="auto-sent"
              messages={[
                { from: "them", text: "your taste in coffee is unreal btw ☕" },
                { from: "you", text: "high praise. there's a tiny roaster near you — thursday after work?", time: "sent 47m later" },
                { from: "them", text: "it's a date" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="lp-wrap lp-section" style={{ paddingTop: 20 }}>
        <div className="lp-head-center">
          <div className="lp-kicker">Three minutes to set up</div>
          <h2 className="lp-h2">Wake up to conversations that moved forward</h2>
        </div>
        <div className="lp-steps">
          {[
            ["Connect once", "Link Tinder, Hinge, or Bumble — your session stays saved and secure."],
            ["Set your voice", "Tell it how you text, what you're looking for, and your boundaries."],
            ["Let it run", "It reads matches and replies on your behalf, at human pace, 24/7."],
          ].map(([h, p], i) => (
            <div className="lp-step" key={i}>
              <div className="num">{i + 1}</div>
              <h4>{h}</h4>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <div className="lp-wrap lp-section" style={{ paddingTop: 20 }}>
        <div className="lp-head-center">
          <div className="lp-kicker">Loved by busy people</div>
          <h2 className="lp-h2">More dates. Way less typing.</h2>
        </div>
        <div className="lp-quotes">
          {[
            ["I went from ghosting my own matches to three dates in a week. It genuinely sounds like me.", "Priya", "Product designer"],
            ["The timing thing is wild — it waited two hours to reply and she said I was 'refreshingly chill.'", "Marcus", "Founder"],
            ["Set it up on a Sunday, forgot about it, woke up to a coffee date already planned.", "Dana", "Nurse"],
          ].map(([q, n, r]) => (
            <div className="lp-quote" key={n}>
              <p>“{q}”</p>
              <div className="who">
                <span className="qa" />
                <div>
                  <div className="qn">{n}</div>
                  <div className="qr">{r}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="lp-wrap lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-cta-band">
          <h2>Your wingman never sleeps on a match.</h2>
          <p>Fully automated by default — with boundaries you set and a pause button one tap away.</p>
          <Link href="/signup?use=dating" className="lp-btn primary lg">
            Start for free →
          </Link>
        </div>
      </div>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <span className="lp-brand">
            <span className="mark">🪽</span> Wingman
          </span>
          <div className="lp-foot-links">
            <Link href="/dating">Dating</Link>
            <Link href="/marketplace">Marketplace</Link>
            <Link href="/login">Log in</Link>
          </div>
          <span className="muted">© Wingman — fully automated, always in your control.</span>
        </div>
      </footer>
    </div>
  );
}
