import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Installation" };

export default function Page() {
  return (
    <DocsPage
      crumb="Installation"
      title="Installation"
      intro="Roll Redline out to an organisation in eight steps. Pilot one repo per stack, validate against the seeded corpus, then widen team by team — never big-bang."
      href="/docs/installation"
    >
      <h2>1. Push the source repo</h2>
      <p>
        Push the bundle to <code>&lt;org&gt;/redline</code>. It is the single
        source of truth for standards, workflows, rulesets and templates.
      </p>

      <h2>2. Install the reusable gate</h2>
      <p>
        Copy <code>workflows/redline-gate.yml</code> into your org&apos;s{" "}
        <code>.github</code> repo as{" "}
        <code>.github/workflows/redline-gate.yml</code> so <code>uses:</code>{" "}
        resolves org-wide. The secret-scan action ships pinned to a full commit
        SHA; <code>scripts/check-pins.mjs</code> keeps it honest.
      </p>

      <h2>3. Create the metrics repo</h2>
      <p>
        Create <code>redline-metrics</code> with{" "}
        <code>workflows/redline-collect.yml</code>,{" "}
        <code>workflows/weekly-digest.yml</code> and their scripts. Telemetry is
        pulled centrally — read-only.
      </p>

      <h2>4. Set secrets and variables</h2>
      <p>No Redline secret is ever stored in a product repo.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Name</th><th>Lives in</th><th>Scope</th></tr>
          </thead>
          <tbody>
            <tr><td>REDLINE_SYNC_TOKEN</td><td>source repo</td><td>contents:write, pull_requests:write, workflows:write on target repos</td></tr>
            <tr><td>REDLINE_ORG_READ_TOKEN</td><td>source + metrics repo</td><td>read-only: metadata, contents, pull requests</td></tr>
            <tr><td>TEAMS_WEBHOOK_URL</td><td>metrics repo</td><td>Power Automate flow URL</td></tr>
            <tr><td>PAGES_VISIBILITY_ACKNOWLEDGED</td><td>source repo (variable)</td><td><code>private</code> or <code>internal</code> — the inbox refuses to build otherwise</td></tr>
          </tbody>
        </table>
      </div>

      <h2>5. Apply the org ruleset</h2>
      <p>
        Create the custom repository property <code>redline</code> in org
        settings, then apply <code>rulesets/redline-org-ruleset.json</code>{" "}
        once. One human approval, thread resolution and the required gate check
        — no per-repo drift.
      </p>

      <h2>6. Pilot one repo per stack</h2>
      <CodeWindow
        title="terminal"
        copyText={`scripts/setup-repo.sh acme/web-shop-checkout web\nscripts/setup-repo.sh acme/web-shop-checkout --verify`}
      >
        <span className="tk-prompt">$</span> <span className="tk-white">scripts/setup-repo.sh acme/web-shop-checkout web</span>{"\n"}
        <span className="tk-dim"># merge the sync PR, then prove the gate is real:</span>{"\n"}
        <span className="tk-prompt">$</span> <span className="tk-white">scripts/setup-repo.sh acme/web-shop-checkout --verify</span>
      </CodeWindow>
      <div className="callout">
        <span className="ic">⚠</span>
        <p>
          <b>Verify before you trust.</b> The most common silent failure is a
          required check whose name nothing reports — every PR waits forever on
          “Expected”. The name <code>redline-gate / gate</code> is asserted in
          three places: the ruleset JSON, CI validation, and{" "}
          <code>--verify</code>, which reads the check names GitHub actually
          reported on a real PR.
        </p>
      </div>

      <h2>7. Validate with the seeded corpus</h2>
      <p>
        Open a PR adding <code>seeded/&lt;stack&gt;/</code> and{" "}
        <code>seeded/clean/</code>, then score it. Target:{" "}
        <b>100% BLOCKER recall, zero comments on clean code</b>. Record both in
        the changelog. Close the PR — never merge it.
      </p>
      <CodeWindow
        title="terminal"
        copyText="GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/web-shop-checkout --pr 12"
      >
        <span className="tk-prompt">$</span> <span className="tk-white">GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/web-shop-checkout --pr 12</span>
      </CodeWindow>

      <h2>8. Widen, then evolve from data</h2>
      <p>
        Onboard by team, not big-bang. Tune the standards from telemetry — per
        rule id, per stack, per week. A standards change with no measurement is
        an opinion.
      </p>
    </DocsPage>
  );
}
