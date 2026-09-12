"use client";

import { useEffect, useRef, useState } from "react";

export type Heading = { id: string; text: string; level: 2 | 3 };

// The width globals.css gives the rail its own column at. Restated here for the
// one thing CSS cannot do — see the effect below.
const DESKTOP = "(min-width: 1101px)";

/**
 * The on-this-page rail.
 *
 * It exists because the long pages were unnavigable: Verification is 7,200px of
 * a nine-scenario runbook, and with no index a reader could neither see its
 * shape before committing to the scroll nor send a colleague "scenario 6". The
 * column it sits in was already there — the article stopped 184px short of the
 * viewport at every desktop width, and that gutter held nothing.
 *
 * Built from headings resolved on the server, so the list and its links are in
 * the HTML and a deep link works before any script runs. Only the highlight and
 * the mobile collapse are client work.
 *
 * Below the breakpoint it is a closed <details>, for the same reason the sidebar
 * is: seventeen links stacked over the article is not navigation, it is a wall
 * in front of the thing the reader came for. The CSS forces it open on desktop
 * and hides the summary; this component's effect is the floor under that for an
 * engine that hides a closed <details> in its own shadow tree, where no author
 * rule reaches.
 */
export function DocsToc({ headings }: { headings: Heading[] }) {
  const [current, setCurrent] = useState<string | null>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);

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

  useEffect(() => {
    if (headings.length === 0) return;
    const nodes = headings
      .map((h) => document.getElementById(h.id))
      .filter((n): n is HTMLElement => n !== null);
    if (nodes.length === 0) return;

    // Whichever heading the reader has most recently passed, rather than
    // whichever happens to be intersecting: a section taller than the viewport
    // has no heading on screen at all, and highlighting nothing there would
    // make the rail look broken exactly where it is most useful.
    const update = () => {
      const line = window.scrollY + 140;
      let seen = nodes[0]!.id;
      for (const node of nodes) {
        if (node.getBoundingClientRect().top + window.scrollY <= line) seen = node.id;
        else break;
      }
      setCurrent(seen);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [headings]);

  // One heading is a title, not a table of contents.
  if (headings.length < 2) return null;

  return (
    <nav className="docs-toc" aria-label="On this page">
      <details ref={disclosure}>
        <summary>
          <span className="toc-label">On this page</span>
          <span className="toc-count">{headings.length} sections</span>
        </summary>
        <ul>
          {headings.map((h) => (
            <li key={h.id} className={h.level === 3 ? "sub" : undefined}>
              <a
                href={`#${h.id}`}
                className={current === h.id ? "active" : undefined}
                aria-current={current === h.id ? "location" : undefined}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}
