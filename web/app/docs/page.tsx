import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Introduction" };

export default function Page() {
  return (
    <DocsPage
      crumb="Introduction"
      title="Introduction"
      intro="Redline is the engineering oversight layer for AI-assisted development — versioned standards, automated review, a merge-readiness gate and telemetry, driven by a single CLI on GitHub or Azure DevOps."
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

      <h2>The loop</h2>
      <CodeWindow title="the delivery loop">
        <span className="tk-red">standards/</span>  <span className="tk-dim">— humans edit one place, versioned + changelogged</span>{"\n"}
        {"   "}↓ <span className="tk-white">the CLI&apos;s renderer</span>{"\n"}
        <span className="tk-white">4 vendor formats</span>  <span className="tk-dim">— Copilot · AGENTS.md · Claude · Cursor</span>{"\n"}
        {"   "}↓ <span className="tk-white">redline init (one PR, per repo)</span>{"\n"}
        <span className="tk-white">every onboarded repo</span>  <span className="tk-dim">— reviewed on each PR, gated on merge</span>{"\n"}
        {"   "}↓ <span className="tk-white">redline verify (on demand, or weekly)</span>{"\n"}
        <span className="tk-white">drift caught early</span>  <span className="tk-dim">— policy, security floor, stale artifacts, pending admin work</span>
      </CodeWindow>

      <h2>What makes it different</h2>
      <ul>
        <li><b>A measurable output contract.</b> Findings are prefixed <code>Redline/&lt;SEVERITY&gt; [&lt;rule-id&gt;]:</code> — so recall, precision and noise are measured, never guessed.</li>
        <li><b>Advisory first.</b> The merge gate reports, it does not block, until a repo deliberately promotes it after a soak period.</li>
        <li><b>Noise control is a rule.</b> Every standard ships a “what NOT to flag” section, and the clean-code corpus allows zero false positives.</li>
        <li><b>Vendor-neutral.</b> The rules, gate and telemetry don&apos;t know which AI produced a comment. Comparing vendors on identical seeded input is one command.</li>
        <li><b>Degrades honestly.</b> An engineer without repo-admin rights still gets everything file-level; what needs an admin is recorded, not silently skipped.</li>
      </ul>

      <h2>Where to go next</h2>
      <ul>
        <li><b>Installation</b> — install the CLI and the org-wide gate workflow.</li>
        <li><b>Onboard a repository</b> — one command per repo, GitHub or Azure DevOps.</li>
        <li><b>Standards</b> — browse and copy the full rule set.</li>
        <li><b>Adaptors</b> — connect Copilot, Claude, Codex-style agents or Cursor.</li>
      </ul>
    </DocsPage>
  );
}
