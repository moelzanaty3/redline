import Link from "next/link";
import { MobileMenu } from "@/components/mobile-menu";
import { ScrollProgress } from "@/components/scroll-progress";
import { SearchButton } from "@/components/search-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { GITHUB_REPO, GITHUB_URL, NAV_LINKS } from "@/lib/site";

const CTA_HREF = "/docs/onboarding";
// Not "Get Started": Redline has no account to start, and SaaS-signup language
// on a CLI sets an expectation the next page cannot meet. The product's first
// action is literally one command in one repository, so the button says that
// — and stays short enough that the header still fits 320px.
const CTA_LABEL = "Onboard a repo";

export function SiteNav() {
  return (
    <header className="site-nav">
      <ScrollProgress />
      <div className="inner">
        <Link className="logo" href="/">
          <span className="mark" aria-hidden="true" />
          Redline
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
          <a
            aria-label={`Redline on GitHub (${GITHUB_REPO})`}
            className="nav-icon"
            href={GITHUB_URL}
            rel="noopener noreferrer"
            target="_blank"
            title="Source on GitHub"
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
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
