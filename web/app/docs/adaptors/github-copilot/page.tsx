import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "GitHub Copilot adaptor" };

export default function Page() {
  return (
    <DocsPage
      crumb="Adaptors"
      title="GitHub Copilot"
      intro="Copilot code review and chat read the rendered instruction files — one core file plus one scoped file per stack in the repo's profile."
      href="/docs/adaptors/github-copilot"
    >
      <h2>What gets rendered</h2>
      <CodeWindow title="rendered artifacts">
        <span className="tk-white">.github/copilot-instructions.md</span>              <span className="tk-dim"># core standard, always read</span>{"\n"}
        <span className="tk-white">.github/instructions/redline-react.instructions.md</span> <span className="tk-dim"># per stack, scoped by applyTo:</span>{"\n"}
        <span className="tk-white">.github/instructions/redline-javascript.instructions.md</span>
      </CodeWindow>
      <p>
        Stack files carry an <code>applyTo:</code> frontmatter glob list, so
        React rules fire on <code>**/*.tsx</code> and never on a Go file. The{" "}
        <code>redline-</code> prefix is what makes safe pruning possible — a
        team&apos;s own instruction files are never touched by sync.
      </p>

      <h2>Connect it</h2>
      <ol>
        <li>Onboard the repo: <code>scripts/setup-repo.sh &lt;org&gt;/&lt;repo&gt; &lt;profile&gt;</code> — the sync PR adds the instruction files.</li>
        <li>Enable Copilot code review for the repo or org (Copilot settings → code review).</li>
        <li>The branch ruleset ships with <code>automatic_copilot_code_review_enabled</code> — every PR gets reviewed without being requested.</li>
        <li>Merge the sync PR. Findings arrive as review comments with the <code>Redline/&lt;SEVERITY&gt; [&lt;rule-id&gt;]:</code> prefix.</li>
      </ol>

      <h2>Render manually</h2>
      <CodeWindow
        title="terminal"
        copyText="node scripts/render.mjs --profile web --vendors copilot --out ./target-repo"
      >
        <span className="tk-prompt">$</span> <span className="tk-white">node scripts/render.mjs --profile web --vendors copilot --out ./target-repo</span>
      </CodeWindow>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Copilot reads the core file plus every matching instructions file, so
          individual stack files stay focused. The{" "}
          <code>automatic_copilot_code_review_enabled</code> ruleset flag is the
          only Copilot-specific line in the entire enforcement layer.
        </p>
      </div>
    </DocsPage>
  );
}
