import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "AGENTS.md adaptor" };

export default function Page() {
  return (
    <DocsPage
      crumb="Adaptors"
      title="AGENTS.md agents"
      intro="OpenAI Codex, the Copilot coding agent, Jules, Devin and the Cursor agent all read AGENTS.md — one concatenated file, generated per profile."
      href="/docs/adaptors/agents-md"
    >
      <h2>What gets rendered</h2>
      <CodeWindow title="AGENTS.md structure">
        <span className="tk-white">…repo-owned context (from templates/repo-context.md)…</span>{"\n"}
        {"\n"}
        <span className="tk-green">&lt;!-- REDLINE:BEGIN — generated. Do not edit inside this block. --&gt;</span>{"\n"}
        <span className="tk-dim">&lt;!-- Redline v0.0.1 · profile: web · stacks: javascript, react --&gt;</span>{"\n"}
        <span className="tk-white"># Redline — Core Engineering Standards</span>{"\n"}
        <span className="tk-white"># Stack rules — JavaScript · React</span>{"\n"}
        <span className="tk-green">&lt;!-- REDLINE:END --&gt;</span>
      </CodeWindow>
      <ul>
        <li>There is no glob mechanism in AGENTS.md, so each section states its scope <b>in prose</b> — “Applies to untyped and loosely-typed JS…”.</li>
        <li>Everything outside the <code>REDLINE:BEGIN/END</code> markers is repo-owned and survives every sync.</li>
        <li>The version comment means a repo&apos;s artifacts always name the standards version they came from.</li>
      </ul>

      <h2>Connect an agent</h2>
      <ol>
        <li>Onboard the repo with <code>npx redline-cli init</code> — the pull request it opens adds <code>AGENTS.md</code> with the profile&apos;s stacks.</li>
        <li>Point the agent at the repo. Codex, Copilot coding agent, Jules, Devin and Cursor&apos;s agent read <code>AGENTS.md</code> by convention — no per-vendor configuration.</li>
        <li>Add repo-specific context above the marker block using <code>templates/repo-context.md</code>.</li>
      </ol>

      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          The concatenated <code>AGENTS.md</code> for{" "}
          <code>fullstack-node</code> is the largest artifact the renderer
          produces — keep individual stack files focused when adding rules.
        </p>
      </div>
    </DocsPage>
  );
}
