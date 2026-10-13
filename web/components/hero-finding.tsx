"use client";

import Link from "next/link";
import { useState } from "react";
import { REVIEWERS } from "@/components/finding";
import type { DiffLine } from "@/components/seed-excerpt";

// The finding, above the fold, because it is the product. Everything else in
// the hero is a claim about Redline; this is the only thing on screen that is
// Redline's actual output.
//
// The comment sits under the lines it is about, the way an inline review
// comment does on a pull request. A finding with no code above it asked the
// reader to scroll to section 6 to see what it was about; stacked, the hero
// says the whole thing — this diff, this rule, this fix — in one glance.
//
// The reviewer switch is here too, because "which assistant does this work
// with?" is the first question a reader has, and the answer is the product's
// point: switch reviewers and the prose changes, the prefix does not. Same rule
// id, whichever tool found it, so it can be counted. The diff starts at the
// handler; the import above it adds a line without adding meaning at this size.
//
// Severity and rule id are passed in from the rule the page already looks up,
// so a renamed rule fails the build rather than leaving the hero quoting a
// contract the standard no longer honours.
export function HeroFinding({
  diff,
  severity,
  ruleId,
  ruleHref,
  file,
}: {
  diff: DiffLine[];
  severity: string;
  ruleId: string;
  ruleHref: string;
  file: string;
}) {
  const [active, setActive] = useState(REVIEWERS[0]?.id ?? "");
  const reviewer = REVIEWERS.find((r) => r.id === active) ?? REVIEWERS[0];

  return (
    <figure className="hf">
      <figcaption className="hf-head">
        <span className="hf-who">
          <span aria-hidden="true" className="hf-dot" />
          {reviewer?.label}
        </span>
        <span className="hf-sev">{severity}</span>
      </figcaption>

      <div className="hf-code">
        <pre className="hm-diff hf-diff">
          {diff.map((line, i) => (
            <span className={`hm-dl hm-dl-${line.kind}`} key={`${i}-${line.text}`}>
              <span className="hm-dl-g" aria-hidden="true">
                {line.kind === "ctx" ? " " : "+"}
              </span>
              {line.text === "" ? " " : line.text}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>

      <div className="hf-body">
        <p className="hf-prefix">
          <span className="hf-prefix-sev">Redline/{severity}</span>{" "}
          <span className="hf-prefix-id">
            [<Link href={ruleHref}>{ruleId}</Link>]
          </span>
          :
        </p>
        {/* Every reviewer's prose is laid out in the same cell, and only the
            active one is visible, so the card is always as tall as the longest
            and switching never moves the page under the reader's pointer. */}
        <div className="hf-prose-stack">
          {REVIEWERS.map((r) => (
            <p
              className="hf-prose"
              key={r.id}
              aria-hidden={r.id !== active}
              data-on={r.id === active}
            >
              {r.prose}
            </p>
          ))}
        </div>
      </div>

      <div className="hf-switch" role="group" aria-label="Which tool produced this finding">
        <span className="hf-switch-l">Found by</span>
        {REVIEWERS.map((r) => (
          <button
            type="button"
            key={r.id}
            className={`hm-switch-b${r.id === active ? " on" : ""}`}
            aria-pressed={r.id === active}
            onClick={() => setActive(r.id)}
          >
            {r.label}
          </button>
        ))}
        <span className="hf-switch-cap">Same rule id, whichever tool found it.</span>
      </div>

      <div className="hf-foot">
        <span>{reviewer?.where}</span>
        <code>{file}</code>
      </div>
    </figure>
  );
}
