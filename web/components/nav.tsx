import Link from "next/link";
import { SearchButton } from "@/components/search-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { VERSION } from "@/lib/site";

export function SiteNav() {
  return (
    <header className="site-nav">
      <div className="inner">
        <Link className="logo" href="/">
          <span className="mark" aria-hidden="true" />
          Redline
          <span className="v">v{VERSION}</span>
        </Link>
        <nav className="links" aria-label="Main">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/standards">Standards</Link>
          <Link href="/docs/adaptors/github-copilot">Adaptors</Link>
          <Link href="/docs/installation">Installation</Link>
        </nav>
        <div className="nav-right">
          <SearchButton />
          <ThemeToggle />
          <Link className="nav-cta" href="/docs/installation">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
