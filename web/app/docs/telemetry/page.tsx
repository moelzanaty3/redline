import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Telemetry & validation" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Telemetry & validation"
      intro="Redline measures what was acted on, not what was flagged — and regression-tests the reviewer itself. A rule nobody acts on is noise, and noise is visible."
      href="/docs/telemetry"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          This pipeline is GitHub-only today, carried over unchanged from the
          workflow-bundle era. The CLI onboards and verifies repos on either
          host; wiring telemetry to Azure DevOps is later-phase work.
        </p>
      </div>
      <h2>What is measured</h2>
      <ul>
        <li><b>Acted-on rate</b> — resolved review threads versus findings left stale and outdated, per severity and per rule id.</li>
        <li><b>Noise</b> — false positives on the clean corpus, untagged findings that ignored the contract, exemption usage.</li>
        <li><b>Recall</b> — seeded BLOCKERs found, per stack, with history per pilot repo.</li>
      </ul>
      <p>
        Records carry <code>rules: {"{<id>: {fired, resolved, stale}}"}</code> —
        turning “42% of findings are ignored” into a named list of the rules
        responsible. Deliberately <b>not</b> measured: per-author quality.
      </p>

      <h2>Where it surfaces</h2>
      <ul>
        <li><b>Monday Teams digest</b> — an Adaptive Card with the acted-on rate, the noisiest-rules tuning queue and the worst pilot seed score.</li>
        <li><b>Org inbox</b> — a prioritised PR inbox on GitHub Pages, refusing to build unless Pages visibility is acknowledged.</li>
        <li><b>Dashboard</b> — static, dependency-free: trends, seed-recall history, the full tables.</li>
      </ul>

      <h2>Reading the dashboard</h2>
      <p>
        In production these are scheduled workflows, not things anyone types —
        the CLI exists so a scheduled run is reproducible in a terminal when it
        looks wrong. <code>registry</code> derives who is onboarded,{" "}
        <code>collect</code> pulls review outcomes with a read-only token, and{" "}
        <code>dashboard</code> builds a static page.
      </p>
      <CodeWindow
        title="terminal"
        copyText={[
          "redline registry --org acme --source acme/redline",
          "redline metrics collect --org acme --days 30",
          "redline metrics dashboard --org acme --data data --out dist",
        ].join("\n")}
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">redline registry --org acme --source acme/redline</span>
        {"\n"}
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">redline metrics collect --org acme --days 30</span>
        {"\n"}
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">redline metrics dashboard --org acme --data data --out dist</span>
      </CodeWindow>
      <p>
        The hero number is <b>findings acted on</b>. These are the tiles beside
        it, and what each one means when it is not healthy:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Tile</th><th>Healthy</th><th>What it means when it is not</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Findings acted on</b></td>
              <td>rising, then steady</td>
              <td>Low means review is running and being ignored. That is the failure this whole plane exists to make visible, and it is a rule problem before it is a people problem.</td>
            </tr>
            <tr>
              <td><b>PRs with findings</b></td>
              <td>some, not all</td>
              <td>Near 0% and the reviewer is not running, or the rules reach nothing this estate writes. Near 100% and it is flagging everything, which is the same as flagging nothing.</td>
            </tr>
            <tr>
              <td><b>Ignored</b></td>
              <td>falling</td>
              <td>Findings left stale and outdated. Read it with the tuning queue — one noisy rule usually explains most of it.</td>
            </tr>
            <tr>
              <td><b>Gate exemptions</b></td>
              <td>rare</td>
              <td>A rising share of pull requests carrying the label means the gate asks for something people cannot reasonably give. <Link href="/docs/exemptions">Exemptions</Link> reach the process checks only, so this never covers a security check.</td>
            </tr>
            <tr>
              <td><b>Seed BLOCKER recall</b></td>
              <td>100%</td>
              <td>Anything less and the reviewer has silently stopped catching known defects. The dashboard raises a warning and says not to widen the rollout.</td>
            </tr>
            <tr>
              <td><b>Enforcing</b></td>
              <td>growing slowly</td>
              <td>How much of the estate is on a blocking <Link href="/docs/enforcement">rung</Link>. Flat at zero forever means the evidence to promote has never been produced.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The page also carries the <b>rule tuning queue</b>: rules that fire often
        and are rarely acted on, named individually. That list is the product.
        Cut, narrow or downgrade what is on it before adding new rules.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          A dashboard built in week one is empty, and that is a sample size
          rather than a failure. Nothing here reports a number it could not
          compute: a missing figure says why instead of defaulting to zero,
          because a plane that fills gaps with zeros reports a stalled collector
          as a quiet week.
        </p>
      </div>

      <h2>The seeded corpus</h2>
      <p>
        <code>seeded/</code> holds 117 BLOCKER and 52 HIGH seeds across all 16
        stacks, each marker citing the rule it violates — plus{" "}
        <code>seeded/clean/</code>, correct code that must produce{" "}
        <b>zero</b> findings. Recall alone is not enough: a reviewer that flags
        everything scores perfect recall.
      </p>
      <CodeWindow
        title="terminal — score a seeded PR"
        copyText="GH_TOKEN=... npx redlinegate metrics score-seeds --repo <org>/<repo> --pr <n> --json"
      >
        <span className="tk-prompt">$</span> <span className="tk-white">GH_TOKEN=... npx redlinegate metrics score-seeds --repo acme/pilot --pr 4 --json</span>{"\n"}
        <span className="tk-green">blocker_recall</span>: 1.0   <span className="tk-green">false_positives_on_clean</span>: 0   <span className="tk-dim">untagged: 0</span>
      </CodeWindow>
      <p>
        Three numbers, because a review system fails in three ways:{" "}
        <b>recall</b> (seeded defects flagged at the expected severity),{" "}
        <b>precision</b> (comments on <code>seeded/clean/**</code>, which should
        never happen) and <b>attribution</b> (findings that cited the correct
        rule id). <code>--history &lt;file&gt;.jsonl</code> appends each run, so
        recall has a trend rather than a single reading.
      </p>
      <p>
        The scorer is vendor-neutral — it reads the severity prefix and a bot
        list, not the vendor. Comparing Copilot against Claude on identical
        input is one command per candidate.
      </p>

      <h2>The reviewer is regression-tested</h2>
      <p>
        <code>workflows/seed-canary.yml</code> opens a PR of known-bad code
        against a canary repo weekly, scores the review, and fails on any drop
        in BLOCKER recall or any false positive. Nothing else detects a
        reviewer that quietly stopped working — a repo with no findings looks
        identical to a repo with no defects, and a model upgrade can move you
        from one to the other without anyone touching a rule.
      </p>
    </DocsPage>
  );
}
