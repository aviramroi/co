import Link from "next/link";
import { Nav } from "@/components/Nav";

export default function HomeChooser() {
  return (
    <>
      <Nav />

      <header className="container hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Your AI wingman · always on</span>
        <h1>
          One agent. <span className="grad">Pick your playground.</span>
        </h1>
        <p className="sub">
          Wingman runs your conversations for you — fully automated, in your voice, with human-like
          timing. What do you want it to handle?
        </p>
      </header>

      <section className="container" style={{ paddingBottom: 60 }}>
        <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <Link
            href="/dating"
            className="feature"
            style={{ "--accent": "#ff4d7d", "--accent-2": "#ff9d5c" } as React.CSSProperties}
          >
            <div className="icon" style={{ fontSize: 34 }}>🔥</div>
            <h3 style={{ fontSize: 22 }}>Dating</h3>
            <p>
              Reads your matches on Tinder, Hinge, and Bumble, replies in your voice, and paces it
              like a human — all the way to a date.
            </p>
            <p style={{ marginTop: 14 }}>
              <span className="btn primary">Explore dating →</span>
            </p>
          </Link>

          <Link
            href="/marketplace"
            className="feature"
            style={{ "--accent": "#2f9bff", "--accent-2": "#37d6a0" } as React.CSSProperties}
          >
            <div className="icon" style={{ fontSize: 34 }}>🛒</div>
            <h3 style={{ fontSize: 22 }}>Marketplace &amp; deals</h3>
            <p>
              Answers inquiries, negotiates to your number on both sides, and hunts Facebook groups
              for the gear you want — hands-free.
            </p>
            <p style={{ marginTop: 14 }}>
              <span className="btn primary">Explore marketplace →</span>
            </p>
          </Link>
        </div>

        <p className="hint" style={{ textAlign: "center", marginTop: 24 }}>
          Want both? Pick either to start — you can enable every channel during setup.
        </p>
      </section>

      <footer className="footer">
        <div className="container between">
          <span>🪽 Wingman · your AI agent for dating &amp; marketplace</span>
          <span>Fully automated · you set the boundaries · pause anytime.</span>
        </div>
      </footer>
    </>
  );
}
