import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { RedlineTerminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "The output contract" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="The output contract"
      intro="Every finding starts with the same machine-readable line: a severity and a permanent rule id. That line is what lets Redline count findings, per rule, across every reviewer and every repository."
      href="/docs/output-contract"
    >
      <h2>Why a fixed format</h2>
      <p>
        Free-text review comments cannot be counted. If Copilot writes &ldquo;possible SQL
        injection&rdquo; and Claude writes &ldquo;unsafe query building&rdquo;, nothing can tell
        that both are the same rule, or whether anyone fixed either. A fixed first line solves
        that: every reviewer names the same rule the same way, so the organisation can ask
        &ldquo;which rules do people act on, and which do they ignore?&rdquo;
      </p>

      <h2>Anatomy of a finding</h2>
      <CodeWindow title="a finding, as posted on a pull request">
        <span className="tk-red">Redline/BLOCKER</span> <span className="tk-blue">[core/query-string-concatenation]</span>: <span className="tk-white">user-supplied `name` is</span>{"\n"}
        <span className="tk-white">concatenated into the SQL string, so a crafted value changes the query.</span>{"\n"}
        <span className="tk-white">Use a parameterised query: db.Query(&quot;SELECT id FROM users WHERE name = $1&quot;, name)</span>
      </CodeWindow>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>Example</th>
              <th>Rule</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Prefix and severity</td>
              <td>
                <code>Redline/BLOCKER</code>
              </td>
              <td>
                One of <code>BLOCKER</code>, <code>HIGH</code>, <code>SUGGESTION</code>. Nothing else.
              </td>
            </tr>
            <tr>
              <td>Rule id</td>
              <td>
                <code>[core/query-string-concatenation]</code>
              </td>
              <td>The id of the rule being applied, exactly as written in the standard.</td>
            </tr>
            <tr>
              <td>Problem</td>
              <td>the rest of the first line</td>
              <td>One line: what is wrong.</td>
            </tr>
            <tr>
              <td>Why and fix</td>
              <td>the next one or two sentences</td>
              <td>Why it breaks, and the concrete change.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        One finding per comment. No preamble, no praise, no restating the diff.{" "}
        <b>If nothing qualifies, the reviewer posts nothing.</b>
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
        A reviewer may not invent a severity, or raise a SUGGESTION to HIGH to get attention.
        Which severity actually stops a merge is set per repository by its{" "}
        <Link href="/docs/enforcement">rung</Link>.
      </p>

      <h2>Rule ids</h2>
      <p>
        Every rule has a permanent id of the form <code>&lt;stack&gt;/&lt;slug&gt;</code>:{" "}
        <code>core/hardcoded-secrets</code>, <code>javascript/floating-promises</code>,{" "}
        <code>react/effect-derived-state</code>. The id never changes when the rule&apos;s wording
        does, so a year of findings stays comparable.
      </p>
      <ul>
        <li>
          <b>One rule per comment.</b> A line that breaks two rules gets two comments.
        </li>
        <li>
          <b>
            <code>core/uncatalogued</code>
          </b>{" "}
          is for a real problem no rule covers. Each use names the principle it offends, and a
          rising count is how a missing rule gets discovered.
        </li>
        <li>
          <b>Counted per id.</b> A rule&apos;s <Link href="/docs/telemetry#acted-on">acted-on
          rate</Link> is computed against its id. That is how the organisation finds the rules
          that earn their place and the ones that only make noise.
        </li>
      </ul>
      <p>To read what a rule id in a finding means, and which files it applies to:</p>
      <RedlineTerminal commands="{redline} explain core/query-string-concatenation" />

      <h2>What happens to a finding that breaks the contract</h2>
      <p>
        The telemetry collector reads the first line of every automated review comment. A comment
        that does not follow the contract is not lost, but it cannot be measured properly:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>The comment</th>
              <th>How it is counted</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Has no <code>Redline/&lt;SEVERITY&gt;</code> prefix
              </td>
              <td>
                <b>Untagged.</b> Its severity is guessed, and the dashboard warns that it ignored
                the output contract.
              </td>
            </tr>
            <tr>
              <td>Has a prefix but no rule id</td>
              <td>Counted, but invisible to per-rule tuning. The dashboard warns.</td>
            </tr>
            <tr>
              <td>Cites an id that is not in the standard</td>
              <td>Counted, and the dashboard warns that it cited a rule outside the catalogue.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Untagged findings are reported as <Link href="/docs/telemetry#noise">noise</Link>. When the
        CLI reviews with a model itself (<code>review --engine api</code>), the model returns JSON
        and the CLI writes the line, so these cases cannot occur. See{" "}
        <Link href="/docs/local-review">Reviewing before you push</Link>.
      </p>

      <h2>Noise control</h2>
      <p>
        Review that flags everything gets ignored. The core standard has a &ldquo;What NOT to
        flag&rdquo; section that applies to every review, whatever the stack:
      </p>
      <ul>
        <li>formatting, import order, or anything a linter or formatter already enforces</li>
        <li>existing patterns the pull request touches but does not change</li>
        <li>suggestions to use a different library when the current one works</li>
        <li>naming preferences where the existing name is clear</li>
        <li>the same issue on every occurrence: flag the first, then say &ldquo;and N similar&rdquo;</li>
      </ul>
      <p>
        The test for any finding: <b>if you cannot describe the input that breaks it, it is not a
        finding.</b>
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          The contract is checked in CI. <code>scripts/validate.mjs</code> fails the build if the
          core standard stops documenting the three prefixes, the rule id or the &ldquo;What NOT to
          flag&rdquo; section, or if the collector&apos;s parser can no longer read a finding in
          this format.
        </p>
      </div>
      <p>
        <Link href="/docs/learn/explain-and-fix">Learn step 03</Link> reads a real finding, looks
        up its rule, and fixes it.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/telemetry">Telemetry &amp; value</Link>: what is measured from these
          lines.
        </li>
        <li>
          <Link href="/docs/standards">Standards</Link>: every rule and its id.
        </li>
        <li>
          <Link href="/docs/deterministic">Deterministic rules</Link>: findings a checker writes
          with no model, in the same format.
        </li>
      </ul>
    </DocsPage>
  );
}
