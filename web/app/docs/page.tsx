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
      intro="Redline is the review system your team doesn't have: one written standard that your AI follows while it writes, your machine checks before you push, and the pull request gate checks before merge — and it counts which rules actually catch bugs."
      href="/docs"
    >
      <p>
        It is not a linter — a linter checks syntax, and many of Redline&apos;s
        rules are judgement a linter cannot express. It is not a reviewer either
        — people and the AI tools you already use still review. Redline decides
        what <i>reviewed</i> means, and holds every reviewer to the same
        definition.
      </p>
      <p>
        AI assistants write more of your code every quarter, and the review
        capacity to check it did not grow with them. The bar a team agreed on is
        now enforced — or not — by whatever tooling happens to be in front of the
        diff, which is why Redline versions the standard rather than leaving it
        to a prompt somebody wrote once.
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
        are well served. Findings can come from Redline&apos;s own checker, your
        AI reviewer or another tool: Redline{" "}
        <Link href="/docs/ingestion">normalises whoever found what</Link>, and
        measures whether anyone acted.
      </p>

      <h2>Words this site uses</h2>
      <table>
        <tbody>
          <tr><td><b>Standard</b></td><td>The rule set in <code>standards/</code>: core rules plus one file per stack, versioned. Every rule has a permanent id such as <code>core/unsafe-assertion</code>.</td></tr>
          <tr><td><b>Profile</b></td><td>Which stacks apply to a repository, e.g. <code>web-react</code>. A file only meets the rules of the stacks it belongs to.</td></tr>
          <tr><td><b>Gate</b></td><td>The <code>redline-gate / gate</code> check on every pull request. It starts advisory — it comments, it blocks nothing — until you promote it.</td></tr>
          <tr><td><b>Deterministic check</b></td><td>A rule a checker decides without a model, so it can run in <code>redline review</code>, the pre-push hook and the gate with no false positives allowed.</td></tr>
          <tr><td><b>Seed</b></td><td>A defect planted on purpose in the public corpus, marked with the rule that must catch it. Seeds are how a reviewer is scored.</td></tr>
          <tr><td><b>Estate</b></td><td>Every repository an organisation has onboarded. <code>redline sync</code> and <code>redline metrics</code> work across it.</td></tr>
        </tbody>
      </table>

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
