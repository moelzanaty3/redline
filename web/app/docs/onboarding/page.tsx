import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { PackageBadge } from "@/components/package-badge";
import { RedlineCode } from "@/components/learn/interactive";
import { PrivateRepo, RedlineTerminal, Terminal } from "@/components/learn/parts";
import { loadManifest } from "@/lib/manifest";
import { browserRegistry, installCommand, PACKAGE_NAME, packageState, standardsVersion } from "@/lib/package-version";

export const metadata: Metadata = { title: "Onboard a repository" };

const STAND_DOWN = `git checkout -b redline/prove-stand-down
# in .github/workflows/redline.yml, change   stand-down: ''   to   stand-down: policy
git commit -am "test(redline): stand the policy job down"
git push -u origin redline/prove-stand-down
gh pr create --draft --title "Do not merge: prove a stand-down" --body-file .github/pull_request_template.md
gh pr checks --watch`;

export default async function Page() {
  const manifest = loadManifest();
  const state = await packageState();
  const hero = installCommand(state, "init --profile web-react");
  return (
    <DocsPage
      crumb="Onboard a repository"
      title="Onboard a repository"
      intro="Your team's rules only help if every assistant reads them and every pull request is checked against them. Onboarding puts both in place with one command, delivered as a pull request your team reviews like any other change."
      href="/docs/onboarding"
    >
      <p>
        This is the reference for onboarding your own repository: the full
        sequence, what it installs, and what to do when your token cannot do
        everything. New to Redline? The{" "}
        <Link href="/docs/learn">Learn path</Link> walks the same thing on a
        practice repository, one step at a time.
      </p>
      {/* Laid out as cli/ui/report.ts renders it, for a run whose token could not
          enable one capability. With a flag, init asks nothing. The file list is
          cut short: a real run writes one file per stack and per assistant. */}
      <CodeWindow title="terminal" copyText={hero}>
        <span className="tk-prompt">$</span> <span className="tk-white">{hero}</span>{"\n"}
        {"  "}profile <span className="tk-blue">web-react</span>{"\n"}
        {"\n"}
        {"  "}<span className="tk-bold">Files</span><span className="tk-dim">  … written</span>{"\n"}
        {"   "}<span className="tk-green">+</span> AGENTS.md{"\n"}
        {"   "}<span className="tk-green">+</span> CLAUDE.md{"\n"}
        {"   "}<span className="tk-green">+</span> .github/copilot-instructions.md{"\n"}
        {"   "}<span className="tk-dim">…</span>{"\n"}
        {"   "}<span className="tk-green">+</span> .github/workflows/redline.yml{"\n"}
        {"   "}<span className="tk-green">+</span> .github/pull_request_template.md{"\n"}
        {"   "}<span className="tk-green">+</span> .redline.json{"\n"}
        {"\n"}
        {"  "}<span className="tk-bold">Repository settings</span><span className="tk-dim">  … in place · 1 refused</span>{"\n"}
        {"   "}<span className="tk-green">✓ applied    </span> <span className="tk-bold">secret-scanning  </span>  <span className="tk-dim">secret scanning</span>{"\n"}
        {"   "}<span className="tk-green">✓ applied    </span> <span className="tk-bold">push-protection  </span>  <span className="tk-dim">secret scanning push protection</span>{"\n"}
        {"   "}<span className="tk-red">✗ denied     </span> <span className="tk-bold">dependency-alerts</span>  <span className="tk-dim">dependabot alerts (vulnerability alerts) (needs repository admin)</span>{"\n"}
        {"   "}<span className="tk-dim">…</span>{"\n"}
        {"\n"}
        {"  "}<span className="tk-bold">Pull request</span>{"\n"}
        {"   "}<span className="tk-blue">https://github.com/acme/checkout-service/pull/42</span>{"\n"}
        {"\n"}
        {"  "}<span className="tk-bold">What&apos;s left</span><span className="tk-dim">  1 for an administrator</span>{"\n"}
        {"   "}<span className="tk-red">1.</span> <span className="tk-bold">dependency-alerts</span> <span className="tk-dim">—</span> dependabot alerts (vulnerability alerts) (needs repository admin){"\n"}
        {"      "}<span className="tk-dim">→ ask a repository administrator to grant admin on this repository, then re-run: redline init --repair</span>
      </CodeWindow>

      <h2 id="before">Before you start</h2>
      <PackageBadge initial={state} registry={browserRegistry()} />
      <ul>
        <li>Node.js 18.11 or newer on the machine running the CLI.</li>
        <li>
          A git repository whose remote points at GitHub — including GitHub
          Enterprise Server, if the hostname contains <code>github</code> — or
          Azure DevOps. A self-hosted host on a hostname that carries neither is
          not auto-detected. No remote yet? <code>init</code> still installs the
          rules and the local review; the gate and host settings follow when you
          add one and run it again.
        </li>
        <li>
          The first run fetches the CLI for that one command:{" "}
          <code>npx {PACKAGE_NAME}@latest init</code>, or{" "}
          <code>pnpm dlx</code>, <code>yarn dlx</code> or <code>bunx</code>.
          The npm package is <code>{PACKAGE_NAME}</code>; the command it installs
          is <code>redline</code>. Let <code>init</code> pin it — answer yes when
          it asks, or pass <code>--pin-cli</code> — and it adds{" "}
          <code>{PACKAGE_NAME}</code> to <code>devDependencies</code> at that
          exact version in the same pull request. From then on every command
          runs the project&apos;s own copy, such as{" "}
          <RedlineCode args="verify" />, so the team, its assistants and its
          hooks all run one known Redline.
        </li>
      </ul>
      <p>
        Two versions appear in the output, and they are separate. The{" "}
        <b>package version</b> is the CLI release on npm. The{" "}
        <b>standards version</b> is the version of the rules themselves,
        currently <code>{standardsVersion()}</code>. Every rendered file names
        the standards version, so a repository can always say which rules it
        was given.
      </p>

      <h2 id="sequence">The whole sequence</h2>
      <p>
        <code>redline init</code> is one command, but onboarding is not one step.
        Step 4 is the one most often skipped, and skipping it leaves a
        repository that reports as onboarded while anyone with push access can
        still go around the gate.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>#</th><th>Step</th><th>Who</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><code>{installCommand(state, "init --dry-run")}</code> — read the plan. Writes nothing, needs no credential, contacts no host.</td>
              <td>anyone</td>
            </tr>
            <tr>
              <td>2</td>
              <td><code>{installCommand(state, "init")}</code> — files, whatever repository settings your token allows, and a pull request. Never a direct push.</td>
              <td>anyone with push</td>
            </tr>
            <tr>
              <td>3</td>
              <td>Review and merge that pull request. Until it merges, the gate exists only on its own branch.</td>
              <td>a reviewer</td>
            </tr>
            <tr>
              <td>4</td>
              <td><RedlineCode args="init --repair" /> with an <b>admin</b> token — applies the settings the first run was refused, which <code>.redline.json</code> lists under <code>pendingAdmin</code>, including the branch ruleset. See <a href="#after-merge">After the pull request merges</a>.</td>
              <td>repo admin</td>
            </tr>
            <tr>
              <td>5</td>
              <td><a href="#prove-it">Prove it</a> — watch the gate pass, block, and refuse to be waived.</td>
              <td>anyone with push</td>
            </tr>
            <tr>
              <td>6</td>
              <td>Soak at <code>observe</code>, then promote with <RedlineCode args="init --rung block-blocker" /> once recorded evidence supports it. A promotion the evidence does not support is refused — see the <Link href="/docs/enforcement">enforcement ladder</Link>.</td>
              <td>the team</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="callout">
        <p>
          <b>Step 4 is not optional cleanup.</b> A non-admin run installs the
          workflow and opens the pull request, so the gate <i>runs</i> — but no
          branch ruleset is applied, so nothing stops a push straight to the
          default branch. The repository looks onboarded on the dashboard and
          the gate can be walked around.
        </p>
      </div>

      <h2>What it installs</h2>
      <ul>
        <li><b>Rendered standards</b> for the detected profile, plus the review output contract, in the files each enabled assistant reads — <Link href="/docs/adaptors">Adaptors</Link> lists them per tool.</li>
        <li><b>Context sections</b>, where selected — background about how this repository works, rendered into the same artifacts as the rules and carrying no rule ids, because they are chosen per repository rather than by stack. Spec-first is on by default; TM Forum is opt-in.</li>
        <li><b>Security floor</b> — secret scanning with push protection and dependency alerts on the host, and dependency review plus a secret scan in the gate. Anything it could not enable is reported, not silently skipped. The floor fails the gate at every rung and no label waives it — see <Link href="/docs/gate">the gate</Link>.</li>
        <li><b>Merge gate, advisory</b> — the gate reports on every pull request as <code>redline-gate / gate</code>, and a branch ruleset requires a pull request to merge. Required approvals default to none (<code>--approvals</code>). Until the gate is a required check (<code>--blocking</code>), a red gate does not stop a merge. Once it is required, the <Link href="/docs/enforcement">rung</Link> decides what turns it red: at <code>observe</code>, only the security floor.</li>
        <li><b><code>.redline.json</code></b> — profile, vendors, menu choices, pending-admin list, and the standards/CLI versions that produced it. This is what makes the repo visible to central telemetry — read-only, no secret is ever written to the repo.</li>
      </ul>
      <PrivateRepo title="Dependency review needs GitHub Code Security">
        <p>
          On a public repository GitHub provides every part of the floor. On a
          private one, the gate&apos;s dependency review needs GitHub Code
          Security, and secret scanning with push protection needs GitHub Secret
          Protection. Without Code Security the dependency review job fails, and
          because it is on the floor it turns the gate red at every rung.{" "}
          <Link href="/docs/learn/onboard">Learn 01</Link> walks through the two
          ways to answer it.
        </p>
      </PrivateRepo>

      <h2 id="menu">Choosing what it installs</h2>
      <p>
        Every choice has a default, and <code>init</code> asks about the ones
        that matter when run interactively. Each is also a flag, and each is
        recorded in <code>.redline.json</code> so the next run keeps it.{" "}
        <Link href="/docs/cli/init">redline init</Link> lists every flag. The
        two that deserve a decision before you run it are{" "}
        <a href="#gate-source">where the gate lives</a> and, if you protect the
        gate with <code>CODEOWNERS</code>,{" "}
        <a href="#owners">who owns it</a>.
      </p>

      <h2 id="owners">Name an owner that exists</h2>
      <p>
        <code>--with review-ownership</code> is the mitigation for a{" "}
        <a href="#gate-source">vendored gate</a>, and the single most common way
        to install it wrong is to accept the default owner.
      </p>
      <p>
        GitHub <b>ignores a <code>CODEOWNERS</code> owner it cannot resolve</b>,
        and it does so without erroring: no failed push, no warning in the UI.
        The file installs, the ruleset requires code-owner review, and the review
        is required of nobody. That is worse than not installing it, because the
        dashboard now says the control is on.
      </p>
      <ul>
        <li>
          <b>A team must be written <code>@org/team</code></b> and must actually
          exist. A bare <code>@platform-engineering</code> is read as a{" "}
          <i>user</i>, and a user that does not exist makes GitHub mark the whole
          file erroneous — at which point <code>require_code_owner_review</code>{" "}
          degrades to the silent no-op above.
        </li>
        <li>
          <b>A repository under a personal account has no teams at all.</b>{" "}
          <code>@you/platform-engineering</code> cannot exist there, so pass your
          own handle: <code>--review-owners @you</code>.
        </li>
        <li>
          <code>redline verify</code> reports <code>review-ownership</code>, which
          resolves every owner in the file against the host. It is the check that
          tells an enforcing <code>CODEOWNERS</code> from a decorative one.
        </li>
      </ul>
      <h2 id="gate-source">Where the gate lives</h2>
      <p>
        By default the caller workflow Redline writes references a reusable
        workflow published once at <code>&lt;org&gt;/.github</code>. One merge
        there reaches every onboarded repository, and the gate sits outside the
        blast radius of the pull requests it judges — nobody raising a pull
        request can change the thing reviewing it.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>On GitHub, publish it once before the first repository onboards.</b>{" "}
          Copy <code>workflows/redline-gate.yml</code> into your organisation&apos;s{" "}
          <code>.github</code> repository as{" "}
          <code>.github/workflows/redline-gate.yml</code>, so{" "}
          <code>uses: &lt;org&gt;/.github/.github/workflows/redline-gate.yml@main</code>{" "}
          resolves for every repo that follows. The secret-scan action ships
          pinned to a full commit SHA, and <code>scripts/check-pins.mjs</code>{" "}
          keeps it honest. Azure DevOps needs no equivalent step:{" "}
          <code>redline init</code> writes the whole pipeline template into the
          repository as <code>.azuredevops/redline-gate.yml</code>.
        </p>
      </div>
      <p>
        Most organisations do not have that repository on day one, and
        &ldquo;go and get a shared <code>.github</code> repo created&rdquo; is a
        long way to travel before finding out whether any of this is worth
        having. So <code>--gate-source local</code> vendors the gate into the
        repository itself at{" "}
        <code>.github/workflows/redline-gate.yml</code> and points the caller at
        it. It is the same file the organisation copy is published from. The
        required check name does not change — a local reusable workflow still
        reports as <code>redline-gate / gate</code> — so rulesets, branch policy
        and <code>redline verify</code> are identical either way, and moving
        between the two is a re-run with a different flag.
      </p>
      <div className="callout">
        <p>
          <b>A vendored gate is the weaker control, not an equal one.</b> A
          workflow triggered by <code>pull_request</code> runs from the pull
          request&apos;s own head commit, so a pull request that edits{" "}
          <code>.github/workflows/redline-gate.yml</code> changes the gate
          judging it — including standing down the dependency and secret jobs,
          which are the two checks no label can waive. Protect{" "}
          <code>.github/workflows/</code> with{" "}
          <code>--with review-ownership --review-owners &lt;team&gt;</code> so
          that edit needs an owner&apos;s approval, and move to{" "}
          <code>--gate-source org</code> once the organisation publishes a gate.
        </p>
      </div>
      <p>
        A vendored gate is a copy, so it does not update itself the way the
        organisation one does. Raising <code>{PACKAGE_NAME}</code> in{" "}
        <code>devDependencies</code> does not change it either: only{" "}
        <code>init</code> rewrites it. To take a newer gate, bump the
        dependency, run <RedlineCode args="init" /> and merge the pull request —
        the same update as <Link href="/docs/learn/next-steps">Learn 10</Link>{" "}
        describes. <code>redline verify --repo &lt;owner/name&gt;</code> reports
        a <code>gate-vendored</code> check comparing the version stamped in the
        file against the CLI running the check.
      </p>
      <p>
        A profile is the set of stacks whose rules a repository gets. One
        repository can combine several: <code>--profile web,infra</code>{" "}
        renders a React app&apos;s rules and its Terraform rules together. See{" "}
        <Link href="/docs/profiles">Profiles &amp; stacks</Link> for the full
        table.
      </p>

      <h2 id="permissions">When your token cannot do everything</h2>
      <p>
        The engineer running <code>redline init</code> usually is not a
        repository admin. That is expected. The files always land and the pull
        request always opens; only the repository settings that need admin are
        refused. The command still exits <code>0</code>.
      </p>
      <p>
        Each setting in the <b>Repository settings</b> part of the report, and
        in <code>verify</code>, is in one of these states:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>State</th><th>Means</th><th>What to do</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><code>applied</code>, <code>already</code></td>
              <td>The setting is on.</td>
              <td>Nothing.</td>
            </tr>
            <tr>
              <td><code>denied</code></td>
              <td>The host refused it, usually for lack of admin. It is recorded in <code>.redline.json</code> under <code>pendingAdmin</code>.</td>
              <td>An admin runs <RedlineCode args="init --repair" />.</td>
            </tr>
            <tr>
              <td><code>unsupported</code></td>
              <td>This repository cannot have it, for example a feature its plan or licence does not include.</td>
              <td>Nothing an admin can do; it is not recorded as admin work.</td>
            </tr>
            <tr>
              <td><code>unknown</code></td>
              <td>The host gave no clear answer, usually because a token without admin cannot see the setting.</td>
              <td>Read it again with an admin token: <RedlineCode args="verify" />.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Verify</h2>
      <p>
        <code>verify</code> reads back what the host actually has and compares it
        with what <code>.redline.json</code> says was installed. It asks the
        host, so it needs <code>gh auth login</code> or <code>GH_TOKEN</code>.
      </p>
      <RedlineTerminal
        commands="{redline} verify"
        output={`ok    onboarded              profile web-react, standards v${manifest.version}
ok    capabilities           every capability selected
ok    merge-policy           policy is advisory as configured, 0 approval(s), code-owner review off
ok    gate-machinery         .github/workflows/redline.yml publishes redline-gate / gate
ok    check-name-reported    no required check configured yet (advisory gate) — PR #42 reported: redline-gate / gate
ok    security-floor         security floor enabled
ok    artifacts-current      rendered artifacts match standards v${manifest.version}
ok    review-ownership       no CODEOWNERS on this host
ok    commands-current       slash commands match what this CLI renders
ok    pull-request-template  .github/pull_request_template.md — maintained inside REDLINE markers
FAIL  pending-admin          partially onboarded — an administrator must still enable: dependency-alerts`}
      />
      <p>
        Eleven checks, each named after what it reads. Three are worth knowing
        before you see them: <code>check-name-reported</code> passes rather
        than fails on a repository with no pull request yet — a fresh repo is
        not drifted, it is new; <code>review-ownership</code> resolves every
        owner in <code>CODEOWNERS</code> against the host, which is what tells an
        enforcing file from a decorative one; and <code>pending-admin</code> is
        the one that stays red until a person acts. Run it on demand, or wire{" "}
        <code>redline verify --gate</code> into CI — the same checks, exiting
        non-zero on failure. <Link href="/docs/troubleshooting">Troubleshooting</Link>{" "}
        has what <code>ok</code>, <code>FAIL</code> and <code>??</code> each
        oblige you to do. Once the gate is required (<code>--blocking</code>),{" "}
        <code>check-name-reported</code> becomes a real assertion: a required
        name nothing reports is the{" "}
        <Link href="/docs/troubleshooting#waiting-for-status">
          &ldquo;waiting for status&rdquo; hang
        </Link>
        .
      </p>

      <h2 id="after-merge">After the pull request merges</h2>
      <p>
        Merging installs the files. It does not grant the permissions the first
        run was refused, and a plain re-run will not retry them — a capability
        already recorded as pending is treated as settled, which is exactly what{" "}
        <code>--repair</code> exists to override. Run it with a token that has
        repository admin:
      </p>
      <RedlineTerminal commands="{redline} init --repair" />
      <p>
        Everything under <code>pendingAdmin</code> in <code>.redline.json</code>{" "}
        is retried, the <b>Repository settings</b> section of the report shows
        each one as <code>applied</code> or still <code>denied</code>, and the
        file is rewritten with what actually stuck.
      </p>
      <div className="callout">
        <p>
          <b>Approvals are your choice.</b> Redline&apos;s job is to fail the
          pipeline, so a new onboarding requires no approving review: a solo
          engineer can merge their own pull request once the checks pass. To
          require reviews, run <RedlineCode args="init --approvals 1" /> (or any
          number up to 10). The count is recorded as{" "}
          <code>requiredApprovals</code> in <code>.redline.json</code>, and a
          later run keeps it unless you pass the flag again.
        </p>
      </div>
      <p>
        Everything up to this point proves the gate is <i>installed</i>; only a
        pull request the gate actually stopped proves it is a gate. That is the{" "}
        <a href="#prove-it">last section</a>.
      </p>

      <h2>Exit codes</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Code</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr><td>0</td><td>Success.</td></tr>
            <tr><td>1</td><td>The thing being checked is wrong — verification failed, drift found.</td></tr>
            <tr><td>2</td><td>Usage error — bad flag, unknown profile, not a git repository.</td></tr>
            <tr><td>3</td><td>Permission denied outright — nothing could be done at all.</td></tr>
            <tr><td>4</td><td>Host or network error.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        <code>3</code> is for total failure only. A partial permission failure is
        the normal path above: exit <code>0</code>, with the refusals reported.
      </p>

      <h2 id="limitations">Known limitations</h2>
      <ul>
        <li>
          The gate installs advisory-only on both hosts. Promoting it is a
          deliberate second step on the{" "}
          <Link href="/docs/enforcement">enforcement ladder</Link>, after a soak
          period.
        </li>
        <li>
          <code>redline sync</code> runs from a checkout of the Redline source
          repository, not from a product repo, and only reaches repositories in
          the register — see{" "}
          <Link href="/docs/distribution">Distribution &amp; drift</Link>. One
          that is not in it picks up a standards change by bumping{" "}
          <code>{PACKAGE_NAME}</code> and re-running <code>redline init</code>.
        </li>
        <li>
          No offline single-file executable yet, which matters for air-gapped
          Azure agents without npm registry access.
        </li>
      </ul>

      <h2 id="prove-it">Prove it</h2>
      <p>
        A merge gate that never runs looks exactly like a merge gate that finds
        nothing: both are green. The difference shows up on the pull request you
        needed it to stop, which is the worst moment to find out. So before you
        trust the gate, watch it pass, block, and refuse to be waived — on a
        branch you throw away.
      </p>
      <p>
        The <Link href="/docs/learn">Learn path</Link> shows most of that on a
        real pull request. Run the same on your repository, or at least confirm
        each line:
      </p>
      <ul>
        <li>
          <b>A failing process check does not fail the gate at <code>observe</code>.</b>{" "}
          <Link href="/docs/learn/first-finding">Learn 02</Link>.
        </li>
        <li>
          <b>The security floor fails the gate at every rung, label or not.</b>{" "}
          <Link href="/docs/learn/security-floor">Learn 06</Link>.
        </li>
        <li>
          <b>The gate stops the merge once it is required.</b>{" "}
          <Link href="/docs/learn/required-gate">Learn 07</Link>.
        </li>
        <li>
          <b>The <code>redline-exempt</code> label alone is refused.</b> Without a{" "}
          <code>## Redline exemption</code> block it fails at a blocking rung.{" "}
          <Link href="/docs/learn/exemptions">Learn 08</Link>.
        </li>
        <li>
          <b>A BLOCKER fails the gate at <code>block-blocker</code>.</b> The same
          finding that merged at <code>observe</code>.{" "}
          <Link href="/docs/learn/earn-a-rung">Learn 09</Link>.
        </li>
      </ul>

      <h3 id="prove-stand-down">A stood-down job reads as a pass</h3>
      <p>
        The one behaviour the Learn path does not show. When a repository
        already runs a tool that covers one of the gate&apos;s jobs,{" "}
        <code>init</code> writes that job into <code>stand-down:</code> in the
        caller, and the job is skipped. The aggregate must read a skip as a
        pass — if it fails instead, the repository is punished for narrowing the
        gate to match tooling it already runs. Check it on a throwaway branch:
      </p>
      <Terminal commands={STAND_DOWN} />
      <p>
        <b>Expected:</b> <code>Deterministic policy</code> reports{" "}
        <b>skipped</b>, and <code>gate</code> passes. If the aggregate fails on
        a skip, do not stand anything down until it is fixed. Close the pull
        request without merging and delete the branch.
      </p>

      <h3 id="prove-vendored">What a branch can change about its own gate</h3>
      <div className="callout">
        <p>
          The rung and the stand-down list are inputs in the caller,{" "}
          <code>.github/workflows/redline.yml</code>, and the caller runs from
          the pull request&apos;s own head commit. A pull request can therefore
          change both for itself — on an organisation gate as much as a
          vendored one. Learn 09 uses exactly that to try a blocking rung on a
          branch.
        </p>
        <p>
          The job definitions are different. With{" "}
          <code>--gate-source org</code> they live in{" "}
          <code>&lt;org&gt;/.github</code>, and a pull request here cannot reach
          them. With a <a href="#gate-source">vendored gate</a> they are in{" "}
          <code>.github/workflows/redline-gate.yml</code>, so a pull request can
          edit the secret-scan job — one of the two checks no label can waive —
          and the gate judging it will run the edited copy.
        </p>
        <p>
          The mitigation is the <code>/.github/workflows/</code> entry in{" "}
          <code>.github/CODEOWNERS</code>, and{" "}
          <b>it does nothing until the branch ruleset is applied</b> — admin
          work a non-admin <code>redline init</code> leaves in{" "}
          <code>pendingAdmin</code> (<a href="#after-merge">step 4</a>). Until
          then, anyone with push access can do this on purpose.
        </p>
      </div>
      <p>
        Run these again after promoting a rung, after moving between{" "}
        <code>--gate-source local</code> and <code>org</code>, and after standing
        a job down or{" "}
        <Link href="/docs/gate#adding-a-check">adding one of your own</Link>.
      </p>
    </DocsPage>
  );
}
