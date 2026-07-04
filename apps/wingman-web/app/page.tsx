import Link from "next/link";
import type { CSSProperties } from "react";
import { PremiumNav } from "@/components/PremiumNav";
import { ChatMock } from "@/components/ChatMock";
import { Logo, IconHeart, IconCart, IconWave, IconClock, IconSliders, IconArrow } from "@/components/Icons";

const dating = { "--acc": "#ff3d71", "--acc2": "#ff8a3d" } as CSSProperties;
const market = { "--acc": "#2d6bff", "--acc2": "#14c38e" } as CSSProperties;

export default function Home() {
  return (
    <div className="lp">
      <PremiumNav />

      <div className="lp-wrap lp-hero">
        <span className="lp-eyebrow">
          <span className="dot" /> The autonomous AI for your conversations
        </span>
        <h1 className="lp-h1">
          One agent that <span className="lp-grad">runs the chat</span> for you.
        </h1>
        <p className="lp-sub">
          Wingman replies to your matches and your Marketplace deals in your voice, with human-like
          timing — fully automated. Pick where you want it working.
        </p>

        <div className="lp-features" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginTop: 48, textAlign: "left" }}>
          <Link href="/dating" className="lp-card" style={dating}>
            <div className="lp-ic"><IconHeart /></div>
            <h3 style={{ fontSize: 24 }}>Dating</h3>
            <p style={{ marginBottom: 18 }}>
              Reads your matches on Tinder, Hinge &amp; Bumble, replies in your voice, and paces it
              like a human — all the way to a date.
            </p>
            <div style={{ marginBottom: 20 }}>
              <ChatMock
                name="Maya"
                initials="M"
                platform="Tinder"
                status="replying for you"
                chip="human timing"
                messages={[
                  { from: "them", text: "outdoor climber or gym? 😄" },
                  { from: "you", text: "both — saturday coffee then a climb?", time: "sent 2h later" },
                ]}
              />
            </div>
            <span className="lp-btn primary">Explore dating <IconArrow width={18} height={18} /></span>
          </Link>

          <Link href="/marketplace" className="lp-card" style={market}>
            <div className="lp-ic"><IconCart /></div>
            <h3 style={{ fontSize: 24 }}>Marketplace &amp; deals</h3>
            <p style={{ marginBottom: 18 }}>
              Answers inquiries, negotiates to your number on both sides, and hunts Facebook groups
              for the gear you want — hands-free.
            </p>
            <div style={{ marginBottom: 20 }}>
              <ChatMock
                name="Sam"
                initials="S"
                platform="Marketplace"
                status="negotiating for you"
                chip="held at $110"
                messages={[
                  { from: "them", text: "still available? $90?" },
                  { from: "you", text: "it is — I can do $110 for weekend pickup.", time: "replied 18m later" },
                ]}
              />
            </div>
            <span className="lp-btn primary">Explore marketplace <IconArrow width={18} height={18} /></span>
          </Link>
        </div>
        <div className="lp-cta-note" style={{ marginTop: 24 }}>
          Want both? Pick either to start — enable every channel during setup.
        </div>
      </div>

      <div className="lp-wrap lp-section">
        <div className="lp-head-center">
          <span className="lp-kicker">Why Wingman</span>
          <h2 className="lp-h2">Automated — but impossible to tell.</h2>
          <p className="lp-lead">
            Most bots blast instant, obvious replies. Wingman is different: it thinks about what to
            say, and about when to say it.
          </p>
        </div>
        <div className="lp-features">
          <div className="lp-card">
            <div className="lp-ic"><IconWave /></div>
            <h3>Your voice, learned</h3>
            <p>It writes the way you write — tone, length, the way you flirt or haggle. Never generic, never off-brand.</p>
          </div>
          <div className="lp-card">
            <div className="lp-ic"><IconClock /></div>
            <h3>Human timing</h3>
            <p>It decides when to reply, not just what — fast when it fits, hours later when playing it cool. That&apos;s the tell that isn&apos;t there.</p>
          </div>
          <div className="lp-card">
            <div className="lp-ic"><IconSliders /></div>
            <h3>You stay in control</h3>
            <p>Fully automated by default, with hard boundaries you set, safety interlocks, and a pause button one tap away.</p>
          </div>
        </div>
      </div>

      <div className="lp-wrap lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-cta-band">
          <h2>Meet the wingman that never logs off.</h2>
          <p>Set it up in minutes. It handles the rest — in your voice, on your terms.</p>
          <div className="lp-cta" style={{ marginTop: 4 }}>
            <Link href="/signup?use=dating" className="lp-btn lg">
              Start with dating
            </Link>
            <Link href="/signup?use=marketplace" className="lp-btn ghost lg">
              Start with marketplace
            </Link>
          </div>
        </div>
      </div>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <span className="lp-brand">
            <Logo size={30} /> Wingman
          </span>
          <div className="lp-foot-links">
            <Link href="/dating">Dating</Link>
            <Link href="/marketplace">Marketplace</Link>
            <Link href="/login">Log in</Link>
          </div>
          <span className="muted">© Wingman — your AI agent for dating &amp; marketplace.</span>
        </div>
      </footer>
    </div>
  );
}
