import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Onboard a repository" };

export default function Page() {
  return (
    <DocsPage
      crumb="Onboard a repository"
      title="Onboard a repository"
      intro="One command per repo. redline detects GitHub or Azure DevOps from your git remote, installs the floor, and opens a pull request — never a direct push."
      href="/docs/onboarding"
    >
      <CodeWindow title="terminal" copyText="npx redline-cli init">
        <span className="tk-prompt">$</span> <span className="tk-white">npx redline-cli init</span>{"\n"}
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
            <tr><td><code>--no-a11y</code></td><td>on</td><td>Recorded in <code>.redline.json</code>; doesn&apos;t change what&apos;s rendered yet.</td></tr>
            <tr><td><code>--speckit</code></td><td>off</td><td>Recorded in <code>.redline.json</code>; no scaffolding lands yet.</td></tr>
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
          <code>pendingAdmin</code> and <b>unsupported</b> are different
          things. A denied capability goes in <code>pendingAdmin</code> — an
          admin can grant it later. Azure DevOps Advanced Security is
          separately licensed; an unlicensed repository reports it as{" "}
          <code>unsupported</code>, not <code>pendingAdmin</code> — no admin
          action clears it, so it doesn&apos;t sit on the dashboard forever
          demanding one.
        </p>
      </div>

      <h2>Verify</h2>
      <CodeWindow title="terminal" copyText="npx redline-cli verify">
        <span className="tk-prompt">$</span> <span className="tk-white">npx redline-cli verify</span>{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">onboarded</span>              profile web, standards v0.0.1{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">merge-policy</span>           policy is advisory, config says advisory{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">check-name-reported</span>    <span className="tk-blue">redline-gate / gate</span> reported on PR #42{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">security-floor</span>         security floor enabled{"\n"}
        <span className="tk-green">ok</span>  <span className="tk-dim">artifacts-current</span>      rendered artifacts match standards v0.0.1{"\n"}
        <span className="tk-red">FAIL</span> <span className="tk-dim">pending-admin</span>          partially onboarded — an administrator must still enable: dependency-alerts
      </CodeWindow>
      <p>
        Five checks: the repo is onboarded at all; the required check name has
        actually been reported on a real pull request (skipped, not failed, on
        a repo with no PR yet — a fresh repo isn&apos;t drifted, it&apos;s
        just new); the live merge policy matches the menu; the security floor
        is still on; and rendered artifacts aren&apos;t stale. Run it on
        demand, or wire <code>redline verify --gate</code> into CI — it&apos;s
        the same checks, exiting non-zero on failure.
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
