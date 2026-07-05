import Link from "next/link";

export function Nav({
  cta = true,
  getStartedHref = "/signup",
  ctaLabel = "Get started",
}: {
  cta?: boolean;
  getStartedHref?: string;
  ctaLabel?: string;
}) {
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        <span className="logo">🪽</span> Wingman
      </Link>
      <div className="nav-links">
        <Link href="/dating">Dating</Link>
        <Link href="/marketplace">Marketplace</Link>
        <Link href="/login">Log in</Link>
        {cta && (
          <Link href={getStartedHref} className="btn primary">
            {ctaLabel}
          </Link>
        )}
      </div>
    </nav>
  );
}
