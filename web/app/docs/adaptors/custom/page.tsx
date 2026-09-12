import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Add your own vendor" };

export default function Page() {
  return (
    <DocsPage
      crumb="Adaptors"
      title="Add your own vendor"
      intro="Redline is a standards system with adapters — only ~60 lines of the renderer are vendor-aware, and that is the whole surface a new vendor touches."
      href="/docs/adaptors/custom"
    >
      <h2>The contract</h2>
      <p>
        Add one function to the <code>VENDORS</code> record in{" "}
        <code>cli/render/vendors.ts</code> — the renderer lives in the CLI as
        TypeScript, not <code>scripts/render.mjs</code> (deleted). A{" "}
        <code>VendorRenderer</code> is <code>(ctx: RenderContext) =&gt;
        VendorOutput</code>, where <code>ctx</code> carries{" "}
        <code>{"{ manifest, root, profile, stacks }"}</code> — every real
        vendor needs <code>ctx.root</code> and <code>ctx.manifest</code> to
        actually read rule text off disk; a function that only sees{" "}
        <code>profile</code> and <code>stacks</code> has no way to read a
        single rule.
      </p>
      <CodeWindow title="cli/render/vendors.ts — a minimal vendor">
        <span className="tk-white">const</span> myvendor: <span className="tk-blue">VendorRenderer</span> = (ctx) =&gt; {"{"}{"\n"}
        {"  "}<span className="tk-white">const</span> files = <span className="tk-white">new</span> <span className="tk-blue">Map</span>&lt;string, RenderedFile&gt;();{"\n"}
        {"  "}files.set(<span className="tk-green">&apos;.myvendor/redline-core.rules&apos;</span>, {"{"}{"\n"}
        {"    "}merge: <span className="tk-white">true</span>,  <span className="tk-dim">// wraps the body in REDLINE:BEGIN markers</span>{"\n"}
        {"    "}body: read(ctx.root, ctx.manifest.core.source),{"\n"}
        {"  "}{"}"});{"\n"}
        {"  "}<span className="tk-white">return</span> {"{"}{"\n"}
        {"    "}files,{"\n"}
        {"    "}prune: [{"{"} dir: <span className="tk-green">&apos;.myvendor&apos;</span>, matches: (f) =&gt; f.startsWith(<span className="tk-green">&apos;redline-&apos;</span>) {"}"}],{"\n"}
        {"  "}{"}"};{"\n"}
        {"}"};
      </CodeWindow>
      <ul>
        <li><code>merge: true</code> wraps the body in <code>&lt;!-- REDLINE:BEGIN --&gt;</code> markers and preserves everything outside them — a repo&apos;s own context survives every re-render. That marker string is frozen deliberately: changing it would make every already-onboarded repo append a second block instead of replacing its first.</li>
        <li><code>prune</code> is an array of <code>{"{ dir, matches: (filename) => boolean }"}</code> — not glob strings. <code>redline init</code> deletes anything matching, inside <code>dir</code>, that a re-render no longer produces. Every real vendor generates filenames prefixed <code>redline-</code> precisely so pruning can never touch a file a team wrote by hand.</li>
      </ul>

      <h2>Register and ship</h2>
      <ol>
        <li>Add the vendor to <code>vendors</code> in <code>standards/manifest.json</code> with <code>enabled: true</code>.</li>
        <li>CI renders it for every profile on the next PR — the render-drift check keeps output honest.</li>
        <li>Merge. Registered repositories get the new artifacts as a sync pull request; anything not in the register picks them up on its next <code>redline init</code>, and <code>redline verify</code> reports it stale until then.</li>
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
