import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Claude adaptor" };

export default function Page() {
  return (
    <DocsPage
      crumb="Adaptors"
      title="Claude"
      intro="Claude Code and Claude in GitHub read CLAUDE.md, which imports the generated AGENTS.md — zero duplication, one source of truth."
      href="/docs/adaptors/claude"
    >
      <h2>What gets rendered</h2>
      <CodeWindow title="CLAUDE.md">
        <span className="tk-dim"># repo-owned context can live above the import</span>{"\n"}
        <span className="tk-white">@AGENTS.md</span>
      </CodeWindow>
      <p>
        The <code>@AGENTS.md</code> import pulls the full rendered standard —
        core rules plus the repo&apos;s profile stacks — into every Claude
        session. Scoping is inherited from AGENTS.md&apos;s per-section prose.
      </p>

      <h2>Connect Claude Code (CLI / IDE)</h2>
      <ol>
        <li>Onboard the repo with <code>npx redline-cli init</code> — the pull request it opens adds <code>CLAUDE.md</code> and <code>AGENTS.md</code>.</li>
        <li>Nothing else. Claude Code loads <code>CLAUDE.md</code> automatically on session start; reviews and edits follow the standard, including the output contract when asked to review.</li>
      </ol>

      <h2>Connect Claude in GitHub</h2>
      <ol>
        <li>Install the Claude GitHub app on the org or repo.</li>
        <li>Mention <code>@claude</code> on a PR, or configure it to review automatically.</li>
        <li>Findings arrive with the <code>Redline/&lt;SEVERITY&gt; [&lt;rule-id&gt;]:</code> prefix, so telemetry attributes them like any other vendor.</li>
      </ol>

      <h2>Compare it against other vendors</h2>
      <CodeWindow
        title="terminal — evidence-based comparison"
        copyText={`GH_TOKEN=... npx redline-cli metrics score-seeds --repo acme/pilot-claude --pr 7 --json\nGH_TOKEN=... npx redline-cli metrics score-seeds --repo acme/pilot-copilot --pr 4 --json`}
      >
        <span className="tk-prompt">$</span> <span className="tk-white">npx redline-cli metrics score-seeds --repo acme/pilot-claude  --pr 7 --json</span>{"\n"}
        <span className="tk-prompt">$</span> <span className="tk-white">npx redline-cli metrics score-seeds --repo acme/pilot-copilot --pr 4 --json</span>{"\n"}
        <span className="tk-dim"># compare blocker_recall and false_positives_on_clean on identical seeded input</span>
      </CodeWindow>
      <p>
        The scorer reads the contract prefix and a bot list — it neither knows
        nor cares which vendor produced the comment.
      </p>
    </DocsPage>
  );
}
