import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineCode } from "@/components/learn/interactive";
import { PrivateRepo, RedlineTerminal, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "The merge gate" };

// The four messages the aggregate `gate` job in workflows/redline-gate.yml prints.
const GATE_LOG = `# a security floor check failed: fails at every rung
Error: Redline gate failed on security checks (not label-exemptible, and not on the enforcement ladder): dependency-review

# a process check failed at observe: passes, with a warning
Warning: Process checks failed: policy. This repository is at rung 'observe', which reports and does not block. The findings are recorded either way.

# a process check failed at a blocking rung, with a valid exemption: passes, with a warning
Warning: Process checks failed but a valid exemption is recorded: checklist. A reviewer is accepting this deliberately, with a reason and an expiry.

# a process check failed at a blocking rung, no exemption: fails
Error: Redline gate failed: policy`;

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="The merge gate"
      intro="Rules in AGENTS.md are advice: an assistant can ignore them, and a busy reviewer can miss what it wrote. The gate is the part that runs on every pull request, whoever or whatever wrote it, and reports whether it is fit to merge."
      href="/docs/gate"
    >
      <h2>Why a gate</h2>
      <p>
        A standard that nothing checks drifts. The gate is one workflow,{" "}
        <RedlineCode args="init" /> installs it, and it runs a handful of checks on every pull
        request. It reports one result, <code>redline-gate / gate</code>, that a branch rule can
        require.
      </p>

      <h2>Two kinds of check</h2>
      <p>
        The checks fall into two groups. The question that separates them:{" "}
        <b>is merging the mistake already the damage?</b>
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Process checks</th>
              <th>Security floor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Catches</td>
              <td>an unticked checklist, a large change with no written decision, a broken rule</td>
              <td>a dependency with a known vulnerability, a live credential in a commit</td>
            </tr>
            <tr>
              <td>If it merges anyway</td>
              <td>fix it in the next pull request</td>
              <td>the damage is done: the credential is exposed, the vulnerable version shipped</td>
            </tr>
            <tr>
              <td>How strict</td>
              <td>
                set per repository by its <Link href="/docs/enforcement">rung</Link>
              </td>
              <td>fails the gate at every rung</td>
            </tr>
            <tr>
              <td>Can be waived</td>
              <td>
                yes, with a recorded <Link href="/docs/exemptions">exemption</Link>
              </td>
              <td>never</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>The checks</h2>
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
                without a model, at or above the severity the rung sets.
              </td>
              <td>process</td>
            </tr>
            <tr>
              <td>Dependency review</td>
              <td>
                The pull request adds or changes a dependency with a known vulnerability rated{" "}
                <code>high</code> or worse.
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
        On GitHub each check appears as <code>redline-gate / &lt;check&gt;</code>, beside
        the aggregate <code>redline-gate / gate</code>. Model review comments are not a
        check: they are posted on the pull request and measured, and never fail the gate.
      </p>

      <h3>The checklist check</h3>
      <p>
        The pull request template carries a <code>## Launch readiness</code> section. Every box in
        it must be ticked, or deleted with a reason in the description. Deleting the whole heading
        does not get past it: a missing section fails too.
      </p>

      <h3>The ADR check</h3>
      <p>
        A change over 300 changed lines (additions plus deletions) must link a decision record
        under <code>docs/adr/</code> in its description, such as{" "}
        <code>docs/adr/0001-country-list-in-code.md</code>. The template&apos;s own placeholder,{" "}
        <code>docs/adr/NNNN-*.md</code>, does not count. Two ways out, both on the record:
      </p>
      <ul>
        <li>
          the <code>no-adr</code> label, for one pull request that is large but decides nothing, such
          as a lockfile update or a rename
        </li>
        <li>
          <RedlineCode args="init --no-adr" />, to turn the check off for the repository
        </li>
      </ul>
      <p>
        <Link href="/docs/learn/adr">Learn step 05</Link> walks through it.
      </p>

      <h3>The security floor</h3>
      <p>
        <b>Dependency review</b> is GitHub&apos;s <code>dependency-review-action</code>. It checks
        every package the pull request adds or changes against GitHub&apos;s advisory database.
        Advisories rated below <code>high</code> do not fail it.
      </p>
      <p>
        <b>The secret scan</b> runs TruffleHog over the pull request&apos;s commits. It counts only
        credentials TruffleHog has verified are live. An unverified match is too often a false
        positive, and this is a check nobody can waive.{" "}
        <Link href="/docs/learn/security-floor">Learn step 06</Link> shows a failing dependency
        review and its fix.
      </p>
      <PrivateRepo title="Dependency review needs GitHub Code Security">
        <p>
          On a public repository dependency review is free. On a private one it needs GitHub Code
          Security. Without it, onboarding can hand dependency checks to Dependabot instead, and the
          job is skipped.
        </p>
        <p>
          A skipped job counts as a pass, so nothing in the pull request stops a vulnerable version:
          Dependabot alerts after it reaches <code>main</code>. The secret scan needs no licence and
          runs on every repository.
        </p>
      </PrivateRepo>

      <h2>How the gate decides</h2>
      <p>
        The aggregate <code>gate</code> job reads every check&apos;s result. A skipped check counts
        as a pass. Then:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>What failed</th>
              <th>
                At <code>observe</code>
              </th>
              <th>
                At <code>block-blocker</code> or <code>block-high</code>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>A security floor check</td>
              <td>gate fails</td>
              <td>gate fails, exemption or not</td>
            </tr>
            <tr>
              <td>A process check</td>
              <td>gate passes, with a warning</td>
              <td>gate fails, unless a valid exemption covers every failing check</td>
            </tr>
            <tr>
              <td>Nothing</td>
              <td>gate passes</td>
              <td>gate passes</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        At <code>observe</code> a failing process check still shows red on its own line. Only the
        aggregate stays green. <code>observe</code> means &ldquo;measured, not yet enforced&rdquo;,
        not &ldquo;off&rdquo;.
      </p>
      <p>The gate job&apos;s log says which case applied:</p>
      <Terminal commands="# the gate job's log, one line per case" output={GATE_LOG} />
      <p>
        A rung the gate does not recognise is treated as not enforcing, so a typo can never make a
        repository stricter than anyone chose.
      </p>

      <h2>Red is not the same as blocked</h2>
      <p>
        The gate turning red and the merge button being disabled are two separate settings:
      </p>
      <ul>
        <li>
          <b>The rung</b> decides what turns the gate red.
        </li>
        <li>
          <b>
            <RedlineCode args="init --blocking" />
          </b>{" "}
          makes <code>redline-gate / gate</code> a required check, so a red gate stops the merge. A
          new onboarding is advisory: the gate shows red, and the merge button still works.
        </li>
      </ul>
      <p>
        Turn blocking on once the team has watched the gate for a while.{" "}
        <Link href="/docs/learn/required-gate">Learn step 07</Link> does it, and{" "}
        <Link href="/docs/enforcement">Enforcement ladder</Link> explains how the two combine.
      </p>

      <h2>Gate settings and defaults</h2>
      <p>
        <code>init</code> writes these into the caller workflow,{" "}
        <code>.github/workflows/redline.yml</code>. The file is regenerated on every{" "}
        <code>init</code>, so change a setting with its flag rather than by hand.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Setting</th>
              <th>Default</th>
              <th>Change it with</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>rung</code>
              </td>
              <td>
                <code>observe</code>
              </td>
              <td>
                <RedlineCode args="init --rung <name>" />, if the evidence allows
              </td>
            </tr>
            <tr>
              <td>
                <code>adr-diff-threshold</code>
              </td>
              <td>300 changed lines</td>
              <td>
                <RedlineCode args="init --no-adr" /> turns the check off
              </td>
            </tr>
            <tr>
              <td>
                <code>fail-on-dependency-severity</code>
              </td>
              <td>
                <code>high</code>
              </td>
              <td>no flag</td>
            </tr>
            <tr>
              <td>
                <code>soft-fail-labels</code>
              </td>
              <td>
                <code>redline-exempt,redline-sync</code>
              </td>
              <td>no flag: the labels that mark an exemption</td>
            </tr>
            <tr>
              <td>
                <code>stand-down</code>
              </td>
              <td>empty: every check runs</td>
              <td>
                <RedlineCode args="init --integrations <list>" />; see{" "}
                <a href="#adding-a-check">below</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Who can change the gate</h2>
      <p>A gate the pull request can edit is not a gate. Where the workflow lives decides this:</p>
      <ul>
        <li>
          <b>
            <code>--gate-source org</code>
          </b>{" "}
          (the default) references a reusable workflow in your organisation&apos;s{" "}
          <code>&lt;org&gt;/.github</code> repository. A pull request in a product repository cannot
          change it.
        </li>
        <li>
          <b>
            <code>--gate-source local</code>
          </b>{" "}
          copies the workflow into <code>.github/workflows/redline-gate.yml</code>, for an
          organisation with no shared <code>.github</code> repository yet. A pull request runs the
          workflow from its own branch, so <b>it can edit the gate that is judging it</b>.{" "}
          <code>init</code> warns about this on every run. Close the gap by requiring an
          owner&apos;s review on <code>.github/workflows/</code> with{" "}
          <code>--with review-ownership --review-owners &lt;team&gt;</code>, or move to the org gate.
        </li>
      </ul>

      <h2 id="local-agent">No CI at all: the local-agent gate</h2>
      <p>
        <RedlineCode args="init --pipeline local-agent" /> installs no workflow. The gate is a git
        hook, <code>.redline/hooks/pre-push</code>, committed so it is reviewed, versioned and
        removed like any other file.
      </p>
      <p>
        Before each <code>git push</code> it runs <code>redline policy</code> over the commits being
        pushed. The rung in <code>.redline.json</code> decides what a finding does:{" "}
        <code>observe</code> reports, <code>block-blocker</code> and <code>block-high</code> refuse
        the push. The judgement rules are left to whichever assistant you already use.
      </p>
      <p>Each engineer turns it on once per clone:</p>
      <Terminal commands="git config core.hooksPath .redline/hooks" />
      <p>
        The trade-off: it publishes no check, so no branch rule can require it, and{" "}
        <code>git push --no-verify</code> skips it. In return it needs no CI, no credential and no
        host. If husky v4, lefthook or pre-commit already installed a hook in{" "}
        <code>.git/hooks/pre-push</code>, <code>init</code> reports <code>denied</code> rather than
        silently disabling it.
      </p>

      <h2>Branch policy</h2>
      <p>
        <code>init</code> also applies a branch policy, as a GitHub ruleset named{" "}
        <code>Redline</code> or an Azure DevOps branch policy, so no repository is set up by hand:
      </p>
      <ul>
        <li>Review threads must be resolved before merge.</li>
        <li>
          No approving review is required by default; <RedlineCode args="init --approvals <n>" />{" "}
          requires n. Automated review is advice and never approves.
        </li>
        <li>
          The gate is required only after <RedlineCode args="init --blocking" />.
        </li>
      </ul>

      <h2>GitHub and Azure DevOps</h2>
      <p>The name a branch policy requires differs by host:</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Host</th>
              <th>What the gate reports</th>
              <th>Required as</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>GitHub</td>
              <td>a check run, named from the caller and called job ids</td>
              <td>
                <code>redline-gate / gate</code>
              </td>
            </tr>
            <tr>
              <td>Azure DevOps</td>
              <td>
                a pull request status, genre <code>redline</code>, name <code>gate</code>
              </td>
              <td>
                <code>redline/gate</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        On GitHub, requiring the wrong string{" "}
        <Link href="/docs/troubleshooting#waiting-for-status">
          leaves every pull request waiting for a status that never arrives
        </Link>
        . Azure DevOps has no such derivation, so that failure cannot happen there.
      </p>
      <p>
        Azure Repos ignores a pipeline&apos;s YAML <code>pr:</code> trigger. So <code>init</code>{" "}
        also registers the gate pipeline and a <code>Redline: gate build</code> Build Validation
        policy that queues it on every pull request. Without Build Administrator rights that step
        is recorded as pending, and the status is left advisory: requiring a status no pipeline can
        publish would block every pull request.
      </p>
      <p>
        To confirm the name the host <b>actually reported</b> on a real pull request, rather than
        what a config file claims:
      </p>
      <RedlineTerminal commands="{redline} verify" />

      <h2 id="adding-a-check">Adding a check of your own</h2>
      <p>Three ways, in the order to reach for them. The first two need no change to Redline.</p>
      <ol>
        <li>
          <b>Run it beside the gate.</b> A check that is yours alone, such as a licence scan or a
          bundle-size budget, is an ordinary workflow. To make it block, require its check name in a{" "}
          <i>second</i> ruleset. Editing the ruleset named <code>Redline</code> by hand is drift,
          and <code>verify</code> reports it.
        </li>
        <li>
          <b>Stand a Redline check down.</b> When another tool already covers a check,{" "}
          <RedlineCode args="init --integrations <list>" /> records the tools you declared and writes{" "}
          <code>stand-down:</code> into the caller. A stood-down check is skipped, and a skip counts
          as a pass. <code>policy</code>, <code>dependencies</code> and <code>secrets</code> can be
          stood down. The last two are the security floor: stand one down only because another
          scanner genuinely covers it, never to turn a red pull request green.
        </li>
        <li>
          <b>Add a job to the gate itself</b>, for a check the whole organisation should get. Add
          the job to the <code>gate</code> job&apos;s <code>needs:</code> list, or the aggregate
          never reads its result. Do not rename the <code>redline-gate</code> or <code>gate</code>{" "}
          job ids: the required check name is built from them, and renaming either leaves every pull
          request on &ldquo;Expected — waiting for status&rdquo;. A new job is a process check; the
          security floor is deliberately not a list a repository extends.
        </li>
      </ol>
      <p>
        With <code>--gate-source org</code> the jobs live in <code>&lt;org&gt;/.github</code>, and
        one merge there reaches every repository. With <code>--gate-source local</code>, the copied
        file is overwritten by the next <RedlineCode args="init --repair" />, so put the check in its
        own workflow or contribute it to the Redline source repository. Either way, prove it:{" "}
        <Link href="/docs/onboarding#prove-it">Prove it</Link> shows a stood-down job reading as a
        pass, and a check that blocks next to one that only reports.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/enforcement">Enforcement ladder</Link>: rungs, evidence and blocking.
        </li>
        <li>
          <Link href="/docs/exemptions">Exemptions</Link>: waiving a process check on the record.
        </li>
        <li>
          <Link href="/docs/workflows/redline-gate">The gate workflow</Link>: the file itself.
        </li>
      </ul>
    </DocsPage>
  );
}
