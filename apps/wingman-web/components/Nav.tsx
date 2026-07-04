import Link from "next/link";

export function Nav({ cta = true }: { cta?: boolean }) {
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        <span className="logo">🪽</span> Wingman
      </Link>
      <div className="nav-links">
        <Link href="/#how">How it works</Link>
        <Link href="/login">Log in</Link>
        {cta && (
          <Link href="/signup" className="btn primary">
            Get started
          </Link>
        )}
      </div>
    </nav>
  );
}
