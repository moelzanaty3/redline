import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "What success looks like" };

export default async function Page() {
  const state = await packageState();
  const status = installCommand(state, "status");
  const verify = installCommand(state, "verify");
  const explain = installCommand(state, "explain core/query-string-concatenation");

  return (
    <DocsPage
      crumb="Getting Started"
      title="What success looks like"
      intro="You onboarded a repository. Now what should you actually see, when, and which command shows it to you? Five checkpoints, each with the command that proves it and the failure that looks identical from the outside."
      href="/docs/success"
    >
      <p>
        Redline&apos;s hardest failure mode is not breaking. It is running,
        looking green, and doing nothing — a gate nobody required, a reviewer
        that stopped finding things, a rule everyone ignores. Every checkpoint
        below is paired with the way it fails <i>quietly</i>, because that is the
        one you have to go and look for.
      </p>

      <h2>Checkpoint 1 — the repository can describe itself</h2>
      <p>
        <b>When:</b> the moment the onboarding pull request merges.{" "}
        <b>Who:</b> you, in the repository.
      </p>
      <CodeWindow title="terminal" copyText={status}>
        <span className="tk-prompt">$</span> <span className="tk-white">{status}</span>
      </CodeWindow>
      <p>
        This contacts no host and needs no credential — it reads the checkout.
        Success is that it names your profile, the rung the gate sits at, and the
        standards version the artifacts were rendered from, and that{" "}
        <code>pendingAdmin</code> is empty. Anything listed there is a capability
        that needed repository-admin rights you did not have, and it is waiting
        on a person, not on time. <code>--json</code> gives the same thing to a
        script.
      </p>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>The quiet failure:</b> a non-empty <code>pendingAdmin</code> that
          nobody reads. The repository looks onboarded, the files are all there,
          and the merge policy was never applied. Re-run with{" "}
          <code>--repair</code> once an administrator has granted the rights —
          a plain re-run cannot clear those entries on its own.
        </p>
      </div>

      <h2>Checkpoint 2 — the gate reports, under the name something requires</h2>
      <p>
        <b>When:</b> the first pull request after onboarding.
      </p>
      <CodeWindow title="terminal" copyText={verify}>
        <span className="tk-prompt">$</span> <span className="tk-white">{verify}</span>
      </CodeWindow>
      <p>
        <code>status</code> reads your checkout; <code>verify</code> reads the
        host. It takes what the host currently has required and compares it to
        what actually reported on the latest pull request. The name is{" "}
        <code>redline-gate / gate</code> — a reusable workflow reports as{" "}
        <code>&lt;caller job id&gt; / &lt;called job id&gt;</code>, and both ids
        are pinned in <code>scripts/validate.mjs</code> so CI fails if either is
        renamed.
      </p>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>The quiet failure:</b> a required check whose name nothing ever
          reports. Every pull request sits on &ldquo;Expected — waiting for
          status&rdquo; forever, and it reads as a slow CI rather than a broken
          gate. On the default advisory install nothing is required yet, so{" "}
          <code>verify</code> can only surface the reported name for you to
          eyeball; on a <code>--blocking</code> install it is a real assertion
          and fails.
        </p>
      </div>

      <h2>Checkpoint 3 — findings arrive, and carry ids you can act on</h2>
      <p>
        <b>When:</b> the first pull request that touches code a stack covers.
      </p>
      <p>
        Success is a review comment in the{" "}
        <Link href="/docs/output-contract">output contract</Link> — a severity, a
        rule id in brackets, one line on what breaks and one on the fix. The id
        is the part that matters: it is what makes the finding measurable, and it
        is what turns the comment back into an editable rule.
      </p>
      <CodeWindow title="terminal" copyText={explain}>
        <span className="tk-prompt">$</span> <span className="tk-white">{explain}</span>
      </CodeWindow>
      <p>
        That prints the rule, who decided it, the file and line in{" "}
        <code>standards/</code> where it is defined, and every profile that
        receives it. If you disagree with a finding, that line number is where
        the disagreement gets settled.
      </p>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>The quiet failure:</b> findings with no id, or an id{" "}
          <code>redline explain --list</code> does not know. Those were invented
          by the model, and every aggregate keyed on them is fiction — they are
          counted as untagged rather than silently accepted. A steady stream of{" "}
          <code>core/uncatalogued</code> is different: that is the signal a real
          rule is missing, and it is working as designed.
        </p>
      </div>

      <h2>Checkpoint 4 — the estate answers whether any of it is being used</h2>
      <p>
        <b>When:</b> after a few weeks of merged pull requests.{" "}
        <b>Who:</b> the platform team, not a repository owner — these commands
        act on an organisation and are meaningless in a product repo. See{" "}
        <Link href="/docs/who-runs-what">Who runs what</Link>.
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
        In production these are scheduled workflows, not things you type — the
        CLI exists so a scheduled run is reproducible in a terminal when it looks
        wrong. <code>registry</code> derives who is onboarded,{" "}
        <code>collect</code> pulls review outcomes with a read-only token, and{" "}
        <code>dashboard</code> builds a static page. The hero number is{" "}
        <b>findings acted on</b>, and these are the tiles beside it:
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
              <td>Low means review is running and being ignored. That is the failure the whole measurement plane exists to make visible, and it is a rule problem before it is a people problem.</td>
            </tr>
            <tr>
              <td><b>PRs with findings</b></td>
              <td>some, not all</td>
              <td>Near 0% and the reviewer is not running, or the rules reach nothing this estate writes. Near 100% and it is flagging everything, which is the same as flagging nothing.</td>
            </tr>
            <tr>
              <td><b>Ignored</b></td>
              <td>falling</td>
              <td>Findings left stale and outdated. Read it with the tuning queue below — one noisy rule usually explains most of it.</td>
            </tr>
            <tr>
              <td><b>Gate exemptions</b></td>
              <td>rare</td>
              <td>A rising share of pull requests using a soft-fail label means the gate asks for something people cannot reasonably give. Security checks are never exemptible, so this only ever covers the checklist and ADR requirements.</td>
            </tr>
            <tr>
              <td><b>Seed BLOCKER recall</b></td>
              <td>100%</td>
              <td>Anything less and the reviewer has silently stopped catching known defects. The dashboard raises a warning and says not to widen the rollout.</td>
            </tr>
            <tr>
              <td><b>Enforcing</b></td>
              <td>growing slowly</td>
              <td>How much of the estate is on a blocking rung. Flat at zero forever means the evidence to promote has never been produced — see checkpoint 5.</td>
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
          A dashboard built on week one is empty, and that is not a failure — it
          is a sample size. Nothing here reports a number it could not compute:
          a figure that is missing says why instead of defaulting to zero,
          because a measurement plane that fills gaps with zeros reports a
          stalled collector as a quiet week.
        </p>
      </div>

      <h2>Checkpoint 5 — the reviewer is still catching things</h2>
      <p>
        &ldquo;No findings&rdquo; and &ldquo;nothing to find&rdquo; are
        indistinguishable from the outside, and a model upgrade can change which
        one you are in without anyone touching a rule. The canary is what tells
        them apart: it opens a pull request of known-bad code against a pilot
        repository, scores what came back, and closes it.
      </p>
      <CodeWindow
        title="terminal"
        copyText="redline metrics score-seeds --repo acme/pilot-web --pr 12 --history data/seed-scores.jsonl"
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">
          redline metrics score-seeds --repo acme/pilot-web --pr 12 --history data/seed-scores.jsonl
        </span>
      </CodeWindow>
      <p>
        Three numbers, because a review system fails in three ways:{" "}
        <b>recall</b> (seeded defects flagged at the expected severity),{" "}
        <b>precision</b> (comments on <code>seeded/clean/**</code>, which should
        never happen) and <b>attribution</b> (findings that cited the correct rule
        id). <code>--history</code> appends to a JSONL so recall has a trend
        rather than a single reading. Run it weekly; the scheduled canary does
        exactly this.
      </p>

      <h2>The end state — earning the right to block</h2>
      <p>
        Success is not a blocking gate on day one. A repository climbs the{" "}
        <Link href="/docs/enforcement">enforcement ladder</Link> on recorded
        evidence, and the thresholds are deliberately hard because a reviewer
        that flags correct code cannot be given a veto:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Rung</th><th>What it does</th><th>Evidence to get there</th></tr>
          </thead>
          <tbody>
            <tr><td><code>observe</code></td><td>Reports everything, blocks nothing.</td><td>None — where every repository starts.</td></tr>
            <tr><td><code>warn</code></td><td>Findings show in the merge box rather than a log. Still blocks nothing.</td><td>5 pull requests, so the reviewer is demonstrably running.</td></tr>
            <tr><td><code>block-blocker</code></td><td>A BLOCKER stops the merge.</td><td>100% seed recall, 0 false positives, 60% acted-on over 20 pull requests.</td></tr>
            <tr><td><code>block-high</code></td><td>A BLOCKER or a HIGH stops the merge.</td><td>100% seed recall, 0 false positives, 80% acted-on over 50 pull requests.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Promotion is refused without the evidence. <b>Demotion never is</b> — a
        gate misfiring at 3am steps back immediately, without asking anyone,
        because a ladder that made the safe direction hard would be switched off
        entirely rather than stepped down.
      </p>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>Be honest about where this stands.</b> No seed scores have been
          recorded yet — the pilot produces the first ones, and nothing widens
          past one repository per stack until they are in{" "}
          <code>CHANGELOG.md</code>. Until a recall number exists, every
          repository is legitimately at <code>observe</code> or{" "}
          <code>warn</code>, and a blocking rung is not something to reach for.
        </p>
      </div>

      <h2>The short version</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Question</th><th>Command</th><th>Where</th></tr>
          </thead>
          <tbody>
            <tr><td>What is installed here?</td><td><code>redline status</code></td><td>your repo, no credential</td></tr>
            <tr><td>Does the host agree?</td><td><code>redline verify</code></td><td>your repo</td></tr>
            <tr><td>What does this finding mean?</td><td><code>redline explain &lt;id&gt;</code></td><td>anywhere</td></tr>
            <tr><td>Would this diff pass?</td><td><code>redline review</code></td><td>your repo, before you push</td></tr>
            <tr><td>Who is onboarded?</td><td><code>redline registry</code></td><td>source repo, nightly</td></tr>
            <tr><td>Is review being acted on?</td><td><code>redline metrics dashboard</code></td><td>metrics repo</td></tr>
            <tr><td>Does it still catch defects?</td><td><code>redline metrics score-seeds</code></td><td>against a pilot PR</td></tr>
            <tr><td>What did it cost?</td><td><code>redline metrics roi</code></td><td>metrics repo</td></tr>
          </tbody>
        </table>
      </div>
    </DocsPage>
  );
}
