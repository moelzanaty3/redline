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
      intro="You onboarded a repository. Now what should you actually see, when, and which command shows it to you? Four checkpoints, each with the command that proves it and the failure that looks identical from the outside."
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
          and the merge policy was never applied —{" "}
          <Link href="/docs/onboarding#after-merge">clearing it</Link> is admin
          work, not a matter of time.
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
          reports — every pull request waits forever on a status that does not
          exist (<Link href="/docs/troubleshooting#waiting-for-status">what to do
          about it</Link>). On the default advisory install nothing is required
          yet, so <code>verify</code> can only surface the reported name for you
          to eyeball; on a <code>--blocking</code> install it is a real assertion
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
        <b>Who:</b> the platform team, not a repository owner — the commands
        behind this one act on an organisation and are meaningless in a product
        repo (<Link href="/docs/who-runs-what">Who runs what</Link>).
      </p>
      <p>
        The hero number is <b>findings acted on</b>, and beside it the dashboard
        carries the <b>rule tuning queue</b> — the standard&apos;s own to-do
        list, and the thing to work through before anyone writes a new rule.{" "}
        <Link href="/docs/telemetry">Telemetry &amp; validation</Link> has the
        tiles, what each one reads like when it is healthy, and the weekly canary
        that proves the reviewer is still catching things.
      </p>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>The quiet failure:</b> a dashboard that looks calm because nothing
          reached it. A figure Redline could not compute says why instead of
          defaulting to zero — a measurement plane that fills gaps with zeros
          reports a stalled collector as a quiet week.
        </p>
      </div>

      <h2>The end state — earning the right to block</h2>
      <p>
        Success is not a blocking gate on day one. A repository climbs the{" "}
        <Link href="/docs/enforcement">enforcement ladder</Link> on recorded
        evidence — seed recall, false positives and acted-on rate, the same
        figures checkpoint 4 reads — and the thresholds are deliberately hard
        because a reviewer that flags correct code cannot be given a veto.
        Promotion is refused without the evidence and names the figure that is
        short; demotion never needs any.
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
