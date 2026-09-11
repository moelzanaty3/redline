"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label,
  dark = false,
  icon = false,
  ariaLabel,
}: {
  text: string;
  label: string;
  dark?: boolean;
  icon?: boolean;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (permissions / insecure context) — nothing to recover
    }
  };

  // Only set when the caller supplied one: without it the button's own text is the
  // accessible name, and the visible COPIED change is already announced.
  // In icon mode there is no text at all, so a name is mandatory — fall back to
  // `label`, which is what a sighted user would have read.
  const described = ariaLabel ?? (icon ? label : undefined);
  const name =
    described === undefined ? undefined : copied ? `Copied ${text}` : described;

  if (icon) {
    return (
      <button
        type="button"
        className={`copy-btn icon${dark ? " dark" : ""}`}
        onClick={onCopy}
        {...(name ? { "aria-label": name } : {})}
      >
        {copied ? <CheckGlyph /> : <CopyGlyph />}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`copy-btn${dark ? " dark" : ""}`}
      onClick={onCopy}
      {...(name ? { "aria-label": name } : {})}
    >
      {copied ? "COPIED ✓" : label}
    </button>
  );
}

/* aria-hidden throughout: the button carries the accessible name, so announcing
   the glyph as well would read the control twice. */

function CopyGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="15"
    >
      <rect height="13" rx="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
