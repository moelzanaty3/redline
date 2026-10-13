import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { RedlineTerminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Exemptions" };

const BLOCK = `## Redline exemption

- reason: the upstream fix lands in v4 and we are pinned to v3 until the migration
- until: 2026-11-30
- scope: checklist`;

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Exemptions"
      intro="Sometimes merging with a failing process check is the right call. An exemption lets you do it on the record: what was accepted, why, and until when."
      href="/docs/exemptions"
    >
      <h2>Why a record, not just a label</h2>
      <p>
        A check that can never be waived gets worked around: someone disables it, or stops trusting
        it. A check that can be waived with a bare label gets waived without anyone knowing why, and
        the waiver outlives its reason.
      </p>
      <p>
        An exemption sits between the two. Months later, a reader can see who accepted the failure,
        why, and whether the date has passed.
      </p>

      <h2>What an exemption is</h2>
      <p>Two things on the pull request, and the gate needs both:</p>
      <ul>
        <li>
          <b>The <code>redline-exempt</code> label</b>, which tells the gate to look for an
          exemption.
        </li>
        <li>
          <b>
            A <code>## Redline exemption</code> block
          </b>{" "}
          in the pull request description, which says why and until when. The pull request template
          already carries the section, empty: fill it in or delete it.
        </li>
      </ul>
      <CodeWindow title="in the pull request description" copyText={BLOCK}>
        <span className="tk-white">{BLOCK}</span>
      </CodeWindow>

      <h2>The rules</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Rule</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>reason</code>
              </td>
              <td>required, at least 20 characters</td>
              <td>&ldquo;Needed for release&rdquo; tells a later reader nothing they can act on.</td>
            </tr>
            <tr>
              <td>
                <code>until</code>
              </td>
              <td>
                required, a <code>YYYY-MM-DD</code> date, at most <b>90 days</b> away. Valid to the end
                of that day, UTC.
              </td>
              <td>
                Longer than that is a standards change, not an exemption: raise it in the Redline
                source repository.
              </td>
            </tr>
            <tr>
              <td>
                <code>scope</code>
              </td>
              <td>
                optional: <code>checklist</code>, <code>adr</code>, <code>policy</code>, comma
                separated. <b>Omitted, it covers all three.</b>
              </td>
              <td>Name only what you are accepting.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The gate checks the scope against every failing check, one at a time. An exemption for{" "}
        <code>checklist</code> does not also waive a failing <code>policy</code>. Once{" "}
        <code>until</code> has passed, the exemption no longer applies: renew it deliberately, or
        fix the check.
      </p>

      <h2>When it matters</h2>
      <p>
        Only at a blocking <Link href="/docs/enforcement">rung</Link>. At <code>observe</code> a
        failing process check never stops a merge, so there is nothing to waive.
      </p>
      <p>At <code>block-blocker</code> or <code>block-high</code>, with the label applied:</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>The block</th>
              <th>The gate</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>valid, and its scope covers every failing process check</td>
              <td>passes, with a warning naming the exempted checks</td>
            </tr>
            <tr>
              <td>missing, invalid, expired, or not covering a failing check</td>
              <td>fails</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        A label with no valid block is refused. The gate has an input,{" "}
        <code>exemption-enforcement</code>, that relaxes this to a warning when set to{" "}
        <code>warn</code>. Its default is <code>require</code>, and <code>init</code> never changes
        it.
      </p>

      <h2>Check it before you push</h2>
      <p>Save the description to a file and name the failing check:</p>
      <RedlineTerminal
        commands="{redline} exempt --body-file body.md --scope checklist"
        output="exempt until 2026-11-30 (checklist): the upstream fix lands in v4 and we are pinned to v3 until the migration"
      />
      <p>
        It exits 0 when the exemption applies. Otherwise it exits 1 and says what is wrong:
      </p>
      <RedlineTerminal
        commands={`{redline} exempt --body-file body.md --scope policy`}
        output={`warn  the exemption covers checklist — it does not cover "policy". Widen its scope deliberately, or fix the check.`}
      />
      <p>
        <Link href="/docs/learn/exemptions">Learn step 08</Link> writes one on a real pull request.
      </p>

      <h2>What it can never do</h2>
      <div className="callout">
        <span className="ic">!</span>
        <p>
          An exemption covers the <b>process</b> checks only: the checklist, the ADR requirement and
          the deterministic policy. It cannot waive dependency review or the secret scan. That is
          what makes the <Link href="/docs/gate">security floor</Link> a floor.
        </p>
      </div>

      <h2>Other ways past a check</h2>
      <ul>
        <li>
          <b>
            The <code>no-adr</code> label
          </b>{" "}
          is the ADR check&apos;s own way out, for a single large pull request that decides nothing.
          It needs no block. See <Link href="/docs/gate">The merge gate</Link>.
        </li>
        <li>
          <b>Redline&apos;s sync pull requests</b> carry the <code>redline-sync</code> label and a
          real exemption block, with no special case in the gate. See{" "}
          <Link href="/docs/distribution#sync-exemption">Distribution</Link>.
        </li>
      </ul>

      <h2>What gets measured</h2>
      <p>
        The telemetry collector records the parsed block (reason, until, scope) with each merged
        pull request. The dashboard&apos;s <b>Gate exemptions</b> tile and the weekly digest show
        the share of merged pull requests that carried <code>redline-exempt</code> or{" "}
        <code>no-adr</code>. A rising share means the gate asks for something people cannot
        reasonably give. See <Link href="/docs/telemetry">Telemetry &amp; value</Link>.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/cli/exempt">
            <code>redline exempt</code>
          </Link>
          : every flag.
        </li>
        <li>
          <Link href="/docs/enforcement">Enforcement ladder</Link>: when a failing process check
          blocks.
        </li>
        <li>
          <Link href="/docs/gate">The merge gate</Link>: the checks an exemption can and cannot
          cover.
        </li>
      </ul>
    </DocsPage>
  );
}
