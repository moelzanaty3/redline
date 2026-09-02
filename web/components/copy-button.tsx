"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label,
  dark = false,
  ariaLabel,
}: {
  text: string;
  label: string;
  dark?: boolean;
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
  const name = ariaLabel === undefined ? undefined : copied ? `Copied ${text}` : ariaLabel;

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
