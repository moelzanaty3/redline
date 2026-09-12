import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Cursor adaptor" };

export default function Page() {
  return (
    <DocsPage
      crumb="Adaptors"
      title="Cursor rules"
      intro="One .mdc rule file per stack, scoped by frontmatter globs — rendered by redline init wherever the organisation has the vendor enabled."
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
        <li>Check the vendor is on for your organisation: <code>vendors.cursor.enabled</code> in <code>standards/manifest.json</code>, which ships <code>true</code>. A vendor the manifest disables never renders, whatever a repository asks for.</li>
        <li>Run <code>npx redlinegate init</code> on the repo — it renders the <code>.cursor/rules/</code> files and opens a pull request with them. A later standards change arrives as a sync pull request, or is picked up by re-running <code>init</code> — see <Link href="/docs/distribution">Distribution &amp; drift</Link>.</li>
        <li>Cursor picks them up automatically; the Cursor <b>agent</b> additionally reads <code>AGENTS.md</code>.</li>
      </ol>
    </DocsPage>
  );
}
