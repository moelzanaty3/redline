"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { REVIEWERS } from "@/components/finding";

const DWELL_MS = 5200;

// The finding under the hero's diff, cycling through the reviewers that can
// post it. The prefix is fixed — Redline writes that part — and only the prose
// and the reviewer change, which is the point: same rule id, whichever tool
// found it, so it can be counted.
//
// Every reviewer's prose sits in the same grid cell, so the card is always as
// tall as the longest and the rotation never moves the page. It pauses while
// the pointer or focus is on it, stops for good once a reader picks a chip, and
// never starts under reduced motion.
export function HeroTicker({
  severity,
  ruleId,
  ruleHref,
  moreHref,
}: {
  severity: string;
  ruleId: string;
  ruleHref: string;
  moreHref: string;
}) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [chosen, setChosen] = useState(false);
  const [still, setStill] = useState(true);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const running = !still && !held && !chosen;

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % REVIEWERS.length), DWELL_MS);
    return () => clearTimeout(timer);
  }, [running, index]);

  const active = REVIEWERS[index] ?? REVIEWERS[0];

  return (
    <div
      className="ht"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="ht-card">
        <p className="ht-who">
          <span aria-hidden="true" className="ht-dot" />
          {active?.label}
          <span className="ht-where">{active?.where}</span>
        </p>
        <p className="ht-prefix">
          <span className="ht-sev">Redline/{severity}</span>{" "}
          [<Link href={ruleHref}>{ruleId}</Link>]:
        </p>
        <div className="ht-stack">
          {REVIEWERS.map((r, i) => (
            <p className="ht-prose" data-on={i === index} key={r.id} aria-hidden={i !== index}>
              {r.prose}
            </p>
          ))}
        </div>
      </div>

      <div className="ht-chips" role="group" aria-label="Reviewer">
        {REVIEWERS.map((r, i) => (
          <button
            aria-pressed={i === index}
            className="ht-chip"
            data-run={i === index && running}
            key={r.id}
            onClick={() => {
              setIndex(i);
              setChosen(true);
            }}
            type="button"
          >
            {r.label}
          </button>
        ))}
        <Link className="ht-chip ht-more" href={moreHref}>
          And more <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </div>
  );
}
