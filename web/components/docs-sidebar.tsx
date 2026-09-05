"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { DOCS_NAV, FLAT_DOCS, type DocLink } from "@/lib/docs-nav";

// Every page the sidebar can reach, counted from the nav itself rather than
// written down. A number in the summary is a promise about the thing behind
// it, and a hardcoded one goes wrong the first time a page is added.
const PAGE_COUNT = FLAT_DOCS.length;

// The breakpoint globals.css collapses the sidebar at, restated for the one
// thing CSS cannot do — see the effect below.
const DESKTOP = "(min-width: 1001px)";

type NavEntry = { href: string; label: string };

// Flat, and a child carries its parent's name: closed, the summary is the only
// thing saying where the reader is, so "core" alone would not be an answer.
const ENTRIES: NavEntry[] = DOCS_NAV.flatMap((section) =>
  section.links.flatMap((link) => [
    { href: link.href, label: link.title },
    ...(link.children ?? []).map((child) => ({
      href: child.href,
      label: `${link.title} / ${child.title}`,
    })),
  ]),
);

// Longest matching href wins, so a child page names itself rather than its
// category. `/docs` is matched exactly — as a prefix it matches everything.
function activeLabel(pathname: string): string {
  let best: NavEntry | null = null;
  for (const entry of ENTRIES) {
    const matches =
      entry.href === "/docs"
        ? pathname === "/docs"
        : pathname === entry.href || pathname.startsWith(`${entry.href}/`);
    if (!matches) continue;
    if (best === null || entry.href.length > best.href.length) best = entry;
  }
  return best === null ? "Browse the documentation" : best.label;
}

export function DocsSidebar() {
  const pathname = usePathname();
  const disclosure = useRef<HTMLDetailsElement>(null);

  // Below 1000px this whole nav is a <details> that ships closed: 30 links
  // stacked above the article pushed the <h1> 1,402px down a 390px screen —
  // 1.7 screens of navigation before the first word of the page. Above it the
  // sidebar is the sticky column it has always been, and the disclosure is not
  // a disclosure: globals.css hides the summary and forces the content open.
  //
  // That CSS is the whole mechanism in a current browser, and it is what keeps
  // the desktop sidebar working with scripting off. This effect is the floor
  // under it: an engine older than ::details-content hides a closed <details>
  // inside its own shadow tree, where no author rule reaches, and the failure
  // there is a desktop sidebar that will not open. Setting the attribute
  // directly (never as a JSX prop) leaves the element's own toggling alone —
  // React does not reconcile a prop it was never given.
  useEffect(() => {
    const node = disclosure.current;
    if (node === null) return;
    const desktop = window.matchMedia(DESKTOP);
    const sync = (matches: boolean): void => {
      node.open = matches;
    };
    sync(desktop.matches);
    const onChange = (event: MediaQueryListEvent): void => sync(event.matches);
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  // A navigation is an answer: the reader picked a page, so the list that
  // offered it closes behind them. Desktop is unaffected — the effect above
  // holds it open, and the summary is not on screen there anyway.
  useEffect(() => {
    const node = disclosure.current;
    if (node === null) return;
    if (!window.matchMedia(DESKTOP).matches) node.open = false;
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/docs") return pathname === "/docs";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Only the item you are actually on, never its category. Otherwise a category
  // and its open child both read as current and the sidebar stops saying where
  // you are.
  const isCurrent = (href: string) => pathname === href;

  const renderChildren = (parent: DocLink) => {
    if (!parent.children?.length) return null;
    // Expanded only inside its own category: 39 reference items unfurled at once
    // is a wall, and the category index page already lists them as cards.
    if (!isActive(parent.href)) return null;
    return (
      <ul className="children">
        {parent.children.map((child) => (
          <li key={child.href}>
            <Link href={child.href} className={isCurrent(child.href) ? "active" : undefined}>
              {child.title}
            </Link>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <aside className="docs-sidebar">
      <details className="docs-nav" ref={disclosure}>
        <summary>
          <span className="dn-text">
            <span className="dn-eyebrow">Documentation</span>
            <span className="dn-here">{activeLabel(pathname)}</span>
          </span>
          <span className="dn-count">{PAGE_COUNT} pages</span>
        </summary>
        <div className="dn-body">
          {DOCS_NAV.map((section) => (
            <div className="group" key={section.label}>
              <div className="group-label">{section.label}</div>
              <ul>
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={isCurrent(link.href) ? "active" : isActive(link.href) ? "open" : undefined}
                    >
                      {link.title}
                      {link.children?.length ? <span className="count">{link.children.length}</span> : null}
                    </Link>
                    {renderChildren(link)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </aside>
  );
}
