import Link from "next/link";
import type { CSSProperties } from "react";
import { Nav } from "@/components/Nav";

const theme = { "--accent": "#2f9bff", "--accent-2": "#37d6a0" } as CSSProperties;

export default function MarketplaceLanding() {
  return (
    <div style={theme}>
      <Nav getStartedHref="/signup?use=marketplace" ctaLabel="Get started" />

      <header className="container hero">
        <span className="eyebrow">For buyers &amp; sellers · Marketplace + Groups</span>
        <h1>
          Close every Marketplace <span className="grad">deal</span> on autopilot.
        </h1>
        <p className="sub">
          Wingman answers inquiries, haggles to your number, and hunts group posts for the gear you
          want — buying and selling, both sides, hands-free.
        </p>
        <div className="hero-cta">
          <Link href="/signup?use=marketplace" className="btn primary lg">
            Get my deal-maker →
          </Link>
          <Link href="/dating" className="btn ghost lg">
            I&apos;m here to date →
          </Link>
        </div>
      </header>

      <section className="block container">
        <div className="grid-3">
          <div className="feature">
            <div className="icon">💰</div>
            <h3>Sells for you</h3>
            <p>
              Answers &quot;is this available?&quot; in seconds, negotiates in small steps, and holds
              your floor price — you just show up for pickup.
            </p>
          </div>
          <div className="feature">
            <div className="icon">🔎</div>
            <h3>Buys for you</h3>
            <p>
              Tell it what you want and your max. It watches listings and group posts, reaches out
              first, and opens under budget.
            </p>
          </div>
          <div className="feature">
            <div className="icon">👥</div>
            <h3>Works the groups</h3>
            <p>
              Searches your buy/sell/trade groups for matches and sends a warm, specific message that
              references the actual post.
            </p>
          </div>
        </div>
      </section>

      <section className="block container" id="how">
        <div className="section-title">
          <h2>Every lead worked, every reply on time</h2>
          <p>Set your listings and wants once — it runs the rest, fully automated.</p>
        </div>
        <div className="steps">
          {[
            ["Connect Facebook", "Link your Marketplace + Groups account once."],
            ["Set listings & wants", "Prices and floors to sell; queries and max to buy."],
            ["It negotiates", "Handles every inquiry and group lead at human pace."],
            ["You close", "It hands you a ready-to-meet buyer or seller."],
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
          <div className="icon">🧠💸</div>
          <h3 style={{ fontSize: 22 }}>Negotiates like a patient human</h3>
          <p style={{ maxWidth: 620, margin: "8px auto 0" }}>
            Anchors near asking, concedes slowly, and never drops below the floor you set — and it
            replies on realistic timing so buyers don&apos;t smell a bot.
          </p>
        </div>
      </section>

      <section className="block container" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 30, marginBottom: 8 }}>Turn your Marketplace into passive income.</h2>
        <p style={{ color: "var(--mut)", marginBottom: 22 }}>
          Fully automated by default — you set the floors and the rules, it does the haggling.
        </p>
        <Link href="/signup?use=marketplace" className="btn primary lg">
          Start for free
        </Link>
      </section>

      <footer className="footer">
        <div className="container between">
          <span>🪽 Wingman · for marketplace</span>
          <Link href="/dating">Here to date instead? →</Link>
        </div>
      </footer>
    </div>
  );
}
