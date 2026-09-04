import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Adopting Redline" };

type Phase = {
  when: string;
  title: string;
  you: string[];
  get: string[];
  note?: string;
};

// Written as what actually happens rather than a maturity model. Each stage ends
// where the evidence for the next one is gathered — which is the same rule the
// enforcement ladder enforces, said in prose.
const PHASES: Phase[] = [
  {
    when: "Day one",
    title: "One repository, nothing blocked",
    you: [
      "Run redline init on a single repository — ideally one with real traffic, not a sandbox.",
      "Merge the onboarding pull request.",
      "Leave the rung at observe.",
    ],
    get: [
      "The standard rendered into whatever AI tools that repository already uses.",
      "The merge gate reporting on every pull request, blocking nothing.",
      "The security floor on and blocking: dependency review and the secret scan.",
    ],
    note: "Resist promoting here. You have no evidence yet, and a gate that blocks before anyone trusts it is a gate someone routes around.",
  },
  {
    when: "Week one",
    title: "Find out whether the findings are any good",
    you: [
      "Read the findings on real pull requests. Are they right? Are they worth the interruption?",
      "Score the reviewer against the seeded corpus on a pilot repository.",
      "Raise anything that fires constantly on code you have deliberately decided to allow.",
    ],
    get: [
      "Seed recall and false-positive numbers — evidence, rather than an impression.",
      "A sense of which rules earn their place in your codebase specifically.",
    ],
    note: "A rule that fires constantly and is always dismissed is a rule to cut, not a team to train. That conversation is what rule ids exist for.",
  },
  {
    when: "Week two to four",
    title: "Onboard the rest, still watching",
    you: [
      "Onboard the repositories that matter. redline init is idempotent, so batching is safe.",
      "Let the nightly register pick them up.",
      "Turn on telemetry collection so acted-on rate starts accumulating.",
    ],
    get: [
      "A derived register, and a coverage figure that is instrumented-against-onboarded rather than a raw count.",
      "The weekly drift sweep, so a repository whose gate quietly stops publishing gets noticed.",
      "Sync pull requests whenever the standard changes — nobody re-runs init by hand.",
    ],
  },
  {
    when: "Month two",
    title: "Start blocking, where the evidence supports it",
    you: [
      "Promote the repositories whose numbers clear the bar to block-blocker.",
      "Leave the rest where they are. The ladder refuses a promotion the evidence does not support, and says which number is short.",
    ],
    get: [
      "A guarantee you can actually state about a named set of repositories.",
      "A dashboard figure for how much of the estate is enforcing rather than watching.",
    ],
    note: "Demotion never needs evidence. If a gate misfires, step it back the same day and investigate afterwards — that is what makes promoting safe.",
  },
  {
    when: "Ongoing",
    title: "Price it, and tune it",
    you: [
      "Run the ROI page before a budget conversation.",
      "Read the tuning queue: rules that fire often and are acted on rarely.",
      "Ingest whatever scanners the estate already runs, so the picture is whole.",
    ],
    get: [
      "Cost per BLOCKER caught — a figure no cost tool and no DORA tool can compute.",
      "One severity contract across LLM review and static analysis.",
    ],
  },
];

export default function Page() {
  return (
    <DocsPage
      crumb="Getting Started"
      title="Adopting Redline"
      intro="What actually happens, in order, and when it is reasonable to start blocking merges. The short answer is: later than you think, and on evidence rather than a date."
      href="/docs/adopting"
    >
      <p>
        Redline is deliberately unenforcing on day one. Every stage below ends
        where the evidence for the next one is gathered — the same rule the{" "}
        <Link href="/docs/enforcement">enforcement ladder</Link> applies
        mechanically, said in prose.
      </p>

      {PHASES.map((phase) => (
        <div key={phase.when}>
          <h2>
            {phase.when} — {phase.title}
          </h2>
          <p>
            <b>What you do</b>
          </p>
          <ul>
            {phase.you.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            <b>What you get</b>
          </p>
          <ul>
            {phase.get.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {phase.note && (
            <div className="callout info">
              <span className="ic">ℹ</span>
              <p>{phase.note}</p>
            </div>
          )}
        </div>
      ))}

      <h2>Two things to decide early</h2>
      <ul>
        <li>
          <b>Who owns the standard.</b> A rule change is a production change: it
          reaches every onboarded repository as a pull request. Somebody has to be
          able to say yes to one.
        </li>
        <li>
          <b>Who can turn the gate off.</b> Before any repository blocks, write
          down how a team disables it out of hours without waiting for that
          person. A control nobody can release is one people work around.
        </li>
      </ul>

      <h2>What does not change</h2>
      <p>
        No repository is asked to change which scanners it runs, which assistant
        it uses, or how it deploys. Redline governs the change while it is still a
        diff — see <Link href="/docs">what it is and is not</Link>.
      </p>
    </DocsPage>
  );
}
