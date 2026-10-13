import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Telemetry & value" };

// cli/sarif/map.ts DEFAULT_SEVERITY_MAP, grouped by the severity it maps to.
const SEVERITY_MAP = [
  ["error, critical, high", "BLOCKER"],
  ["warning, medium, moderate", "HIGH"],
  ["note, none, low, info, informational", "SUGGESTION"],
  ["anything unrecognised", "SUGGESTION, and reported"],
];

// The summary scripts/score-seeds.mjs prints without --json, first lines only.
const SCORE_OUTPUT = `  BLOCKER recall     <caught>/<seeded>  (<n>%)
  overall recall     <caught>/<seeded>  (<n>%)
  rule attribution   <n>% of caught seeds cited the right rule
  comments posted    <n> (<n> carried a rule id)
  false positives    <n> on seeded/clean/**
  …`;

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Telemetry & value"
      intro="A review that runs on every pull request and is ignored on most of them costs time and catches nothing. From inside one pull request, it looks exactly like a review that works. Redline measures what people act on, not what was flagged, so a rule nobody acts on shows up by name."
      href="/docs/telemetry"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Telemetry is GitHub-only today. The CLI onboards and verifies repositories on both GitHub
          and Azure DevOps, but the metrics pipeline reads GitHub only.
        </p>
      </div>

      <h2>The measures at a glance</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Measure</th>
              <th>The question it answers</th>
              <th>Measured from</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <a href="#acted-on">Acted-on rate</a>
              </td>
              <td>Do people agree with the findings?</td>
              <td>review threads on merged pull requests</td>
            </tr>
            <tr>
              <td>
                <a href="#noise">Noise</a>
              </td>
              <td>How much of the review is ignored or unmeasurable?</td>
              <td>the same threads, plus the clean corpus</td>
            </tr>
            <tr>
              <td>
                <a href="#seeded-corpus">Recall</a>
              </td>
              <td>Does the reviewer catch defects we know are there?</td>
              <td>the seeded corpus</td>
            </tr>
            <tr>
              <td>
                <a href="#cost">Cost per BLOCKER</a>
              </td>
              <td>What did each caught defect cost?</td>
              <td>spend you supply, and the acted-on BLOCKERs</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Deliberately <b>not</b> measured: anything per author. Findings from{" "}
        <Link href="/docs/local-review">local review</Link> are left out too, because nobody can
        tell a fixed one from an unread one.
      </p>

      <h2>What is measured</h2>
      <h3 id="acted-on">Acted-on rate</h3>
      <p>
        Every automated finding is posted as a review thread on the pull request. Once the pull
        request merges, each thread is in one of three states:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Thread state</th>
              <th>Counted as</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>resolved</td>
              <td>
                <b>acted on</b>
              </td>
            </tr>
            <tr>
              <td>unresolved, and the code around it has since changed (outdated)</td>
              <td>
                <b>ignored</b>: the author changed the code and nobody closed the thread
              </td>
            </tr>
            <tr>
              <td>unresolved, code unchanged</td>
              <td>neither</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The <b>acted-on rate</b> is resolved threads divided by all findings. It is counted per
        severity and per rule id, so &ldquo;42% of findings are ignored&rdquo; becomes a list of the
        rules responsible.
      </p>
      <p>
        A rule people keep ignoring is either wrong or badly explained. Fix it before blocking on
        anything: the <Link href="/docs/enforcement">enforcement ladder</Link> asks for a 60%
        acted-on rate to reach <code>block-blocker</code> and 80% for <code>block-high</code>.
      </p>

      <h3 id="noise">Noise</h3>
      <p>Three signals that review is producing output nobody can use:</p>
      <ul>
        <li>
          <b>Ignored findings</b>, as defined above.
        </li>
        <li>
          <b>Untagged findings</b>: comments that skipped the{" "}
          <Link href="/docs/output-contract">output contract</Link>, so they cannot be attributed to
          a rule.
        </li>
        <li>
          <b>False positives</b>: findings on code in the seeded corpus that is known to be correct.
        </li>
      </ul>

      <h3>Recall</h3>
      <p>
        The share of defects planted in the seeded corpus that the reviewer found, with history per
        pilot repository. See <a href="#seeded-corpus">the seeded corpus</a> below.
      </p>

      <h2>Where it runs</h2>
      <p>
        Nothing runs in a product repository. Every job is a scheduled workflow in one of two
        estate repositories. The jobs that read the organisation need a token with organisation
        read access:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Schedule</th>
              <th>Runs in</th>
              <th>Produces</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Registry</td>
              <td>nightly</td>
              <td>Redline source repository</td>
              <td>
                <code>registry.json</code>, the list of onboarded repositories
              </td>
            </tr>
            <tr>
              <td>Collect</td>
              <td>daily</td>
              <td>
                <code>redline-metrics</code>
              </td>
              <td>review outcomes for merged pull requests, as monthly JSONL</td>
            </tr>
            <tr>
              <td>Dashboard</td>
              <td>daily</td>
              <td>
                <code>redline-metrics</code>
              </td>
              <td>a static page on GitHub Pages: tiles, trends, the full tables</td>
            </tr>
            <tr>
              <td>Weekly digest</td>
              <td>Monday morning</td>
              <td>
                <code>redline-metrics</code>
              </td>
              <td>
                a Teams card: acted-on rate, the noisiest rules, the worst pilot seed score
              </td>
            </tr>
            <tr>
              <td>Inbox</td>
              <td>every 30 minutes, weekday working hours</td>
              <td>Redline source repository</td>
              <td>a prioritised pull request inbox for the organisation, on GitHub Pages</td>
            </tr>
            <tr>
              <td>Seed canary</td>
              <td>weekly</td>
              <td>
                <code>redline-metrics</code>
              </td>
              <td>a recall and false-positive score; see below</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The dashboard and inbox refuse to build until someone confirms the Pages site is private or
        internal: both list repository names, and the inbox lists pull request titles and authors.
      </p>
      <p>
        To reproduce a scheduled run that looks wrong, run the same commands from a built checkout,
        with the token in <code>GH_TOKEN</code>:
      </p>
      <Terminal
        commands={`# from a built checkout of the Redline source repository
node dist/bin/redline.js registry --org acme --source acme/redline
# from the redline-metrics repository, with the CLI built
node dist/bin/redline.js metrics collect --org acme --days 30
node dist/bin/redline.js metrics dashboard --org acme --data data --out dist`}
      />

      <h2>Reading the dashboard</h2>
      <p>
        The headline figure is <b>findings acted on</b>. The tiles around it, and what each means
        when it is not healthy:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Tile</th>
              <th>Healthy</th>
              <th>What it means when it is not</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Findings acted on</b>
              </td>
              <td>rising, then steady</td>
              <td>
                Low means review runs and is ignored: the failure this whole pipeline exists to
                expose. It is a rule problem before it is a people problem.
              </td>
            </tr>
            <tr>
              <td>
                <b>PRs with findings</b>
              </td>
              <td>some, not all</td>
              <td>
                Near 0% means the reviewer is not running, or the rules reach nothing this
                organisation writes. Near 100% means it flags everything, which is the same as
                flagging nothing.
              </td>
            </tr>
            <tr>
              <td>
                <b>Ignored</b>
              </td>
              <td>falling</td>
              <td>
                Findings left unresolved on code that has since changed. Read it with the tuning
                queue: one noisy rule usually explains most of it.
              </td>
            </tr>
            <tr>
              <td>
                <b>Gate exemptions</b>
              </td>
              <td>rare</td>
              <td>
                The share of pull requests labelled <code>redline-exempt</code> or{" "}
                <code>no-adr</code>. Rising means the gate asks for something people cannot
                reasonably give. <Link href="/docs/exemptions">Exemptions</Link> reach process
                checks only, so this never covers a security check.
              </td>
            </tr>
            <tr>
              <td>
                <b>Seed BLOCKER recall</b>
              </td>
              <td>100%</td>
              <td>
                The worst pilot repository&apos;s latest score. Anything less means the reviewer has
                stopped catching known defects; the dashboard warns not to widen the rollout.
              </td>
            </tr>
            <tr>
              <td>
                <b>Enforcing</b>
              </td>
              <td>growing slowly</td>
              <td>
                The share of onboarded repositories on a blocking{" "}
                <Link href="/docs/enforcement">rung</Link>. Flat at zero forever means nobody has
                produced the evidence to promote.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Below the tiles is the <b>rule tuning queue</b>: rules that fired at least three times in
        the window and were ignored at least a quarter of the time, named individually. That list
        is the most useful output of the whole pipeline. Cut, narrow or downgrade what is on it
        before adding new rules.
      </p>

      <h2>Absent, not zero</h2>
      <p>
        When a figure cannot be computed, the dashboard shows it as missing and says why. It never
        shows zero instead.
      </p>
      <p>
        The difference matters. If the collector stops running, a dashboard that filled the gap
        with zeros would report a quiet week, and nobody would fix the collector. The same holds for
        the <b>Enforcing</b> tile: an unreadable register shows <code>—</code> with &ldquo;not zero,
        unknown&rdquo;, because &ldquo;no repository blocks&rdquo; and &ldquo;we cannot read the
        register&rdquo; need different people to act.
      </p>
      <p>
        A dashboard built in week one is mostly empty. That is a small sample, not a failure.
      </p>

      <h2 id="seeded-corpus">The seeded corpus</h2>
      <p>
        The acted-on rate shows whether people agree with the findings. It cannot show what the
        reviewer missed. The <Link href="/docs/seeds">seeded corpus</Link> can: code with known
        defects planted in it, beside correct code that must draw no finding. It is opened as a
        throwaway pull request on a pilot repository, reviewed, and scored:
      </p>
      <Terminal
        commands="node dist/bin/redline.js metrics score-seeds --repo acme/pilot --pr 4"
        output={SCORE_OUTPUT}
      />
      <p>A review system fails in three ways, so the score has three numbers:</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>What it counts</th>
              <th>The failure it catches</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Recall</b>
              </td>
              <td>planted defects flagged at the expected severity or higher</td>
              <td>missing real problems</td>
            </tr>
            <tr>
              <td>
                <b>False positives</b>
              </td>
              <td>
                comments on <code>seeded/clean/**</code>
              </td>
              <td>flagging correct code</td>
            </tr>
            <tr>
              <td>
                <b>Attribution</b>
              </td>
              <td>caught defects that cited the correct rule id</td>
              <td>right problem, wrong rule, so the per-rule numbers are wrong</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        BLOCKER recall and false positives are the evidence a rung promotion asks for.{" "}
        <code>--json</code> prints the full report, with the totals under <code>totals</code> (
        <code>totals.blocker_recall</code>, <code>totals.false_positives_on_clean</code>).{" "}
        <code>--history &lt;file&gt;.jsonl</code> appends each run, so recall has a trend. The
        scorer reads the severity prefix, not the vendor, so comparing two reviewers on the same
        code is one run per reviewer.
      </p>
      <p>
        The <b>seed canary</b> repeats this weekly against a canary repository. It fails when
        BLOCKER recall is below 100% or any false positive appears. Nothing else catches a reviewer
        that quietly stopped working: a repository with no findings looks identical to one with no
        defects, and a model upgrade can move you from one to the other without anyone changing a
        rule.
      </p>

      <h2 id="ingestion">Findings from other scanners</h2>
      <p>
        CodeQL, Snyk, Semgrep and similar tools each have their own severity words and their own
        dashboard, so nobody sees the whole picture. The collector also reads the open
        code-scanning alerts those tools upload to GitHub, and shows them beside Redline&apos;s
        findings in one severity vocabulary.
      </p>
      <p>
        <b>Redline never runs a scanner</b>, and no repository is asked to change which ones it
        runs. <code>metrics collect --skip-sarif</code> leaves them out.
      </p>
      <ul>
        <li>
          <b>Always kept apart.</b> Rule tuning reads Redline&apos;s findings only. Mixing in another
          tool&apos;s output would tune Redline&apos;s rules on that tool&apos;s noise. Each ingested
          finding keeps its tool name and the tool&apos;s own rule id, and the dashboard&apos;s{" "}
          <b>Finding sources</b> table lists each tool on its own row.
        </li>
        <li>
          <b>Measured, never gating.</b> An ingested finding never blocks a merge, at any rung.
          Gating on another tool&apos;s output would make Redline responsible for its false
          positives. <code>scripts/validate.mjs</code> fails the build if the gate workflow ever
          reads code scanning.
        </li>
        <li>
          <b>Severity is mapped, and the original kept.</b> Each finding records both the mapped
          severity and the tool&apos;s own word, using this table:
        </li>
      </ul>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Their word</th>
              <th>Redline severity</th>
            </tr>
          </thead>
          <tbody>
            {SEVERITY_MAP.map(([theirs, ours]) => (
              <tr key={theirs}>
                <td>{theirs}</td>
                <td>
                  <code>{ours}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        An unrecognised word becomes <code>SUGGESTION</code>, never <code>BLOCKER</code>. A wrong
        BLOCKER teaches people the numbers are noise; a wrong SUGGESTION is one line in a report.
      </p>

      <h2 id="cost">Cost and value</h2>
      <p>
        Showing that review catches defects is half the case. The other half is what it cost. A
        cost-management tool knows spend but has no findings. Redline knows which findings were
        acted on, so it can put the two side by side: <b>cost per BLOCKER caught</b>, which is
        spend divided by BLOCKER findings acted on.
      </p>
      <p>
        Value counts what was acted on, not what was reported. Counting ignored findings would let
        the return be inflated by producing more noise.
      </p>
      <Terminal
        commands={`# from the redline-metrics repository, with the CLI built
node dist/bin/redline.js metrics roi --data data --days 90 --spend-total 850 --spend-grain org --spend-source "vendor usage report, Q3"`}
      />
      <p>
        It writes <code>roi.html</code>, a page a finance stakeholder can read, and{" "}
        <code>roi.json</code>. You supply the spend from the assistant vendor&apos;s own usage
        reporting: nothing reads a billing API, and nothing is estimated.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Flag</th>
              <th>Meaning</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>--spend-total</code>
              </td>
              <td>AI spend for the window</td>
              <td>none</td>
            </tr>
            <tr>
              <td>
                <code>--spend-grain</code>
              </td>
              <td>whether the figure is per repository or organisation-wide</td>
              <td>
                <code>org</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>--spend-source</code>
              </td>
              <td>where the figure came from, recorded with it</td>
              <td>none</td>
            </tr>
            <tr>
              <td>
                <code>--spend-currency</code>
              </td>
              <td>currency of the total</td>
              <td>
                <code>USD</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The page also reports delivery figures from the merged pull requests the collector already
        reads; nothing new is added to a product repository. Each figure that cannot be sourced
        says so:
      </p>
      <ul>
        <li>
          <b>An org-wide spend figure does not answer a per-repository question.</b> Org spend
          divided by repository count looks precise and is invented.
        </li>
        <li>
          <b>Deployment frequency is &ldquo;unknown, not zero&rdquo;</b> where a repository does not
          use GitHub&apos;s deployments API. Assuming one deploy per merge would report a
          trunk-based team and a quarterly-release team as identical.
        </li>
        <li>
          <b>Mean time to restore is always shown as missing</b>, with the reason: it needs an
          incident feed Redline does not have.
        </li>
        <li>
          <b>Change failure rate carries a caveat.</b> It is a lower bound: a revert or hotfix is
          evidence of a failed change, not proof, and a team that fixes forward without saying
          &ldquo;hotfix&rdquo; scores better than one that labels honestly.
        </li>
      </ul>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/cli/metrics">
            <code>redline metrics</code>
          </Link>
          : every subcommand and flag.
        </li>
        <li>
          <Link href="/docs/seeds">Seeded corpus</Link>: the planted defects and the clean files.
        </li>
        <li>
          <Link href="/docs/who-runs-what">Who runs what</Link>: which repository each job lives in.
        </li>
      </ul>
    </DocsPage>
  );
}
