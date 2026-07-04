import Link from "next/link";
import { Logo } from "./Icons";

export function PremiumNav({ getStartedHref = "/signup" }: { getStartedHref?: string }) {
  return (
    <nav className="lp-nav">
      <div className="lp-nav-inner">
        <Link href="/" className="lp-brand">
          <Logo size={34} /> Wingman
        </Link>
        <div className="lp-nav-links">
          <Link href="/dating" className="hide-sm">
            Dating
          </Link>
          <Link href="/marketplace" className="hide-sm">
            Marketplace
          </Link>
          <span className="sep hide-sm" />
          <Link href="/login">Log in</Link>
          <Link href={getStartedHref} className="lp-btn primary">
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
