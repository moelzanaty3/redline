import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Introduction" };

export default function Page() {
  return (
    <DocsPage
      crumb="Introduction"
      title="Introduction"
      intro="Redline is the standards and findings control plane for AI-assisted development. It governs the change while it is still a diff: versioned standards rendered into your repo's AI tooling, a merge-readiness gate, distribution across the estate, and telemetry that counts what was acted on."
      href="/docs"
    >
      <p>
        AI assistants write more of your code every quarter. Redline makes sure
        what merges still meets your bar: every pull request is reviewed against
        a <b>versioned, vendor-neutral standard</b>, checked by a{" "}
        <b>merge-readiness gate</b>, and measured by <b>telemetry that counts what was
        acted on</b> — not what was merely flagged.
      </p>
      <p>
        There are no servers, no SaaS and no per-seat fee beyond the AI licences
        you already pay for. Redline detects <b>GitHub or Azure DevOps</b> from
        your git remote and talks to whichever one you&apos;re on through the
        same command — rulesets or branch policies, reusable pipelines, and
        pull requests either way.
      </p>
      <h2>Where the line is</h2>
      <p>
        Redline governs a change while it is still a diff. It does not build,
        deploy, promote or roll back anything, it has no opinion on cloud spend,
        and its data ends at merge — those are a delivery platform&apos;s job and
        are well served. It increasingly does not even produce findings itself:
        it governs the standard, <Link href="/docs/ingestion">normalises whoever
        found what</Link>, and measures whether anyone acted.
      </p>

      <h2>The loop</h2>
      <CodeWindow title="the delivery loop">
        <span className="tk-red">standards/</span>  <span className="tk-dim">— humans edit one place, versioned + changelogged</span>{"\n"}
        {"   "}↓ <span className="tk-white">the CLI&apos;s renderer</span>{"\n"}
        <span className="tk-white">4 vendor formats</span>  <span className="tk-dim">— Copilot · AGENTS.md (Codex) · Claude · Cursor</span>{"\n"}
        {"   "}↓ <span className="tk-white">redline init (one PR, per repo) · redline sync (to the whole estate)</span>{"\n"}
        <span className="tk-white">every onboarded repo</span>  <span className="tk-dim">— gated on merge, at the rung that repo has earned</span>{"\n"}
        {"   "}↓ <span className="tk-white">redline verify (locally, or across the estate weekly)</span>{"\n"}
        <span className="tk-white">drift caught early</span>  <span className="tk-dim">— policy, security floor, stale artifacts, pending admin work</span>{"\n"}
        {"   "}↓ <span className="tk-white">redline metrics (nightly)</span>{"\n"}
        <span className="tk-white">what was acted on</span>  <span className="tk-dim">— and what it cost: the number that decides which rules earn their place</span>
      </CodeWindow>

      <h2>What makes it different</h2>
      <ul>
        <li><b>A measurable output contract.</b> Findings are prefixed <code>Redline/&lt;SEVERITY&gt; [&lt;rule-id&gt;]:</code> — so recall, precision and noise are measured, never guessed.</li>
        <li><b>Advisory first, and it stays that way until the numbers say otherwise.</b> A repository climbs the <Link href="/docs/enforcement">enforcement ladder</Link> on recorded evidence — seed recall, false positives, acted-on rate — and steps back down without needing anyone&apos;s permission.</li>
        <li><b>It refuses rather than approximates.</b> A check that could not run reports <code>??</code>, never <code>ok</code>. An unmeasurable figure is absent with its reason, never zero. A correlation below its sample threshold is withheld. Each of those is a place where a confident wrong answer would have been easier to build.</li>
        <li><b>Noise control is a rule.</b> Every standard ships a “what NOT to flag” section, and the clean-code corpus allows zero false positives.</li>
        <li><b>Vendor-neutral.</b> The rules, gate and telemetry don&apos;t know which AI produced a comment. Comparing vendors on identical seeded input is one command.</li>
        <li><b>Degrades honestly.</b> An engineer without repo-admin rights still gets everything file-level; what needs an admin is recorded, not silently skipped.</li>
      </ul>

      <h2>Where to go next</h2>
      <ul>
        <li><Link href="/docs/quickstart"><b>Quickstart</b></Link> — onboard one repository in ten minutes, with nothing blocked at the end.</li>
        <li><Link href="/docs/adopting"><b>Adopting Redline</b></Link> — what happens in week one and month two, and when it is reasonable to start blocking.</li>
        <li><Link href="/docs/output-contract"><b>The output contract</b></Link> — how to read a finding and what each severity obliges you to do.</li>
        <li><Link href="/docs/standards"><b>Standards</b></Link> — browse and copy the full rule set.</li>
      </ul>
    </DocsPage>
  );
}
