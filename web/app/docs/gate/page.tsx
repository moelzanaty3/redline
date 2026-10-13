import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineCode } from "@/components/learn/interactive";
import { PrivateRepo, RedlineTerminal, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "The merge gate" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="The merge gate"
      intro="Rules in AGENTS.md are advice: an assistant can ignore them and a busy reviewer can miss what it wrote. The gate is the part that runs on every pull request whoever wrote it, and decides whether it can merge."
      href="/docs/gate"
    >
      <h2>Why a gate, and why two kinds of check</h2>
      <p>
        Onboarding (<RedlineCode args="init" />) installs one workflow that runs a handful of checks on every
        pull request and reports a single result, <code>redline-gate / gate</code>. The checks
        fall into two groups, because the mistakes they catch differ in one way that matters:
        whether merging them is already the damage.
      </p>
      <ul>
        <li>
          <b>Process checks</b> catch mistakes that can be fixed in the next pull request: an
          unticked checklist, a big change with no written decision, a broken rule. How strictly
          they are enforced is the repository&apos;s choice, set by its{" "}
          <Link href="/docs/enforcement">rung</Link>, and a reviewer can waive one with a recorded{" "}
          <Link href="/docs/exemptions">exemption</Link>.
        </li>
        <li>
          <b>The security floor</b> catches mistakes that cannot be undone once merged: a
          dependency with a published vulnerability, a credential in a commit. These fail the
          gate at every rung, and nothing waives them.
        </li>
      </ul>

      <h2>What it checks</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Fails when</th>
              <th>Kind</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>PR checklist</td>
              <td>
                The <code>## Launch readiness</code> section of the pull request description has an
                unticked box, or the section is missing.
              </td>
              <td>process</td>
            </tr>
            <tr>
              <td>ADR required for significant changes</td>
              <td>
                The change is over 300 changed lines and its description links no decision record.
              </td>
              <td>process</td>
            </tr>
            <tr>
              <td>Deterministic policy</td>
              <td>
                An added line breaks a <Link href="/docs/deterministic">rule a checker can decide</Link>{" "}
                with no model, at or above the severity the rung sets.
              </td>
              <td>process</td>
            </tr>
            <tr>
              <td>Dependency review</td>
              <td>
                The pull request adds or changes a dependency with an advisory at or above{" "}
                <code>fail-on-dependency-severity</code> (default <code>high</code>).
              </td>
              <td>security floor</td>
            </tr>
            <tr>
              <td>Secret scan (diff)</td>
              <td>TruffleHog finds a verified credential in the pull request&apos;s commits.</td>
              <td>security floor</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        On GitHub each appears as <code>Redline / redline-gate / &lt;check&gt;</code>, beside the
        aggregate <code>Redline / redline-gate / gate</code>. A missing checklist section fails
        loudly rather than passing, so deleting the heading is not a way past it.
      </p>

      <h3>The ADR check</h3>
      <p>
        A change over <code>adr-diff-threshold</code> (300 changed lines, additions plus deletions)
        must link a real decision record under <code>docs/adr/</code> in its description, such as{" "}
        <code>docs/adr/0001-country-list-in-code.md</code>. The template&apos;s own placeholder,{" "}
        <code>docs/adr/NNNN-*.md</code>, does not count. Two ways out, both on the record: the{" "}
        <code>no-adr</code> label for one pull request that is large but decides nothing (a
        lockfile, a rename), or <RedlineCode args="init --no-adr" /> to turn the check off for the
        repository. <Link href="/docs/learn/adr">Learn step 05</Link> walks through it.
      </p>

      <h3>The security floor</h3>
      <p>
        Dependency review is GitHub&apos;s <code>dependency-review-action</code>: every package the
        pull request adds or changes, checked against GitHub&apos;s advisory database. Advisories
        below the threshold are reported without failing. The secret scan runs TruffleHog over
        the pull request&apos;s commits, pinned to a commit SHA, and counts verified results only:
        an unverified match is a false positive on a check nobody can waive.{" "}
        <Link href="/docs/learn/security-floor">Learn step 06</Link> shows a failing dependency
        review and its fix.
      </p>
      <PrivateRepo title="Dependency review needs GitHub Code Security">
        <p>
          On a public repository dependency review is free. On a private one it needs GitHub Code
          Security; without it, onboarding can hand dependency checks to Dependabot instead, and
          the job is then skipped. A skipped job reads as a pass, so nothing in the pull request
          stops a vulnerable version: Dependabot alerts after it reaches <code>main</code>. The
          secret scan needs no licence and runs on every repository.
        </p>
      </PrivateRepo>

      <h2>How the gate decides</h2>
      <p>
        The aggregate <code>gate</code> job reads every check&apos;s result, in this order:
      </p>
      <ol>
        <li>
          <b>A security floor check failed:</b> the gate fails, at every rung, labelled or not.
        </li>
        <li>
          <b>A process check failed, at <code>observe</code>:</b> the gate passes with a warning.
          The findings are still produced and recorded: <code>observe</code> means
          &ldquo;measured, not yet enforced&rdquo;, not &ldquo;off&rdquo;.
        </li>
        <li>
          <b>A process check failed, at <code>block-blocker</code> or <code>block-high</code>:</b>{" "}
          the gate fails, unless the pull request carries a valid exemption covering every failing
          check.
        </li>
      </ol>
      <Terminal
        commands="# the gate job's log, in each of the three cases"
        output={`Error: Redline gate failed on security checks (not label-exemptible,
       and not on the enforcement ladder): dependency-review

Warning: Process checks failed: policy. This repository is at rung 'observe',
         which reports and does not block. The findings are recorded either way.

Error: Redline gate failed: policy`}
      />
      <p>
        The rung also sets the policy check&apos;s own threshold: it fails on a{" "}
        <code>BLOCKER</code> finding at <code>observe</code> and <code>block-blocker</code>, and on
        a <code>HIGH</code> or <code>BLOCKER</code> at <code>block-high</code>. A rung the gate
        does not recognise is treated as not enforcing, so a typo can never make a repository
        stricter than anyone chose.
      </p>

      <h2>Blocking is a separate switch</h2>
      <p>
        The rung decides what turns the gate red. Whether a red gate stops the merge is a
        different setting: <RedlineCode args="init --blocking" /> makes{" "}
        <code>redline-gate / gate</code> a required check in the branch policy. A new onboarding is
        advisory, so a red gate is visible but the merge button still works. Turning it on is a
        deliberate second step, after the team has watched the gate for a while.{" "}
        <Link href="/docs/learn/required-gate">Learn step 07</Link> does it.
      </p>
      <p>
        Required at <code>observe</code> means only the security floor can stop a merge; raising
        the rung is how process checks start to. See{" "}
        <Link href="/docs/enforcement">Enforcement ladder</Link>.
      </p>

      <h2>Who can change the gate</h2>
      <p>
        A gate the pull request can edit is not a gate. Where the workflow lives decides this:
      </p>
      <ul>
        <li>
          <b>
            <code>--gate-source org</code>
          </b>{" "}
          (the default) references a reusable workflow in your organisation&apos;s{" "}
          <code>&lt;org&gt;/.github</code> repository. A pull request in a product repository
          cannot change it.
        </li>
        <li>
          <b>
            <code>--gate-source local</code>
          </b>{" "}
          vendors a copy into <code>.github/workflows/redline-gate.yml</code>, for an organisation
          with no shared <code>.github</code> repository yet. A pull request runs the workflow
          from its own branch, so <b>it can edit the gate that is judging it</b>. Close that gap
          by requiring an owner&apos;s review on <code>.github/workflows/</code>, with{" "}
          <code>--with review-ownership --review-owners &lt;team&gt;</code>, or by moving to the
          org gate. <code>init</code> warns about it on every run.
        </li>
      </ul>

      <h2 id="local-agent">No CI at all: the local-agent gate</h2>
      <p>
        <RedlineCode args="init --pipeline local-agent" /> installs no workflow. The gate is{" "}
        <code>.redline/hooks/pre-push</code>, committed so it can be reviewed, versioned and
        removed like anything else. Before <code>git push</code> it runs the deterministic rules
        as <code>redline policy</code> over every ref being pushed, and the rung in{" "}
        <code>.redline.json</code> decides what a finding does: <code>observe</code> reports,{" "}
        <code>block-blocker</code> and <code>block-high</code> refuse the push. The model-judged
        rules are handed to whichever assistant you already use.
      </p>
      <p>
        It publishes no check, so no ruleset can require it, and{" "}
        <code>git push --no-verify</code> skips it: the honest trade for a gate that needs no CI,
        no credential and no host. Each engineer runs it once per clone:
      </p>
      <Terminal commands="git config core.hooksPath .redline/hooks" />
      <p>
        A hook already installed in <code>.git/hooks/pre-push</code> by husky v4, lefthook or
        pre-commit is reported as <code>denied</code> rather than silently orphaned.
      </p>

      <h2>Policy invariants</h2>
      <ul>
        <li>
          Approvals are the team&apos;s choice. Redline fails the pipeline; a new onboarding
          requires no approving review, and <RedlineCode args="init --approvals <n>" /> requires
          n. Automated review is advisory input and never approves.
        </li>
        <li>Review threads must be resolved before merge.</li>
        <li>
          Applied per repo by <code>init</code>, as a GitHub ruleset named <code>Redline</code> or
          an Azure DevOps branch policy: no manual per-repo setup, no drift from a hand-edited
          setting.
        </li>
      </ul>

      <h2>Two hosts, two gate contracts</h2>
      <p>
        Reusable GitHub workflows report a check-run name derived from two job ids, so requiring
        the wrong string{" "}
        <Link href="/docs/troubleshooting#waiting-for-status">
          hangs every pull request in the repository
        </Link>
        . Azure has no such derivation: Redline defines its own contract, so nothing is derived
        from a job name and that failure mode does not exist on that host.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Host</th>
              <th>Gate contract</th>
              <th>Required by the policy as</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>GitHub</td>
              <td>Check-run name from the caller/called job ids</td>
              <td>
                <code>redline-gate / gate</code>
              </td>
            </tr>
            <tr>
              <td>Azure DevOps</td>
              <td>
                PR status, genre <code>redline</code>, name <code>gate</code>
              </td>
              <td>
                <code>redline/gate</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Azure Repos ignores a pipeline&apos;s YAML <code>pr:</code> trigger, so the gate pipeline
        alone runs nothing. <code>init</code> also registers a build definition for it and a{" "}
        <code>Redline: gate build</code> Build Validation branch policy that queues that pipeline
        on every pull request. Without Build Administrator rights that registration is recorded as
        pending and the required status is written advisory, since no pipeline could publish what
        it would require.
      </p>
      <p>
        <RedlineCode args="verify" /> reads back the check names or statuses the host{" "}
        <b>actually reported</b> on a real pull request, not what a config file claims, before it
        will call the check name confirmed.
      </p>
      <RedlineTerminal commands="{redline} verify" />

      <h2 id="adding-a-check">Adding a check of your own</h2>
      <p>
        Three ways, in the order to reach for them. The first two need no change to Redline.
      </p>
      <ol>
        <li>
          <b>Run it beside the gate.</b> A check that is yours alone (a licence scan, a bundle-size
          budget) is an ordinary workflow. To make it block, require its check name in a{" "}
          <i>second</i> ruleset; hand-editing the one named <code>Redline</code> is drift, and{" "}
          <code>verify</code> reports it.
        </li>
        <li>
          <b>Stand a Redline job down.</b> Where another tool already covers a gate job,{" "}
          <code>init --integrations</code> records the tools you declared and writes{" "}
          <code>stand-down:</code> into the caller; a stood-down job is skipped and a skip reads
          as a pass. <code>policy</code>, <code>dependencies</code> and <code>secrets</code> can be
          stood down. The last two are the security floor, so stand one down only because another
          scanner genuinely covers it, never to get a red pull request green.
        </li>
        <li>
          <b>Add a job to the gate itself</b>, for a check the whole organisation should get. Do
          not rename any job id: the required check name is built from <code>redline-gate</code>{" "}
          and <code>gate</code>, and renaming either leaves every pull request on &ldquo;Expected
          — waiting for status&rdquo;. Add the job to the <code>gate</code> job&apos;s{" "}
          <code>needs:</code> list, or the aggregate never reads its result and it blocks nothing.
          A new job is a process check; the security floor is deliberately not a list a
          repository extends.
        </li>
      </ol>
      <p>
        With <code>--gate-source org</code> the jobs live in <code>&lt;org&gt;/.github</code>, and
        one merge there reaches every repository. With <code>--gate-source local</code>, the
        vendored file is overwritten by the next <RedlineCode args="init --repair" />, so put the
        check in its own workflow or contribute it to the Redline source repository. Either way,
        prove it: <Link href="/docs/onboarding#prove-it">Prove it</Link> shows a stood-down job
        reading as a pass, and a check that blocks against one that only reports.
      </p>
    </DocsPage>
  );
}
