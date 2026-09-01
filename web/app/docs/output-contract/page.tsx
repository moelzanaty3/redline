import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "The output contract" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="The output contract"
      intro="Every finding begins with a machine-readable prefix: a severity and a permanent rule id. This is the part that turns review comments into metrics."
      href="/docs/output-contract"
    >
      <CodeWindow title="a real finding">
        <span className="tk-red">Redline/BLOCKER</span> <span className="tk-blue">[core/query-string-concatenation]</span>: <span className="tk-white">user-supplied `name` is</span>{"\n"}
        <span className="tk-white">concatenated into the SQL string, so a crafted value changes the query.</span>{"\n"}
        <span className="tk-white">Use a parameterised query: db.Query(&quot;SELECT id FROM users WHERE name = $1&quot;, name)</span>
      </CodeWindow>
      <p>
        Then one or two sentences: why it breaks, and the concrete fix. No
        preamble, no praise, no restating the diff. One finding per comment.{" "}
        <b>If nothing qualifies, post nothing.</b>
      </p>

      <h2>Severities</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Severity</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr><td>BLOCKER</td><td><b>Must not merge.</b> Security exposure, data loss, crash, silent corruption, or a contract break for live consumers.</td></tr>
            <tr><td>HIGH</td><td><b>Merge is a deliberate trade-off.</b> A reviewer must acknowledge it explicitly.</td></tr>
            <tr><td>SUGGESTION</td><td><b>Optional.</b> The author may dismiss it without justification.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        No invented severities, and no upgrading a SUGGESTION to HIGH to get
        attention — severity inflation is itself measured noise.
      </p>

      <h2>Rule ids</h2>
      <p>
        Every rule carries a permanent <code>&lt;stack&gt;/&lt;slug&gt;</code>{" "}
        id — <code>core/hardcoded-secrets</code>,{" "}
        <code>javascript/floating-promises</code>,{" "}
        <code>react/effect-derived-state</code>. Findings must cite the id of
        the rule they apply, exactly as written.
      </p>
      <ul>
        <li>Ids are <b>stable across wording changes</b> and aggregated per rule — that&apos;s how the org learns which rules earn their place and which only generate noise.</li>
        <li><code>core/uncatalogued</code> is reserved for a real finding no rule covers. A rising count there is how a missing rule gets discovered.</li>
        <li>A finding without a valid id cannot be measured and is treated as untagged — untagged counts appear in telemetry.</li>
      </ul>

      <h2>Noise control</h2>
      <p>
        AI review dies by nitpick spam, so every standard ships an explicit
        “What NOT to flag” section: formatting a linter already enforces,
        existing patterns a PR merely touches, alternative libraries, naming
        preferences, repeats of the same issue. If you cannot describe the
        input that breaks it, it is not a finding.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          The contract is enforced, not aspirational:{" "}
          <code>scripts/validate.mjs</code> parses the contract example printed
          in the standard itself, and fails the build if the docs and the
          parser ever drift apart.
        </p>
      </div>
    </DocsPage>
  );
}
