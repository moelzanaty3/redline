import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Onboard a repository" };

export default function Page() {
  return (
    <DocsPage
      crumb="Onboard a repository"
      title="Onboard a repository"
      intro="One command per repo. It enables the security floor, applies the branch ruleset, and opens a sync PR with the rendered standards for the repo's profile."
      href="/docs/onboarding"
    >
      <CodeWindow
        title="terminal"
        copyText="scripts/setup-repo.sh <org>/<repo> <profile>"
      >
        <span className="tk-prompt">$</span> <span className="tk-white">scripts/setup-repo.sh acme/checkout-service service-node</span>{"\n"}
        <span className="tk-green">✓</span> <span className="tk-dim">security floor</span>      secret scanning · push protection · dependabot · dependency review{"\n"}
        <span className="tk-green">✓</span> <span className="tk-dim">branch ruleset</span>      1 human approval · thread resolution · <span className="tk-blue">redline-gate / gate</span>{"\n"}
        <span className="tk-green">✓</span> <span className="tk-dim">labels + property</span>  redline-exempt · custom property: redline{"\n"}
        <span className="tk-green">✓</span> <span className="tk-dim">standards synced</span>    profile: service-node → copilot · AGENTS.md · claude
      </CodeWindow>

      <h2>What it does</h2>
      <ul>
        <li><b>Security floor</b> — enables secret scanning with push protection, Dependabot alerts and security updates; reports anything it could not enable.</li>
        <li><b>Branch ruleset</b> — applies <code>rulesets/redline-ruleset.json</code>: one human approval, last-push approval, thread resolution, and the required <code>redline-gate / gate</code> check.</li>
        <li><b>Standards sync</b> — opens a PR with the rendered artifacts for the chosen profile. The team reviews and merges it like any other change.</li>
        <li><b>CODEOWNERS</b> — seeds coverage of the enforcement surface so nobody can weaken their own gate unreviewed. Seeded once, never overwritten.</li>
      </ul>

      <h2>Pick a profile</h2>
      <p>
        A repo installs exactly one profile — see{" "}
        <b>Profiles &amp; stacks</b> for the full table. Common choices:{" "}
        <code>web</code>, <code>service-node</code>, <code>service-java</code>,{" "}
        <code>mobile-rn</code>, <code>infra</code>.
      </p>

      <h2>Verify</h2>
      <CodeWindow
        title="terminal"
        copyText="scripts/setup-repo.sh <org>/<repo> --verify"
      >
        <span className="tk-prompt">$</span> <span className="tk-white">scripts/setup-repo.sh acme/checkout-service --verify</span>{"\n"}
        <span className="tk-green">✓</span> <span className="tk-dim">verified</span>  <span className="tk-blue">redline-gate / gate</span> reported on a real PR — the gate is live
      </CodeWindow>
      <p>
        <code>--verify</code> reads the check names GitHub actually reported on
        a real pull request. Run it after the first PR on every onboarded repo;{" "}
        <code>workflows/verify-onboarding.yml</code> re-checks every repo weekly
        and opens an issue on drift.
      </p>
    </DocsPage>
  );
}
