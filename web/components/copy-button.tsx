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

  return (
    <button
      type="button"
      className={`copy-btn${dark ? " dark" : ""}`}
      onClick={onCopy}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
    >
      {copied ? "COPIED ✓" : label}
    </button>
  );
}
