"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  GITHUB_REPO,
  GITHUB_URL,
  NEW_ISSUE_URL,
  NPM_PACKAGE,
  NPM_URL,
  type NavLink,
} from "@/lib/site";

// Below the desktop breakpoint the main links are hidden, so this is the only
// route into the documentation on a phone. It is a dialog, not a decorated
// dropdown: focus is trapped, Escape closes, the page behind it does not scroll.
//
// The panel is portalled to <body> deliberately. .site-nav carries a
// backdrop-filter, which makes it the containing block for fixed-position
// descendants — a panel rendered inside the header would be positioned against
// the 62px bar rather than the viewport.

// Every element the trap cycles through. Kept narrow on purpose: the panel
// contains links and buttons and nothing else, so a general focusable query
// would only add ways to be wrong.
const FOCUSABLE = 'a[href], button:not([disabled])';

type MobileMenuProps = {
  links: readonly NavLink[];
  ctaHref: string;
  ctaLabel: string;
};

export function MobileMenu({ links, ctaHref, ctaLabel }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // The portal target only exists in the browser. Rendering the panel from the
  // first client render onwards (rather than only while open) keeps the
  // aria-controls target present in the document, so the toggle never points at
  // an id that is not there.
  useEffect(() => {
    setMounted(true);
  }, []);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  // A navigation is a dismissal. Clicking a link inside the panel routes without
  // unmounting the layout, so nothing else would close it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Widening past the breakpoint hides the panel in CSS. Without this the scroll
  // lock below would survive on a page with no visible menu to close.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1001px)");
    const sync = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener("change", sync);
    return () => desktop.removeEventListener("change", sync);
  }, []);

  // Scroll lock. The previous value is restored rather than cleared, so this
  // cannot quietly drop an overflow set by anything else.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes; Tab cycles within the toggle plus the panel. The toggle is
  // part of the cycle on purpose — it is the visible close control while open,
  // and a trap that excluded it would leave Escape as the only way out.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const cycle = (): HTMLElement[] => {
      const inPanel = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const toggle = buttonRef.current;
      return toggle ? [toggle, ...inPanel] : inPanel;
    };

    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRestoreFocus();
        return;
      }
      if (event.key !== "Tab") return;
      // The ring is walked explicitly rather than only wrapped at its ends: the
      // panel is portalled to the end of <body>, so document order runs
      // toggle → whole page → panel, and native Tab from the toggle would land
      // in the page behind the dialog.
      const items = cycle();
      if (items.length === 0) return;
      const active = document.activeElement;
      const current = active instanceof HTMLElement ? items.indexOf(active) : -1;
      const step = event.shiftKey ? -1 : 1;
      const next =
        current === -1
          ? event.shiftKey
            ? items.length - 1
            : 0
          : (current + step + items.length) % items.length;
      const target = items[next];
      if (!target) return;
      event.preventDefault();
      target.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeAndRestoreFocus]);

  const panel = (
    <div className="mobile-menu" id="site-mobile-menu" hidden={!open}>
      <div className="mm-scrim" onClick={closeAndRestoreFocus} aria-hidden="true" />
      <div
        className="mm-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        ref={panelRef}
      >
        <nav className="mm-links" aria-label="Site">
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mm-external">
          <a href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
            <GitHubMark />
            <span>
              GitHub <em>{GITHUB_REPO}</em>
            </span>
            <span className="mm-out" aria-hidden="true">
              ↗
            </span>
          </a>
          <a href={NPM_URL} rel="noopener noreferrer" target="_blank">
            <NpmMark />
            <span>
              npm <em>{NPM_PACKAGE}</em>
            </span>
            <span className="mm-out" aria-hidden="true">
              ↗
            </span>
          </a>
          <a href={NEW_ISSUE_URL} rel="noopener noreferrer" target="_blank">
            <IssueMark />
            <span>Report an issue</span>
            <span className="mm-out" aria-hidden="true">
              ↗
            </span>
          </a>
        </div>
        <Link className="mm-cta" href={ctaHref} onClick={() => setOpen(false)}>
          {ctaLabel}
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="nav-burger"
        ref={buttonRef}
        aria-expanded={open}
        aria-controls="site-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => (open ? closeAndRestoreFocus() : setOpen(true))}
      >
        {open ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function IssueMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 2.25a.9.9 0 0 0-.9.9v3.6a.9.9 0 0 0 1.8 0v-3.6a.9.9 0 0 0-.9-.9Zm0 6.1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
    </svg>
  );
}

function NpmMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
    </svg>
  );
}
