import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { loadManifest } from "@/lib/manifest";

export const metadata: Metadata = { title: "Onboard a repository" };

export default function Page() {
  const manifest = loadManifest();
  return (
    <DocsPage
      crumb="Onboard a repository"
      title="Onboard a repository"
      intro="One command per repo. redline detects GitHub or Azure DevOps from your git remote, installs the floor, and opens a pull request — never a direct push."
      href="/docs/onboarding"
    >
      <CodeWindow title="terminal" copyText="npx redlinegate init">
        <span className="tk-prompt">$</span> <span className="tk-white">npx redlinegate init</span>{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">profile</span>              web{"\n"}
        <span className="tk-dim">  write  AGENTS.md</span>{"\n"}
        <span className="tk-dim">  write  CLAUDE.md</span>{"\n"}
        <span className="tk-dim">  write  .github/copilot-instructions.md</span>{"\n"}
        <span className="tk-green">applied</span>     secret-scanning{"\n"}
        <span className="tk-green">applied</span>     push-protection{"\n"}
        <span className="tk-amber">denied</span>      dependency-alerts  needs admin{"\n"}
        <span className="tk-amber">⚠</span> <span className="tk-dim">partially onboarded</span> — an administrator must still enable: dependency-alerts{"\n"}
        <span className="tk-dim">pull request: https://github.com/acme/checkout-service/pull/42</span>
      </CodeWindow>

      <h2 id="sequence">The whole sequence</h2>
      <p>
        <code>redline init</code> is one command, but onboarding is not one step.
        Steps 4 and 5 are the ones most often skipped, and skipping them leaves a
        repository that reports as onboarded and enforces nothing.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>#</th><th>Step</th><th>Who</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><code>npx redlinegate init --dry-run</code> — read the plan. Writes nothing, needs no credential, contacts no host.</td>
              <td>anyone</td>
            </tr>
            <tr>
              <td>2</td>
              <td><code>npx redlinegate init</code> — files, whatever repository settings your token allows, and a pull request. Never a direct push.</td>
              <td>anyone with push</td>
            </tr>
            <tr>
              <td>3</td>
              <td>Review and merge that pull request. Until it merges, the gate exists only on its own branch.</td>
              <td>a reviewer</td>
            </tr>
            <tr>
              <td>4</td>
              <td><code>npx redlinegate init --repair</code> with an <b>admin</b> token — applies everything the first run recorded in <code>pendingAdmin</code>, including the branch ruleset that makes the check required.</td>
              <td>repo admin</td>
            </tr>
            <tr>
              <td>5</td>
              <td><Link href="/docs/verification">Run the nine verification scenarios</Link> — watch the gate pass, block, and refuse to be waived.</td>
              <td>anyone with push</td>
            </tr>
            <tr>
              <td>6</td>
              <td>Soak at <code>observe</code>, then promote: <code>redline init --rung warn</code>, later <code>block-blocker</code>. A promotion the recorded evidence does not support is refused.</td>
              <td>the team</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="callout">
        <p>
          <b>Step 4 is not optional cleanup.</b> A non-admin run installs the
          workflow and opens the pull request, so the gate <i>runs</i> — but
          nothing marks its check required, and no ruleset requires an approval.
          Every check can be clicked past. The repository looks onboarded on the
          dashboard and a merge is still one button.
        </p>
      </div>

      <h2>What it installs — the floor, no opt-out</h2>
      <ul>
        <li><b>Rendered standards</b> for the detected profile, plus the review output contract — Copilot, AGENTS.md, CLAUDE.md, Cursor, whichever vendors the manifest enables.</li>
        <li><b>Context sections</b>, where selected — background about how this repository works, rendered into the same artifacts as the rules and carrying no rule ids, because they are chosen per repository rather than by stack. Spec-first is on by default; TM Forum is opt-in.</li>
        <li><b>Security floor</b> — secret scanning with push protection and dependency alerts; anything it couldn&apos;t enable is reported, not silently skipped.</li>
        <li><b>Merge-readiness gate, advisory</b> — one human approval always, plus the required check name. It reports; it does not block, until promoted deliberately.</li>
        <li><b><code>.redline.json</code></b> — profile, vendors, menu choices, pending-admin list, and the standards/CLI versions that produced it. This is what makes the repo visible to central telemetry — read-only, no secret is ever written to the repo.</li>
      </ul>

      <h2>Menu — offered, defaulted, skippable</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Flag</th><th>Default</th><th>Effect in Phase 1</th></tr>
          </thead>
          <tbody>
            <tr><td><code>--blocking</code></td><td>off</td><td>Promotes the gate from advisory to blocking.</td></tr>
            <tr><td><code>--profile &lt;name&gt;</code></td><td>detected</td><td>Overrides stack detection.</td></tr>
            <tr><td><code>--vendors &lt;list&gt;</code></td><td>detected</td><td>Comma-separated vendor ids (<code>copilot,agents,claude,cursor</code>) to render for — overrides detection and any recorded selection; a vendor the org has not enabled never renders regardless.</td></tr>
            <tr><td><code>--dry-run</code></td><td>off</td><td>Prints the plan — files, repository settings, resolved menu — and exits; writes nothing, needs no credential.</td></tr>
            <tr><td><code>--no-commit</code></td><td>off</td><td>Writes the files into your working tree and stops: no repository setting is changed, no branch is made, nothing is committed and no pull request is opened. Needs no credential and contacts no host, so it works offline — which also means an org-sourced caller is written without confirming the organisation publishes the gate it references. Review the diff, commit it, then run <code>redline init</code> to apply the settings and open the pull request.</td></tr>
            <tr><td><code>--gate-source org|local</code></td><td><code>org</code></td><td>Where the gate machinery lives. <code>org</code> references the reusable workflow published at <code>&lt;org&gt;/.github</code>. <code>local</code> vendors a copy into this repository at <code>.github/workflows/redline-gate.yml</code>, for a repository whose organisation has no shared <code>.github</code> repo yet. Either way the required check stays <code>redline-gate / gate</code>, so a repository can move between them with a re-run. Omitting the flag keeps whatever the repository already recorded.</td></tr>
            <tr><td><code>--repair</code></td><td>off</td><td>Re-applies capabilities a plain re-run treats as already settled — the fix once an administrator grants rights a read can never confirm on its own.</td></tr>
            <tr><td><code>--no-a11y</code></td><td>on</td><td>Recorded in <code>.redline.json</code>; doesn&apos;t change what&apos;s rendered yet.</td></tr>
            <tr><td><code>--speckit</code> / <code>--no-speckit</code></td><td>on</td><td>Renders the spec-first context section into the standards artifacts. Dropped automatically, with a note in the report, where the repository already runs Spec Kit — that is a separate tool with its own installer, and Redline neither creates nor edits its files. <code>--no-speckit</code> on a later run removes a section already rendered.</td></tr>
            <tr><td><code>--tmf</code> / <code>--no-tmf</code></td><td>off</td><td>Renders the TM Forum context section — resource naming, <code>@type</code>/<code>@baseType</code>, offset/limit paging, the TMF error body. Ask for it only in a repository that actually implements TMF interfaces.</td></tr>
            <tr><td><code>--with review-ownership</code></td><td>off</td><td>Seeds <code>.github/CODEOWNERS</code> and lets the ruleset require code-owner review. Off by default because the generated file names an owner Redline cannot prove exists, and requiring review from an unresolvable owner blocks every pull request in the repository.</td></tr>
            <tr><td><code>--review-owners &lt;list&gt;</code></td><td><code>@&lt;org&gt;/platform-engineering</code></td><td>Who owns the paths seeded into <code>CODEOWNERS</code> — a team, a user or an email, comma-separated. <b>Set this.</b> See below: the default is a guess, and a wrong owner fails silently.</td></tr>
            <tr><td><code>--rung &lt;name&gt;</code></td><td><code>observe</code></td><td><code>observe</code>, <code>warn</code>, <code>block-blocker</code>, <code>block-high</code>. A promotion the repository&apos;s recorded evidence does not support is refused; a demotion is always allowed.</td></tr>
            <tr><td><code>--skip &lt;list&gt;</code> / <code>--with &lt;list&gt;</code></td><td>—</td><td>Capabilities this repository does not want Redline to install, because it has its own. A deselected capability is not attempted, not written and not reported as missing. The security floor is refused by name rather than deselected.</td></tr>
            <tr><td><code>--integrations &lt;list&gt;</code></td><td>detected</td><td>Controls you already run (<code>sonarqube,snyk,mend,dependabot,renovate,gitleaks,trufflehog,codeql</code>). This is what writes <code>stand-down:</code> into the caller — from what you declared, never from detection alone, because detection reads a checkout and cannot see a scanner wired through a shared pipeline template.</td></tr>
            <tr><td><code>--setup &lt;list&gt;</code></td><td>off</td><td>Controls to install alongside Redline: <code>dependabot</code>, <code>renovate</code>, <code>codeql</code>. Only what works with no account and no token. An existing file is never overwritten.</td></tr>
            <tr><td><code>--pipeline &lt;name&gt;</code></td><td>detected</td><td><code>github-actions</code> or <code>azure-pipelines</code> — what actually runs this repository&apos;s pull request checks. Asked separately from the host, because the two come apart: a repository on GitHub can be built entirely by Azure Pipelines, and installing an Actions workflow there gates nothing.</td></tr>
            <tr><td><code>--branches &lt;patterns&gt;</code></td><td>default branch</td><td>Which branches the merge policy governs, in the host&apos;s own syntax. Widening this widens an enforcement boundary, so it is never detected for you.</td></tr>
            <tr><td><code>--adopt-caller</code></td><td>off</td><td>Lets Redline take over gate machinery already at its path when what is there carries nothing attributing it to Redline — a 2.1 caller, in practice. Without it the run refuses rather than clobbering somebody&apos;s workflow.</td></tr>
          </tbody>
        </table>
      </div>

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
        organisation one does. <code>redline verify</code> reports a{" "}
        <code>gate-vendored</code> check comparing the version stamped in the
        file against the CLI running the check;{" "}
        <code>redline init --repair</code> brings it level.
      </p>
      <p>
        A repo installs exactly one profile — see <b>Profiles &amp; stacks</b>{" "}
        for the full table.
      </p>

      <h2>Permission degradation is the normal path</h2>
      <p>
        The engineer running <code>redline init</code> usually doesn&apos;t
        have repo admin. The command never aborts part-way: file-level work
        always lands, and the pull request always opens. Refused settings are
        recorded under <code>pendingAdmin</code> in <code>.redline.json</code>,
        and the command still exits <code>0</code>.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <code>pendingAdmin</code>, <b>unsupported</b> and <b>unknown</b> are
          three different things. A denied capability goes in{" "}
          <code>pendingAdmin</code> — an admin can grant it later. Azure
          DevOps Advanced Security is separately licensed; an unlicensed
          repository reports it as <code>unsupported</code>, not{" "}
          <code>pendingAdmin</code> — no admin action clears it, so it
          doesn&apos;t sit on the dashboard forever demanding one. A read the
          host answered with neither a yes nor a definite no — a 401/403 it
          cannot tell apart from a genuine refusal — reports{" "}
          <code>unknown</code> instead, and is treated the same way: an
          indeterminate read is never filed as admin work either.
        </p>
      </div>

      <h2>Verify</h2>
      <CodeWindow title="terminal" copyText="npx redlinegate verify">
        <span className="tk-prompt">$</span> <span className="tk-white">npx redlinegate verify</span>{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">onboarded</span>              profile web, standards v{manifest.version}{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">merge-policy</span>           policy is advisory, config says advisory{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">gate-machinery</span>         .github/workflows/redline.yml publishes redline-gate / gate{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">check-name-reported</span>    no required check configured yet (advisory gate) — PR #42 reported: <span className="tk-blue">redline-gate / gate</span>{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">security-floor</span>         security floor enabled{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">artifacts-current</span>      rendered artifacts match standards v{manifest.version}{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">pull-request-template</span>  .github/pull_request_template.md — maintained inside REDLINE markers{"\n"}
        <span className="tk-red">FAIL</span> <span className="tk-dim">pending-admin</span>          partially onboarded — an administrator must still enable: dependency-alerts
      </CodeWindow>
      <p>
        Eight checks: the repo is onboarded at all; the live merge policy
        matches the menu; the machinery that would run the gate is actually in
        place; the required check name has actually been reported on a real
        pull request (skipped, not failed, on a repo with no PR yet — a fresh
        repo isn&apos;t drifted, it&apos;s just new); the security floor is
        still on; rendered artifacts aren&apos;t stale; the pull request
        template the host would actually serve is intact; and nothing is
        still waiting on an administrator. Run it on demand, or wire{" "}
        <code>redline verify --gate</code> into CI — it&apos;s the same
        checks, exiting non-zero on failure.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          The sample above is the default <b>advisory</b> install, where
          nothing is marked required yet, so{" "}
          <code>check-name-reported</code> only confirms the check is being
          reported at all. Onboard with <code>--blocking</code> and GitHub
          gets a real required check named <code>redline-gate / gate</code>{" "}
          — from then on this line reads{" "}
          <code>required checks reported on PR #42: redline-gate / gate</code>{" "}
          on success, and fails outright if that check is required but never
          reported.
        </p>
      </div>

      <h2 id="after-merge">After the pull request merges</h2>
      <p>
        Merging installs the files. It does not grant the permissions the first
        run was refused, and a plain re-run will not retry them — a capability
        already recorded as pending is treated as settled, which is exactly what{" "}
        <code>--repair</code> exists to override.
      </p>
      <CodeWindow title="terminal" copyText="npx redlinegate init --repair">
        <span className="tk-prompt">$</span> <span className="tk-white">npx redlinegate init --repair</span>{"\n"}
        <span className="tk-green">applied</span>     secret-scanning{"\n"}
        <span className="tk-green">applied</span>     push-protection{"\n"}
        <span className="tk-green">applied</span>     dependency-alerts{"\n"}
        <span className="tk-green">applied</span>     merge-policy       branch ruleset — <span className="tk-blue">redline-gate / gate</span> required{"\n"}
        <span className="tk-green">applied</span>     repo-property      redline=onboarded
      </CodeWindow>
      <p>
        Run it with a token that has repository admin. Everything under{" "}
        <code>pendingAdmin</code> in <code>.redline.json</code> is retried, and the
        file is rewritten with what actually stuck.
      </p>
      <div className="callout">
        <p>
          <b>The approval trap.</b> The ruleset requires one approving review, and
          GitHub does not let you approve your own pull request. On a repository
          with one active maintainer, the ruleset you just applied will block your
          next pull request with no way forward from inside the repository.
        </p>
        <p>
          That is the policy working as designed — one human approval, always —
          but decide it deliberately rather than discovering it. If you work
          solo, add yourself as a bypass actor on the <code>Redline</code>{" "}
          ruleset. It is a real weakening and it is visible in the ruleset, which
          is the right place for it to be visible.
        </p>
      </div>
      <p>
        Then <Link href="/docs/verification">run the verification scenarios</Link>.
        Everything up to this point proves the gate is <i>installed</i>; only a
        pull request that the gate actually stopped proves it is a gate.
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
        <code>3</code> is for total failure. A partial permission failure is
        the normal path above and exits <code>0</code> with a{" "}
        <code>pendingAdmin</code> report — that&apos;s what keeps{" "}
        <code>redline init</code> from ever aborting part-way.
      </p>
    </DocsPage>
  );
}
