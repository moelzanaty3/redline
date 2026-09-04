import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Cursor adaptor" };

export default function Page() {
  return (
    <DocsPage
      crumb="Adaptors"
      title="Cursor rules"
      intro="The Cursor IDE reads scoped .mdc rule files. Redline renders one per stack, glob-scoped via frontmatter."
      href="/docs/adaptors/cursor"
    >
      <h2>What gets rendered</h2>
      <CodeWindow title="rendered artifacts">
        <span className="tk-white">.cursor/rules/redline-javascript.mdc</span>   <span className="tk-dim"># globs: **/*.js, **/*.mjs …</span>{"\n"}
        <span className="tk-white">.cursor/rules/redline-react.mdc</span>        <span className="tk-dim"># globs: **/*.tsx …</span>
      </CodeWindow>
      <p>
        Each file carries a <code>globs:</code> frontmatter list, so rules
        activate only on matching files. The <code>redline-</code> prefix keeps
        pruning safe — Cursor rules a team wrote themselves are never touched.
      </p>

      <h2>Connect it</h2>
      <ol>
        <li>Enable the vendor org-wide: set <code>vendors.cursor.enabled</code> to <code>true</code> in <code>standards/manifest.json</code> (off by default).</li>
        <li>Run <code>npx redline-cli init</code> on the repo — it renders the <code>.cursor/rules/</code> files and opens a pull request with them. There is no separate re-sync command yet; re-running <code>redline init</code> after a standards change re-renders and reports drift via <code>redline verify</code>.</li>
        <li>Cursor picks them up automatically; the Cursor <b>agent</b> additionally reads <code>AGENTS.md</code>.</li>
      </ol>
    </DocsPage>
  );
}
