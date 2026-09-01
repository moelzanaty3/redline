import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Add your own vendor" };

export default function Page() {
  return (
    <DocsPage
      crumb="Adaptors"
      title="Add your own vendor"
      intro="Redline is a standards system with adapters — only ~60 lines of the renderer are vendor-aware. Adding a vendor is one function."
      href="/docs/adaptors/custom"
    >
      <h2>The contract</h2>
      <p>
        Add one function to the <code>vendors</code> object in{" "}
        <code>scripts/render.mjs</code>. It receives{" "}
        <code>{"{ profile, stacks }"}</code> and returns the files to write:
      </p>
      <CodeWindow title="scripts/render.mjs — vendor function shape">
        <span className="tk-white">myvendor</span>: ({"{ profile, stacks }"}) =&gt; ({"{"}{"\n"}
        {"  "}files: <span className="tk-blue">Map</span>&lt;path, {"{ body, merge? }"}&gt;,  <span className="tk-dim">// merge: true wraps in REDLINE markers</span>{"\n"}
        {"  "}prune: [<span className="tk-green">&quot;.myvendor/redline-*.rules&quot;</span>]   <span className="tk-dim">// generated files sync may delete</span>{"\n"}
        {"}"})
      </CodeWindow>
      <ul>
        <li><code>merge: true</code> wraps the body in <code>&lt;!-- REDLINE:BEGIN --&gt;</code> markers and preserves everything outside them — a repo&apos;s own context survives every sync.</li>
        <li><code>prune</code> lets sync delete generated files a profile no longer includes. Generated files are prefixed <code>redline-</code> precisely so pruning can never touch a file a team wrote.</li>
      </ul>

      <h2>Register and ship</h2>
      <ol>
        <li>Add the vendor to <code>vendors</code> in <code>standards/manifest.json</code> with <code>enabled: true</code>.</li>
        <li>CI renders it for every profile on the next PR — the render-drift check keeps output honest.</li>
        <li>Merge. The next sync distributes the new artifacts to every onboarded repo as PRs.</li>
      </ol>

      <h2>Measurement comes free</h2>
      <p>
        Telemetry and seed scoring classify a review comment by the reviewer
        login and the <code>Redline/&lt;SEVERITY&gt;</code> prefix — neither
        knows which vendor produced it. Any vendor that follows the output
        contract is measurable from day one, and comparable against the
        incumbents on identical seeded input.
      </p>
    </DocsPage>
  );
}
