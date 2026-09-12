import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Verification" };

const FIXTURE = `mkdir -p .redline-gate-test
{
  echo "// Throwaway fixture. Nothing here is built or shipped."
  echo "// TODO: decide whether the scanner should follow symlinks"
  for i in $(seq 1 400); do echo "// filler line $i"; done
} > .redline-gate-test/scenarios.js

git checkout -b redline/gate-scenarios
git add -A && git commit -m "test(redline): gate scenario fixtures"
git push -u origin redline/gate-scenarios`;

const BLOCKER_LINE = `// eslint-disable-next-line no-unused-vars
export function suppressed() {}`;

const EXEMPTION = `## Redline exemption

- reason: deliberate BLOCKER planted on a throwaway branch to record what the gate does at a blocking rung
- until: 2026-11-30
- scope: policy`;

const FORCE_SECRETS = `  secrets:
    # ...the shipped job, unchanged...
      - uses: trufflesecurity/trufflehog@<pinned sha>
        with:
          extra_args: --results=verified

      # SCENARIO 9 ONLY. Deleted with the branch.
      - name: Force the secret scan to fail
        run: exit 1`;

export default function Page() {
  return (
    <DocsPage
      crumb="Getting Started"
      title="Verification"
      intro="Nine scenarios that take a freshly onboarded repository from “the gate is installed” to “I have watched it pass, watched it block, and watched it refuse to be waived”. Run them once, on a throwaway branch, before you trust the thing."
      href="/docs/verification"
    >
      <p>
        A merge gate that never runs looks exactly like a merge gate that finds
        nothing. Both are green. The difference only shows up on the pull request
        you needed it to stop, which is the worst possible moment to discover it.
      </p>
      <p>
        This is the drill that tells the two apart. It takes about twenty minutes
        of mostly waiting, it runs entirely on a branch you delete afterwards, and
        it ends with you having <i>seen</i> every path the gate has.
      </p>

      <h2>Before you start</h2>
      <ul>
        <li>
          <code>redline init</code> has run and its pull request is open or merged
          — see <Link href="/docs/onboarding">Onboard a repository</Link>.
        </li>
        <li>
          You can push a branch and open a pull request on the repository.
        </li>
        <li>
          You know the repository&apos;s{" "}
          <Link href="/docs/enforcement">rung</Link>. A fresh onboarding is{" "}
          <code>observe</code>, and the first four scenarios assume it.
        </li>
      </ul>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Every push below also triggers whatever CI your repository already runs.
          On expensive runners — macOS, large self-hosted — that adds up, which is
          why the nine scenarios are arranged into <b>three pushes</b> and six
          edits to the pull request body or its labels. Body and label edits
          re-run the gate and nothing else, because the gate&apos;s caller listens
          for <code>edited</code> and <code>labeled</code> and a typical CI
          workflow does not.
        </p>
      </div>

      <h2>Step 1 — the static check</h2>
      <p>
        Before provoking anything, ask Redline what it thinks. This reads the
        checkout and the host and contacts no pull request.
      </p>
      <CodeWindow title="terminal" copyText="npx redlinegate verify">
        <span className="tk-prompt">$</span> <span className="tk-white">npx redlinegate verify</span>{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">gate-machinery</span>       .github/workflows/redline.yml publishes redline-gate / gate{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">review-ownership</span>     every owner in CODEOWNERS resolves{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">artifacts-current</span>    rendered artifacts match the standards version{"\n"}
        <span className="tk-red">FAIL</span> <span className="tk-dim">pending-admin</span>        an administrator must still enable: merge-policy
      </CodeWindow>
      <p>
        <code>gate-machinery</code> green means the workflow that would run the
        gate exists and publishes the right check name.{" "}
        <b>It does not mean the gate has ever run.</b> That is what the rest of
        this page is for.
      </p>

      <h2>Step 2 — the throwaway branch</h2>
      <p>
        One fixture file carries two of the nine scenarios: a{" "}
        <code>TODO</code> with no ticket, which{" "}
        <Link href="/docs/deterministic">
          <code>core/untracked-todo</code>
        </Link>{" "}
        reports at HIGH, and enough added lines to cross the 300-line ADR
        threshold.
      </p>
      <CodeWindow title="terminal" copyText={FIXTURE}>
        <span className="tk-white">{FIXTURE}</span>
      </CodeWindow>
      <p>
        Open it as a <b>draft</b> pull request, and give it a body with{" "}
        <b>no <code>## Launch readiness</code> heading at all</b>. Base it on
        whichever branch carries the gate — the onboarding branch if that has not
        merged yet, otherwise your default branch.
      </p>

      <h2>The nine scenarios</h2>
      <p>
        Each row is one edit. After each, wait for{" "}
        <code>redline-gate / gate</code> to finish and compare against{" "}
        <b>expected</b>. The results here are from a real run on a real
        repository, not a description of what the workflow ought to do.
      </p>

      <h3>1 — Nothing is filled in</h3>
      <p>
        The state you just pushed: no checklist heading, 400+ added lines, no
        labels, rung <code>observe</code>.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Check</th><th>Expected</th><th>Why</th></tr>
          </thead>
          <tbody>
            <tr><td><code>PR checklist</code></td><td>FAIL</td><td>No <code>## Launch readiness</code> section. The message names the missing heading, not a box.</td></tr>
            <tr><td><code>ADR required…</code></td><td>FAIL</td><td>Over the 300-line threshold with no <code>docs/adr/</code> link and no <code>no-adr</code> label.</td></tr>
            <tr><td><code>Deterministic policy</code></td><td>pass</td><td>The TODO is reported at HIGH. <code>observe</code> sets the floor at BLOCKER, so a HIGH is recorded and does not fail the job.</td></tr>
            <tr><td><b><code>gate</code></b></td><td><b>PASS</b></td><td>Two process checks are red and the aggregate is green. That is what <code>observe</code> means — measured, not yet enforced.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        <b>If <code>gate</code> is red here</b>, your repository is not at{" "}
        <code>observe</code>. Check <code>rung:</code> in{" "}
        <code>.github/workflows/redline.yml</code>.
      </p>

      <h3>2 — Apply the <code>no-adr</code> label</h3>
      <p>
        Label only, no push. <b>Expected:</b> <code>ADR required…</code> flips to
        pass; the checklist stays red.
      </p>

      <h3>3 — Add the heading, leave one box unticked</h3>
      <p>
        Paste the <code>## Launch readiness</code> section from{" "}
        <code>.github/pull_request_template.md</code> into the body and untick
        exactly one line. <b>Expected:</b> <code>PR checklist</code> still fails —
        but on a different message, naming the unticked line rather than the
        missing heading. Two distinct failures, which is the point of checking
        both.
      </p>

      <h3>4 — Tick everything</h3>
      <p>
        <b>Expected:</b> all six jobs green, aggregate green. This is your
        baseline: from here, every red you see is something you caused.
      </p>

      <h3>5 — A BLOCKER, and the rung that acts on it</h3>
      <p>Two changes in one push. Append to the fixture:</p>
      <CodeWindow title=".redline-gate-test/scenarios.js" copyText={BLOCKER_LINE}>
        <span className="tk-white">{BLOCKER_LINE}</span>
      </CodeWindow>
      <p>
        and set <code>rung: block-blocker</code> in{" "}
        <code>.github/workflows/redline.yml</code>.
      </p>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Check</th><th>Expected</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td><code>Deterministic policy</code></td><td>FAIL</td><td>A suppression with no ticket is <code>core/type-checker-suppression</code>, a BLOCKER, and the floor is now BLOCKER.</td></tr>
            <tr><td><b><code>gate</code></b></td><td><b>FAIL</b></td><td>At a blocking rung a failing process check stops the merge.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        This is the scenario worth doing even if you skip the rest. The same
        finding was reported and waved through in scenario 1; only the rung
        changed. If the aggregate does not go red here, your ladder is decorative.
      </p>

      <h3>6 — Exempt it, properly</h3>
      <p>
        Apply the <code>redline-exempt</code> label <i>and</i> add a filled-in
        block to the body:
      </p>
      <CodeWindow title="in the pull request body" copyText={EXEMPTION}>
        <span className="tk-white">{EXEMPTION}</span>
      </CodeWindow>
      <p>
        <b>Expected:</b> <code>Deterministic policy</code> stays red — an
        exemption records who accepted a finding, it does not delete it — and{" "}
        <code>gate</code> goes green with a warning naming the scope:{" "}
        <i>
          &ldquo;Process checks failed but a valid exemption is recorded: policy.
          A reviewer is accepting this deliberately, with a reason and an
          expiry.&rdquo;
        </i>{" "}
        See <Link href="/docs/exemptions">Exemptions</Link> for the field rules.
      </p>

      <h3>7 — The label on its own</h3>
      <p>
        Delete the block, keep the label. <b>Expected:</b> the aggregate still
        passes, and says exactly why it should not have:{" "}
        <i>
          &ldquo;This exemption has no valid <code>## Redline exemption</code>{" "}
          block. It is being accepted this time; once this repository moves to
          require, it will not be.&rdquo;
        </i>
      </p>
      <p>
        That is <code>exemption-enforcement: warn</code>, the default. Repositories
        move to <code>require</code> one standards version after the block is
        introduced, so nobody&apos;s open pull request is failed by a rule that did
        not exist when they opened it.
      </p>

      <h3>8 — Stand a job down</h3>
      <p>
        Set <code>stand-down: policy</code> in the caller and push.{" "}
        <b>Expected:</b> <code>Deterministic policy</code> reports{" "}
        <b>skipped</b>, and the aggregate reads the skip as a pass.
      </p>
      <p>
        Getting this wrong is how a repository is punished for narrowing the gate
        to match tooling it already runs. If your aggregate fails on a skip, do
        not stand anything down until it is fixed.
      </p>

      <h3>9 — Prove the security floor cannot be waived</h3>
      <p>
        Keep the <code>redline-exempt</code> label and the valid block from
        scenario 6. Then make the secret scan fail, by appending a step to the{" "}
        <code>secrets</code> job in{" "}
        <code>.github/workflows/redline-gate.yml</code>:
      </p>
      <CodeWindow title=".github/workflows/redline-gate.yml" copyText={FORCE_SECRETS}>
        <span className="tk-white">{FORCE_SECRETS}</span>
      </CodeWindow>
      <div className="callout">
        <p>
          <b>Do not plant a credential to test this.</b> The scanner runs with{" "}
          <code>--results=verified</code>, so a fake secret is ignored and a
          working one means you have committed a real, live credential to a branch
          — and to every fork and cache that ever sees it. Failing the job
          directly tests the thing actually in question: what the aggregate does
          with a hard job.
        </p>
      </div>
      <p>
        <b>Expected:</b> <code>gate</code> fails, with a valid exemption sitting
        right there on the pull request:{" "}
        <i>
          &ldquo;Redline gate failed on security checks (not label-exemptible, and
          not on the enforcement ladder): secrets&rdquo;
        </i>
      </p>

      <h2>Record it</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>#</th><th>Condition</th><th><code>gate</code></th></tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>Nothing filled in, rung <code>observe</code></td><td>PASS</td></tr>
            <tr><td>2</td><td><code>no-adr</code> applied</td><td>PASS</td></tr>
            <tr><td>3</td><td>Heading present, one box unticked</td><td>PASS</td></tr>
            <tr><td>4</td><td>All ticked</td><td>PASS — all six green</td></tr>
            <tr><td>5</td><td>BLOCKER + <code>rung: block-blocker</code></td><td><b>FAIL</b></td></tr>
            <tr><td>6</td><td>+ valid exemption block</td><td>PASS, exemption recorded</td></tr>
            <tr><td>7</td><td>Label with no block</td><td>PASS, warned</td></tr>
            <tr><td>8</td><td><code>stand-down: policy</code></td><td>PASS, job skipped</td></tr>
            <tr><td>9</td><td>Secret scan failing, exemption applied</td><td><b>FAIL</b></td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Paste the table into the onboarding pull request. It is the evidence that
        the gate was watched rather than assumed, and it is what a later reviewer
        needs when the gate behaves in a way nobody expected.
      </p>

      <h2>Clean up</h2>
      <p>
        Close the pull request unmerged and delete the branch. Nothing in it was
        ever meant to land: the fixture, the promoted rung, the stand-down and the
        forced failure are all instruments. Leaving the branch alive leaves an
        edited gate one merge away from a repository that trusts it.
      </p>

      <h2>What scenarios 5, 8 and 9 also told you</h2>
      <div className="callout">
        <p>
          Each of those three changed the gate&apos;s own behaviour — the rung,
          the stand-down list, the secret-scan job — <b>from the branch the gate
          was judging</b>, and the gate honoured every one. That is not a bug. It
          is what a{" "}
          <Link href="/docs/onboarding#gate-source">vendored gate</Link> is: a{" "}
          <code>pull_request</code> workflow runs from the pull request&apos;s own
          head commit.
        </p>
        <p>
          The rung and the stand-down list behave that way on an org-hosted gate
          too, because they are caller inputs and the caller lives in your
          repository. Scenario 9 is the one that does not: with{" "}
          <code>--gate-source org</code> the job definitions live in{" "}
          <code>&lt;org&gt;/.github</code> and a pull request here cannot reach
          them.
        </p>
        <p>
          The mitigation for a vendored gate is the{" "}
          <code>/.github/workflows/</code> entry in <code>.github/CODEOWNERS</code>,
          and <b>it does nothing until the branch ruleset is applied</b> — which
          is admin work a non-admin <code>redline init</code> leaves in{" "}
          <code>pendingAdmin</code>. If you ran the drill and that ruleset is not
          yet in place, scenario 9 is exactly what anyone with push access can do
          on purpose.
        </p>
      </div>

      <h2>When to run it again</h2>
      <ul>
        <li><b>After promoting a rung.</b> Scenario 5 is the promotion&apos;s only real proof.</li>
        <li><b>After moving between <code>--gate-source local</code> and <code>org</code>.</b> The required check name should not move; this is how you find out that it did.</li>
        <li><b>After standing a job down or adding one</b> — see <Link href="/docs/gate#adding-a-check">adding a check of your own</Link>.</li>
        <li><b>After an admin applies the ruleset.</b> Until then no check is required, so nothing you saw here was actually blocking a merge — it was reporting a failure that a human could click past.</li>
      </ul>
    </DocsPage>
  );
}
