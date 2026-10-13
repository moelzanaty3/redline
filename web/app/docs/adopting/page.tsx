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
      "Score the reviewer against the seeded corpus on a pilot repository with redline metrics score-seeds.",
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
      "Let the nightly redline registry run in the source repository add them to the register.",
      "Schedule redline metrics collect in your metrics repository, so the acted-on rate starts accumulating.",
    ],
    get: [
      "A derived register, and a coverage figure that is instrumented-against-onboarded rather than a raw count.",
      "The weekly drift sweep, so a repository whose gate quietly stops publishing gets noticed.",
      "A pull request on every registered repository whenever the standard changes: the platform team runs redline sync from the Redline source repository. A repository outside the register updates itself by bumping redlinegate and re-running init.",
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
      "Build the cost page with redline metrics roi before a budget conversation.",
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
      intro="A gate that blocks before anyone trusts it gets routed around. A gate that never blocks protects nothing. This page is the path between the two: what happens in order, and when to start blocking merges. The short answer: later than you think, and on evidence rather than a date."
      href="/docs/adopting"
    >
      <p>
        Redline is deliberately unenforcing on day one. Every stage below ends
        where the evidence for the next one is gathered — the same rule the{" "}
        <Link href="/docs/enforcement">enforcement ladder</Link> applies
        mechanically, said in prose. For one repository, start with{" "}
        <Link href="/docs/onboarding">Onboard a repository</Link>; this page is
        about a team, and then an estate.
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

      <h2 id="is-it-used">Is any of it being used?</h2>
      <p>
        <b>When:</b> after a few weeks of merged pull requests.{" "}
        <b>Who:</b> the platform team, not a repository owner — the commands
        behind this act on an organisation and are meaningless in a product
        repo (<Link href="/docs/who-runs-what">Who runs what</Link>).
      </p>
      <p>
        The hero number is <b>findings acted on</b>, and beside it the dashboard
        carries the <b>rule tuning queue</b> — the standard&apos;s own to-do
        list, and the thing to work through before anyone writes a new rule.{" "}
        <Link href="/docs/telemetry">Telemetry &amp; validation</Link> has the
        tiles, what each one reads like when it is healthy, and the weekly canary
        that proves the reviewer is still catching things.
      </p>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>The quiet failure:</b> a dashboard that looks calm because nothing
          reached it. A figure Redline could not compute says why instead of
          defaulting to zero — a measurement plane that fills gaps with zeros
          reports a stalled collector as a quiet week.
        </p>
      </div>

      <h2 id="end-state">The end state — earning the right to block</h2>
      <p>
        Success is not a blocking gate on day one. A repository climbs the{" "}
        <Link href="/docs/enforcement">enforcement ladder</Link> on recorded
        evidence — seed recall, false positives and acted-on rate, the same
        figures the dashboard reads — and the thresholds are deliberately hard
        because a reviewer that flags correct code cannot be given a veto.
        Promotion is refused without the evidence and names the figure that is
        short; demotion never needs any. Until the evidence exists, a repository
        is legitimately at <code>observe</code>.
      </p>

      <h2 id="commands">Which command answers which question</h2>
      <p>
        The first four run in a product repository, through its own pinned copy
        of the CLI. The rest act on the estate and run where the table says —{" "}
        <code>registry</code> from a checkout of the Redline source repository.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Question</th><th>Command</th><th>Where</th></tr>
          </thead>
          <tbody>
            <tr><td>What is installed here?</td><td><code>redline status</code></td><td>your repo, no credential</td></tr>
            <tr><td>Does the host agree?</td><td><code>redline verify</code></td><td>your repo</td></tr>
            <tr><td>What does this finding mean?</td><td><code>redline explain &lt;id&gt;</code></td><td>anywhere</td></tr>
            <tr><td>Would this diff pass?</td><td><code>redline review</code></td><td>your repo, before you push</td></tr>
            <tr><td>Who is onboarded?</td><td><code>redline registry</code></td><td>source repo, nightly</td></tr>
            <tr><td>What happened to the findings?</td><td><code>redline metrics collect</code></td><td>metrics repo, on a schedule</td></tr>
            <tr><td>Is review being acted on?</td><td><code>redline metrics dashboard</code></td><td>metrics repo</td></tr>
            <tr><td>Does it still catch defects?</td><td><code>redline metrics score-seeds</code></td><td>against a pull request carrying the corpus</td></tr>
            <tr><td>What did it cost?</td><td><code>redline metrics roi</code></td><td>metrics repo</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Two things to decide early</h2>
      <ul>
        <li>
          <b>Who owns the standard.</b> A rule change is a production change: it
          reaches every onboarded repository as a pull request. Somebody has to be
          able to say yes to one.
        </li>
        <li>
          <b>Who can turn the gate off.</b> Stepping down to{" "}
          <code>observe</code> needs no evidence: it is{" "}
          <code>redline init --rung observe</code>, merged as a pull request.
          Before any repository blocks, write down who can approve that pull
          request out of hours. A control nobody can release is one people work
          around.
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
