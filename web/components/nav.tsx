import Link from "next/link";
import { MobileMenu } from "@/components/mobile-menu";
import { SearchButton } from "@/components/search-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { loadManifest } from "@/lib/manifest";
import { NAV_LINKS } from "@/lib/site";

const CTA_HREF = "/docs/installation";
// Not "Get Started": Redline has no account to start, and SaaS-signup language
// on a CLI sets an expectation the next page cannot meet. The product's first
// action is literally one command in one repository, so the button says that
// — and stays short enough that the header still fits 320px.
const CTA_LABEL = "Onboard a repo";

export function SiteNav() {
  const manifest = loadManifest();
  return (
    <header className="site-nav">
      <div className="inner">
        <Link className="logo" href="/">
          <span className="mark" aria-hidden="true" />
          Redline
          <span className="v">v{manifest.version}</span>
        </Link>
        {/* .nav-links, not the .links this used to be: globals.css deletes .links
            outright below 1000px, and the replacement for that is the mobile
            menu, not a second display:none. */}
        <nav className="nav-links" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <SearchButton />
          <ThemeToggle />
          <Link className="nav-cta" href={CTA_HREF}>
            {CTA_LABEL}
          </Link>
          <MobileMenu links={NAV_LINKS} ctaHref={CTA_HREF} ctaLabel={CTA_LABEL} />
        </div>
      </div>
    </header>
  );
}
