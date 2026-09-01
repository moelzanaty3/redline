import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Introduction" };

export default function Page() {
  return (
    <DocsPage
      crumb="Introduction"
      title="Introduction"
      intro="Redline is the engineering oversight layer for AI-assisted development — versioned standards, automated review, hard gates and telemetry, built entirely on GitHub-native primitives."
      href="/docs"
    >
      <p>
        AI assistants write more of your code every quarter. Redline makes sure
        what merges still meets your bar: every pull request is reviewed against
        a <b>versioned, vendor-neutral standard</b>, blocked by a{" "}
        <b>readiness gate</b>, and measured by <b>telemetry that counts what was
        acted on</b> — not what was merely flagged.
      </p>
      <p>
        There are no servers, no SaaS and no per-seat fee beyond the AI licences
        you already pay for. Everything runs on GitHub: rulesets, reusable
        Actions workflows, Pages and pull requests.
      </p>

      <h2>The loop</h2>
      <CodeWindow title="the delivery loop">
        <span className="tk-red">standards/</span>  <span className="tk-dim">— humans edit one place, versioned + changelogged</span>{"\n"}
        {"   "}↓ <span className="tk-white">render.mjs</span>{"\n"}
        <span className="tk-white">4 vendor formats</span>  <span className="tk-dim">— Copilot · AGENTS.md · Claude · Cursor</span>{"\n"}
        {"   "}↓ <span className="tk-white">sync (PRs, never pushes)</span>{"\n"}
        <span className="tk-white">every onboarded repo</span>  <span className="tk-dim">— reviewed on each PR, gated on merge</span>{"\n"}
        {"   "}↓ <span className="tk-white">nightly telemetry</span>{"\n"}
        <span className="tk-white">digest · inbox · dashboard</span>  <span className="tk-dim">— noisy rules named, tuned or cut</span>
      </CodeWindow>

      <h2>What makes it different</h2>
      <ul>
        <li><b>A measurable output contract.</b> Findings are prefixed <code>Redline/&lt;SEVERITY&gt; [&lt;rule-id&gt;]:</code> — so recall, precision and noise are measured, never guessed.</li>
        <li><b>Advisory, never the approver.</b> One human approval is always required; CI fails if that is ever lowered.</li>
        <li><b>Noise control is a rule.</b> Every standard ships a “what NOT to flag” section, and the clean-code corpus allows zero false positives.</li>
        <li><b>Vendor-neutral.</b> The rules, gate and telemetry don&apos;t know which AI produced a comment. Comparing vendors on identical seeded input is one command.</li>
        <li><b>Least privilege.</b> Onboarding grants Redline no write access; telemetry is pulled with one read-only token.</li>
      </ul>

      <h2>Where to go next</h2>
      <ul>
        <li><b>Installation</b> — the eight-step org rollout.</li>
        <li><b>Onboard a repository</b> — one command per repo.</li>
        <li><b>Standards</b> — browse and copy the full rule set.</li>
        <li><b>Adaptors</b> — connect Copilot, Claude, Codex-style agents or Cursor.</li>
      </ul>
    </DocsPage>
  );
}
