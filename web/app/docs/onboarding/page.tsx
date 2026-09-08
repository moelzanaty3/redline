import type { Metadata } from "next";
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
            <tr><td><code>--repair</code></td><td>off</td><td>Re-applies capabilities a plain re-run treats as already settled — the fix once an administrator grants rights a read can never confirm on its own.</td></tr>
            <tr><td><code>--no-a11y</code></td><td>on</td><td>Recorded in <code>.redline.json</code>; doesn&apos;t change what&apos;s rendered yet.</td></tr>
            <tr><td><code>--speckit</code> / <code>--no-speckit</code></td><td>on</td><td>Renders the spec-first context section into the standards artifacts. Dropped automatically, with a note in the report, where the repository already runs Spec Kit — that is a separate tool with its own installer, and Redline neither creates nor edits its files. <code>--no-speckit</code> on a later run removes a section already rendered.</td></tr>
            <tr><td><code>--tmf</code> / <code>--no-tmf</code></td><td>off</td><td>Renders the TM Forum context section — resource naming, <code>@type</code>/<code>@baseType</code>, offset/limit paging, the TMF error body. Ask for it only in a repository that actually implements TMF interfaces.</td></tr>
            <tr><td><code>--with review-ownership</code></td><td>off</td><td>Seeds <code>.github/CODEOWNERS</code> and lets the ruleset require code-owner review. Off by default because the generated file names an owner Redline cannot prove exists, and requiring review from an unresolvable owner blocks every pull request in the repository.</td></tr>
          </tbody>
        </table>
      </div>
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
