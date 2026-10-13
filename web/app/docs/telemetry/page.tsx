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
      intro="A review that runs on every pull request and is ignored on most of them costs time and catches nothing, and from inside one pull request it looks exactly like a review that works. Redline measures what was acted on, not what was flagged, so a rule nobody acts on shows up by name."
      href="/docs/telemetry"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          This pipeline is GitHub-only today. The CLI onboards and verifies repositories on either
          host; wiring telemetry to Azure DevOps is later-phase work.
        </p>
      </div>

      <h2>What is measured</h2>
      <h3 id="acted-on">Acted-on rate</h3>
      <p>
        Of the findings review raised on merged pull requests, the share someone acted on: a
        resolved review thread, against one left stale and outdated. It is counted per severity
        and per rule id, so &ldquo;42% of findings are ignored&rdquo; becomes a named list of the
        rules responsible. A rule people keep ignoring is either wrong or badly explained, and it
        is the first thing to fix before blocking on anything. The{" "}
        <Link href="/docs/enforcement">enforcement ladder</Link> asks for 60% to reach{" "}
        <code>block-blocker</code> and 80% for <code>block-high</code>.
      </p>
      <h3 id="noise">Noise</h3>
      <p>
        False positives on the clean corpus, <b>untagged</b> findings (a comment that ignored the{" "}
        <Link href="/docs/output-contract">output contract</Link> and so cannot be attributed to a
        rule), and exemption usage.
      </p>
      <h3>Recall</h3>
      <p>
        Seeded BLOCKERs found, per stack, with history per pilot repository. See{" "}
        <Link href="#seeded-corpus">the seeded corpus</Link> below.
      </p>
      <p>
        Deliberately <b>not</b> measured: per-author quality. Findings left on a developer&apos;s
        machine by <Link href="/docs/local-review">local review</Link> are excluded too: nobody can
        tell a fixed one from an unread one.
      </p>

      <h2>Where it surfaces</h2>
      <ul>
        <li>
          <b>Monday Teams digest</b>: an Adaptive Card with the acted-on rate, the noisiest-rules
          tuning queue and the worst pilot seed score.
        </li>
        <li>
          <b>Org inbox</b>: a prioritised pull request inbox on GitHub Pages, refusing to build
          unless Pages visibility is acknowledged.
        </li>
        <li>
          <b>Dashboard</b>: static, dependency-free: trends, seed-recall history, the full tables.
        </li>
      </ul>

      <h2>Reading the dashboard</h2>
      <p>
        These run as scheduled workflows, never in a product repository: <code>registry</code>{" "}
        nightly in the Redline source repository, <code>metrics collect</code> and{" "}
        <code>metrics dashboard</code> in your <code>redline-metrics</code> repository. The CLI
        exists so a scheduled run that looks wrong can be reproduced in a terminal. Each needs a
        token with org read access in <code>GH_TOKEN</code>:
      </p>
      <Terminal
        commands={`# from a built checkout of the Redline source repository
node dist/bin/redline.js registry --org acme --source acme/redline
node dist/bin/redline.js metrics collect --org acme --days 30
node dist/bin/redline.js metrics dashboard --org acme --data data --out dist`}
      />
      <p>
        <code>registry</code> derives who is onboarded, <code>collect</code> pulls review outcomes
        with a read-only token, and <code>dashboard</code> builds a static page. The hero number is{" "}
        <b>findings acted on</b>. These are the tiles beside it, and what each one means when it is
        not healthy:
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
                Low means review is running and being ignored. That is the failure this whole plane
                exists to make visible, and it is a rule problem before it is a people problem.
              </td>
            </tr>
            <tr>
              <td>
                <b>PRs with findings</b>
              </td>
              <td>some, not all</td>
              <td>
                Near 0% and the reviewer is not running, or the rules reach nothing this estate
                writes. Near 100% and it is flagging everything, which is the same as flagging
                nothing.
              </td>
            </tr>
            <tr>
              <td>
                <b>Ignored</b>
              </td>
              <td>falling</td>
              <td>
                Findings left stale and outdated. Read it with the tuning queue: one noisy rule
                usually explains most of it.
              </td>
            </tr>
            <tr>
              <td>
                <b>Gate exemptions</b>
              </td>
              <td>rare</td>
              <td>
                A rising share of pull requests carrying the label means the gate asks for something
                people cannot reasonably give. <Link href="/docs/exemptions">Exemptions</Link> reach
                the process checks only, so this never covers a security check.
              </td>
            </tr>
            <tr>
              <td>
                <b>Seed BLOCKER recall</b>
              </td>
              <td>100%</td>
              <td>
                Anything less and the reviewer has silently stopped catching known defects. The
                dashboard raises a warning and says not to widen the rollout.
              </td>
            </tr>
            <tr>
              <td>
                <b>Enforcing</b>
              </td>
              <td>growing slowly</td>
              <td>
                How much of the estate is on a blocking{" "}
                <Link href="/docs/enforcement">rung</Link>. Flat at zero forever means the evidence
                to promote has never been produced.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The page also carries the <b>rule tuning queue</b>: rules that fire often and are rarely
        acted on, named individually. That list is the product. Cut, narrow or downgrade what is on
        it before adding new rules.
      </p>

      <h2>Absent, not zero</h2>
      <p>
        A dashboard built in week one is empty, and that is a sample size rather than a failure.
        Nothing here reports a number it could not compute: a missing figure says why instead of
        defaulting to zero, because a plane that fills gaps with zeros reports a stalled collector
        as a quiet week. The same holds for the <b>Enforcing</b> tile: when the register cannot be
        read the figure is absent, because zero blocking repositories and an unreadable register
        call for different people to act.
      </p>

      <h2 id="seeded-corpus">The seeded corpus</h2>
      <p>
        Acted-on rate shows whether people agree with the findings; it cannot show what the
        reviewer missed. The <Link href="/docs/seeds">seeded corpus</Link> can: code with known
        defects planted in it, beside correct code that must draw no finding. It is opened as a
        throwaway pull request on a pilot repository, reviewed, and scored:
      </p>
      <Terminal
        commands="node dist/bin/redline.js metrics score-seeds --repo acme/pilot --pr 4"
        output={SCORE_OUTPUT}
      />
      <p>
        Three numbers, because a review system fails in three ways: <b>recall</b> (seeded defects
        flagged at the expected severity), <b>precision</b> (comments on{" "}
        <code>seeded/clean/**</code>, which should never happen) and <b>attribution</b> (findings
        that cited the correct rule id). <code>--json</code> prints the full report, with these
        under <code>totals</code> (<code>totals.blocker_recall</code>,{" "}
        <code>totals.false_positives_on_clean</code>); <code>--history &lt;file&gt;.jsonl</code>{" "}
        appends each run, so recall has a trend rather than a single reading. The scorer reads the
        severity prefix, not the vendor, so comparing two reviewers on identical input is one run
        per candidate. Scored BLOCKER recall and false positives are the evidence a rung promotion
        asks for.
      </p>
      <p>
        <code>workflows/seed-canary.yml</code> repeats this weekly against a canary repository and
        fails on any drop in BLOCKER recall or any false positive. Nothing else detects a reviewer
        that quietly stopped working: a repository with no findings looks identical to one with no
        defects, and a model upgrade can move you from one to the other without anyone touching a
        rule.
      </p>

      <h2 id="ingestion">Findings from other scanners</h2>
      <p>
        Redline is not the only thing producing findings: CodeQL, Snyk, Semgrep and whatever else
        an organisation licenses each have their own severity words, their own dashboard and their
        own answer to &ldquo;did anyone act on this&rdquo;, so nobody sees the estate. The
        collector also reads the code-scanning alerts those tools upload, so LLM review and static
        analysis share <b>one severity contract and one acted-on measure</b>.{" "}
        <b>Redline never runs a scanner</b>, and no repository is asked to change which ones it
        runs. <code>metrics collect --skip-sarif</code> leaves them out.
      </p>
      <ul>
        <li>
          <b>Always distinguishable.</b> Rule tuning reads the finding stream, so a view that could
          not tell a CodeQL finding from a Redline one would tune Redline&apos;s rules on another
          tool&apos;s noise. Every ingested finding carries its source and tool, keeps the
          producer&apos;s own rule id (never rewritten into a Redline id), and aggregates in its own
          bucket. Acted-on rate is computed within each source, never across: a resolved thread and
          a closed alert are different definitions.
        </li>
        <li>
          <b>Measured, never gating.</b> An ingested finding does not block a merge at any rung.
          Gating on another tool&apos;s output makes Redline responsible for its false positives,
          and the bundle self-check fails the build if the gate ever starts reading code scanning.
        </li>
        <li>
          <b>Severity mapping is configurable and visible.</b> The default table below is
          overridable per repository, and every finding keeps both the mapped severity and the
          producer&apos;s own word.
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
        An unrecognised word falls back to <code>SUGGESTION</code>, never <code>BLOCKER</code>:
        a wrong BLOCKER blocks a merge and teaches people the gate is noise; a wrong SUGGESTION is
        a line in a report. The dashboard&apos;s <b>Finding sources</b> view shows the catalogues
        side by side without merging them.
      </p>

      <h2 id="cost">Cost and value</h2>
      <p>
        Proving review catches defects is half the case; the other half is what it cost. A
        cost-management tool knows spend and has no findings; a DORA tool has neither. Redline
        knows which findings were acted on, so it can put the two side by side: cost per BLOCKER
        caught. Value is what was <b>acted on</b>, not what was reported, because counting ignored
        findings would let the return be inflated by producing more noise.
      </p>
      <Terminal
        commands={`# from a built checkout of the Redline source repository
node dist/bin/redline.js metrics roi --data data --days 90 --spend-total 850 --spend-grain org`}
      />
      <p>
        It writes <code>roi.html</code>, one page a finance stakeholder can read, and{" "}
        <code>roi.json</code>. The spend figure is yours to supply from the assistant
        vendor&apos;s own usage reporting: nothing reads a billing API, and nothing is estimated.{" "}
        <code>--spend-grain</code> records whether it is per repository or org-wide, and{" "}
        <code>--spend-source</code> where it came from. Lead time and change failure rate come
        from the merged pull requests the collector already walks; nothing new is instrumented in a
        product repository.
      </p>
      <p>Every figure here will be quoted at someone who acts on it, so each one that cannot be sourced says so:</p>
      <ul>
        <li>
          <b>An org-level spend figure will not answer a per-repository question.</b> Org spend
          divided by repository count looks precise and is invented.
        </li>
        <li>
          <b>Deployment frequency is unknown, not zero</b>, where a repository does not use the
          deployments API. Assuming one deploy per merge reports a trunk-based team and a
          quarterly-release team as identical.
        </li>
        <li>
          <b>MTTR is refused by name</b>, so nobody wonders whether it was forgotten. It needs an
          incident feed Redline does not have.
        </li>
        <li>
          <b>Change failure rate travels with its caveat.</b> It is a floor, not the true rate: a
          revert or hotfix is evidence of a failed change rather than proof, and a team that fixes
          forward without saying &ldquo;hotfix&rdquo; scores better than one that labels honestly.
        </li>
      </ul>
    </DocsPage>
  );
}
