import Link from "next/link";
import type { CSSProperties } from "react";
import { PremiumNav } from "@/components/PremiumNav";
import { ChatMock } from "@/components/ChatMock";
import { Logo, IconTag, IconSearch, IconUsers, IconCheck, IconArrow } from "@/components/Icons";

const theme = { "--acc": "#2f6b5c" } as CSSProperties;

export default function MarketplaceLanding() {
  return (
    <div className="lp" style={theme}>
      <PremiumNav getStartedHref="/signup?use=marketplace" />

      <div className="lp-wrap lp-hero">
        <span className="lp-eyebrow">
          <span className="dot" /> For buyers &amp; sellers · Marketplace + Groups
        </span>
        <h1 className="lp-h1">
          Close every Marketplace <span className="lp-grad">deal</span> on autopilot.
        </h1>
        <p className="lp-sub">
          Wingman answers inquiries, negotiates to your number, and hunts Facebook groups for the
          gear you want — buying and selling, both sides, hands-free.
        </p>
        <div className="lp-cta">
          <Link href="/signup?use=marketplace" className="lp-btn primary lg">
            Get my deal-maker <IconArrow width={18} height={18} />
          </Link>
          <Link href="/dating" className="lp-btn lg">
            I&apos;m here to date
          </Link>
        </div>
        <div className="lp-cta-note">Free to start · you set the floor · it does the haggling</div>

        <div className="lp-hero-visual">
          <ChatMock
            name="Sam"
            initials="S"
            platform="Marketplace"
            status="negotiating to your floor"
            chip="held at $110"
            messages={[
              { from: "them", text: "Hi! Is the dresser still available? Would you take $90?" },
              { from: "you", text: "It is! It's in great shape — I can do $115, or $110 if you can grab it this weekend.", time: "replied 18m later" },
              { from: "them", text: "Deal. Saturday at 11 work?" },
            ]}
          />
        </div>

        <div className="lp-cloud">
          <div className="lp-cloud-label">Works across Facebook</div>
          <div className="lp-cloud-row">
            <span className="lp-logo">Marketplace</span>
            <span className="lp-logo">Groups</span>
            <span className="lp-logo">Messenger</span>
            <span className="lp-logo">Buy/Sell/Trade</span>
          </div>
        </div>
      </div>

      <div className="lp-wrap lp-section" style={{ paddingTop: 40 }}>
        <div className="lp-stats">
          {[
            ["Both", "sides — buying & selling"],
            ["24/7", "first to reply, every time"],
            ["$0", "left on the table below floor"],
            ["100%", "hands-free negotiation"],
          ].map(([n, l]) => (
            <div className="lp-stat" key={l}>
              <div className="n">{n}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-wrap lp-section" style={{ paddingTop: 20 }}>
        <div className="lp-head-center">
          <span className="lp-kicker">One agent, both sides</span>
          <h2 className="lp-h2">It sells, it buys, it negotiates</h2>
          <p className="lp-lead">
            Answers the second an inquiry lands, haggles in small steps, and never dips below the
            floor you set — on realistic timing so buyers never smell a bot.
          </p>
        </div>
        <div className="lp-features">
          <div className="lp-card">
            <div className="lp-ic"><IconTag /></div>
            <h3>Sells for you</h3>
            <p>“Is this available?” answered in seconds. Negotiates up from lowballs and holds your floor — you just show up for pickup.</p>
          </div>
          <div className="lp-card">
            <div className="lp-ic"><IconSearch /></div>
            <h3>Buys for you</h3>
            <p>Tell it what you want and your max. It watches listings and group posts, reaches out first, and opens under budget.</p>
          </div>
          <div className="lp-card">
            <div className="lp-ic"><IconUsers /></div>
            <h3>Works the groups</h3>
            <p>Searches your buy/sell/trade groups for matches and sends a warm message that references the actual post.</p>
          </div>
        </div>
      </div>

      <div className="lp-wrap lp-section" style={{ paddingTop: 20 }}>
        <div className="lp-split rev">
          <div className="lp-split-media">
            <ChatMock
              name="Alex"
              initials="A"
              platform="Groups"
              status="chasing a lead you wanted"
              chip="found in group"
              messages={[
                { from: "you", text: "Hey! Saw your post in Bay Area Cycling B/S/T — is the 56cm road bike still around? Cash today if so.", time: "reached out first" },
                { from: "them", text: "yeah still here! $520?" },
                { from: "you", text: "Could do $470 and pick up tonight — works for me if it does for you.", time: "held under your max" },
              ]}
            />
          </div>
          <div>
            <span className="lp-kicker">Never miss a deal</span>
            <h2>Every lead worked. Every reply on time.</h2>
            <p>
              Set your listings and your wishlist once. Wingman runs the inbox and the group feeds so
              you&apos;re always first to respond — and always negotiating from your terms.
            </p>
            <div className="lp-ticks">
              {[
                "Instant replies to every inquiry, day or night",
                "Anchors high, concedes slowly, holds your floor",
                "Hunts groups and DMs leads before anyone else",
                "Hands you a ready-to-meet buyer or seller",
              ].map((t) => (
                <div className="lp-tick" key={t}>
                  <span className="ck"><IconCheck /></span> {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lp-wrap lp-section" style={{ paddingTop: 20 }}>
        <div className="lp-head-center">
          <span className="lp-kicker">Set it once</span>
          <h2 className="lp-h2">Turn your Marketplace into passive income</h2>
        </div>
        <div className="lp-steps">
          {[
            ["Connect Facebook", "Link your Marketplace + Groups account once — securely, session saved."],
            ["Set floors & wants", "Prices and floors to sell; queries and max to buy. That's it."],
            ["It negotiates", "Handles every inquiry and group lead at human pace, hands-free."],
          ].map(([h, p], i) => (
            <div className="lp-step" key={i}>
              <div className="num">{i + 1}</div>
              <h4>{h}</h4>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-wrap lp-section" style={{ paddingTop: 20 }}>
        <div className="lp-head-center">
          <span className="lp-kicker">Sellers &amp; flippers love it</span>
          <h2 className="lp-h2">Sold faster, for more, with zero back-and-forth</h2>
        </div>
        <div className="lp-quotes">
          {[
            ["I list, it does the rest. Sold a couch for $40 more than I'd have caved to, and I never touched my phone.", "Tomas", "Reseller"],
            ["It replied to a group post at 6am and locked in a bike I'd been hunting for weeks.", "Elena", "Cyclist"],
            ["Running 20 listings solo was a full-time job. Now it just… handles them.", "Chris", "Flipper"],
          ].map(([q, n, r]) => (
            <div className="lp-quote" key={n}>
              <div className="stars">★★★★★</div>
              <p>“{q}”</p>
              <div className="who">
                <span className="qa">{(n as string)[0]}</span>
                <div>
                  <div className="qn">{n}</div>
                  <div className="qr">{r}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-wrap lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-cta-band">
          <h2>Let your Marketplace run itself.</h2>
          <p>Fully automated by default — you set the floors and the rules, it does the haggling.</p>
          <Link href="/signup?use=marketplace" className="lp-btn lg">
            Start for free <IconArrow width={18} height={18} />
          </Link>
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
          <span className="muted">© Wingman — fully automated, always in your control.</span>
        </div>
      </footer>
    </div>
  );
}
