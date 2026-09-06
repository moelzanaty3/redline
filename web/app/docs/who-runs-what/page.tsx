import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { Tiers } from "@/components/tiers";
import "../../tiers.css";

export const metadata: Metadata = { title: "Who runs what" };

export default function Page() {
  return (
    <DocsPage
      crumb="Who runs what"
      title="Who runs what"
      intro="redline --help prints nine commands as one flat list. They are not one thing: they run in four different places, under three different credentials, with three different blast radii. This page is that map, with the file and the environment variable for each."
      href="/docs/who-runs-what"
    >
      <p>
        Redline writes into repositories and walks an organisation. Anything that
        does that owes you an exact account of what it can reach. Every claim
        below names the file it comes from, so you can check it rather than
        believe it.
      </p>

      <Tiers />

      <h2>Tier 1 — you, on your own machine, in one repository</h2>
      <p>
        <code>redline init</code>, <code>redline verify</code>,{" "}
        <code>redline review</code> and <code>redline remove</code>. You run
        them from a checkout, in your own shell.
      </p>
      <ul>
        <li>
          <b>Credential:</b> your own git auth, and nothing else.{" "}
          <code>cli/platforms/github/client.ts</code> resolves{" "}
          <code>GH_TOKEN ?? GITHUB_TOKEN</code> from the environment and falls
          back to <code>gh auth token</code>. Redline never mints a credential,
          never stores one, and never writes one into the repository —{" "}
          <code>.redline.json</code> records the profile, the vendors, the menu
          choices and the pending-admin list, and no secret.
        </li>
        <li>
          <b>Reach:</b> the one repository you are standing in. Both{" "}
          <code>init</code> and <code>remove</code> land as a{" "}
          <b>pull request</b>, not a push.
        </li>
        <li>
          <b>It cannot</b> reach a second repository, and it cannot act on the
          organisation. Estate-wide work is <code>sync</code> and{" "}
          <code>metrics</code>, which are Tier 3 and refuse to be useful without
          a token you had to create yourself.
        </li>
        <li>
          <b>Without repo-admin rights it still works.</b> Whatever your token
          cannot reach comes back <code>denied</code>, is recorded in{" "}
          <code>.redline.json</code>, and <code>redline verify</code> reports{" "}
          <b>partially onboarded</b> with the list an administrator still has to
          enable. Nothing is silently skipped.
        </li>
      </ul>

      <h3>
        <code>redline review</code> needs no token at all
      </h3>
      <p>
        The default <code>embedded</code> engine calls no model: it emits the
        bounded prompt for the assistant that is already running the command.
        The <code>api</code> engine calls an endpoint — and its
        OpenAI-compatible default base URL is{" "}
        <code>http://localhost:11434/v1</code>, which is Ollama&apos;s.{" "}
        <code>cli/review/engines/api.ts</code> treats <code>localhost</code>,{" "}
        <code>127.0.0.1</code> and <code>[::1]</code> as local and skips the API
        key requirement entirely — the comment on that branch reads{" "}
        <i>&ldquo;a local endpoint legitimately needs no key&rdquo;</i>. Point it
        at a local model and your diff does not leave the machine.
      </p>
      <CodeWindow
        title="terminal — no key, no network egress"
        copyText="redline review --engine api --model qwen2.5-coder:14b"
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">
          redline review --engine api --model qwen2.5-coder:14b
        </span>
        {"\n"}
        <span className="tk-dim">
          {"  endpoint  http://localhost:11434/v1   (local — no API key required)"}
        </span>
        {"\n"}
        <span className="tk-dim">
          {"  local findings are excluded from rule-tuning telemetry"}
        </span>
      </CodeWindow>
      <p>
        A remote endpoint is the opposite case and is treated as one: without a
        key the run <b>fails</b> rather than sending an unauthenticated request
        that would break confusingly at the far end. See{" "}
        <Link href="/docs/local-review">Reviewing before you push</Link>.
      </p>

      <h2>Tier 2 — the onboarded repository&apos;s own CI</h2>
      <p>
        <code>redline policy</code> and <code>redline exempt</code>. You do not
        run these; the gate does, via{" "}
        <code>workflows/redline-gate.yml</code> — hosted in the org{" "}
        <code>.github</code> repository and called by the thin{" "}
        <code>.github/workflows/redline.yml</code> each onboarded repo carries.
        Both are invoked as{" "}
        <code>npx --yes redlinegate@&lt;pinned version&gt;</code>.
      </p>
      <ul>
        <li>
          <b>Credential:</b> the run&apos;s own repo-scoped{" "}
          <code>GITHUB_TOKEN</code>. The whole grant is the workflow&apos;s
          declared block, and it is three lines long.
        </li>
        <li>
          <b>Reach:</b> the pull request it was triggered by, in its own
          repository. A repo-scoped token cannot address another repository, so
          neither can the gate.
        </li>
        <li>
          <b>No model call.</b> <code>redline policy</code> evaluates only the
          deterministic rule tier and exits 1 on a finding at or above the
          rung&apos;s floor. The reviewing model, wherever it runs, is a separate
          concern from the gate.
        </li>
      </ul>
      <CodeWindow title="workflows/redline-gate.yml — the entire grant">
        <span className="tk-white">permissions:</span>
        {"\n"}
        {"  "}
        <span className="tk-white">contents:</span>{" "}
        <span className="tk-green">read</span>
        {"\n"}
        {"  "}
        <span className="tk-white">pull-requests:</span>{" "}
        <span className="tk-amber">write</span>
        <span className="tk-dim">{"   # to post findings on this PR"}</span>
      </CodeWindow>

      <h2>Tier 3 — the platform team, on a schedule</h2>
      <p>
        Two credentials, and the distinction between them is the reason this page
        exists. Neither is created by <code>redline init</code>: a human on the
        platform team makes them and stores them as secrets on a central
        repository. Onboarding a repository grants Redline nothing.
      </p>

      <h3>
        Read-only: <code>REDLINE_ORG_READ_TOKEN</code>
      </h3>
      <p>
        The entire measurement plane runs on it —{" "}
        <code>redline metrics collect | dashboard | digest | inbox | baseline |
        roi | correlate | context | score-seeds</code> and{" "}
        <code>redline registry</code>, driven by{" "}
        <code>redline-collect.yml</code>, <code>dashboard.yml</code>,{" "}
        <code>inbox.yml</code>, <code>weekly-digest.yml</code>,{" "}
        <code>verify-onboarding.yml</code> and{" "}
        <code>.github/workflows/registry.yml</code>. It observes the estate and
        writes nothing to it. <code>redline-collect.yml</code> says so at the
        point of use: <i>&ldquo;Read-only: repo metadata + pull requests across
        the org. No write scope.&rdquo;</i>
      </p>
      <div className="callout ok">
        <span className="ic">✓</span>
        <p>
          Telemetry was deliberately moved <b>central</b>. The previous design
          ran a collector in every onboarded repo, which meant storing a
          cross-repo write token as a secret in every one of them.{" "}
          <code>scripts/collect-telemetry.mjs</code> records the reason in its
          header: <i>one central read token in one repo has a far smaller blast
          radius</i>. That is why onboarding grants Redline no write access to
          anything.
        </p>
      </div>
      <p>
        Those workflows do declare <code>contents: write</code> or{" "}
        <code>pages: write</code> in places — <code>redline-collect.yml</code>{" "}
        commits the collected JSONL, <code>registry.yml</code> commits{" "}
        <code>registry.json</code>, the dashboard and inbox publish to Pages.
        Those permissions apply to the <b>central repository the job runs in</b>,
        never to the repositories being measured. The only credential that
        reaches out across the estate on those jobs is the read token.
      </p>

      <h3>
        Narrowly-scoped write: <code>REDLINE_SYNC_TOKEN</code>
      </h3>
      <p>
        One workflow, one command: <code>workflows/redline-sync.yml</code>{" "}
        running <code>redline sync</code>. Its required scope is documented
        inline where the secret is consumed —{" "}
        <code>contents:write</code>, <code>pull_requests:write</code>,{" "}
        <code>workflows:write</code> on target repos, the last because pushing{" "}
        <code>.github/workflows/redline.yml</code> is otherwise rejected.
      </p>
      <ul>
        <li>
          <b>It opens pull requests.</b> The header of that file is explicit:
          standards are distributed{" "}
          <i>&ldquo;never as direct pushes, and never as a merge&rdquo;</i>. What
          a repository does with its sync pull request is the repository&apos;s
          decision.
        </li>
        <li>
          <b>Its targets are derived, not listed.</b> They come from{" "}
          <code>registry.json</code>, discovered nightly from the{" "}
          <code>.redline.json</code> each onboarded repo carries. A repository
          that runs <code>redline remove</code> leaves the register and stops
          being a target without anyone editing a list.
        </li>
        <li>
          <b>It refuses to distribute stale artifacts.</b> The job runs{" "}
          <code>render-self.mjs --check</code> before it opens anything.
        </li>
      </ul>

      <h3>
        A third, deliberately separate one: <code>REDLINE_CANARY_TOKEN</code>
      </h3>
      <p>
        <code>workflows/seed-canary.yml</code> opens a throwaway pull request of
        known-bad code against a canary repo weekly to regression-test the
        reviewer itself. That needs write access, so it gets its own token, and
        the file says exactly how far it goes:
      </p>
      <CodeWindow title="workflows/seed-canary.yml — header">
        <span className="tk-dim">
          {"#   secrets.REDLINE_CANARY_TOKEN   contents:write + pull_requests:write on the canary"}
        </span>
        {"\n"}
        <span className="tk-dim">
          {"#                                  repos ONLY. Never an org-wide token."}
        </span>
      </CodeWindow>
      <p>
        Three write-capable credentials could have been one. They are three
        because a token that can do everything is a token nobody can reason
        about.
      </p>

      <h2>Tier 4 — Redline&apos;s own maintainers</h2>
      <p>
        <code>scripts/validate.mjs</code>,{" "}
        <code>scripts/assign-rule-ids.mjs</code>,{" "}
        <code>scripts/render-self.mjs</code> and{" "}
        <code>scripts/check-pins.mjs</code>, run by{" "}
        <code>.github/workflows/ci.yml</code> and <code>release.yml</code> in
        this repository. They act on this repository&apos;s own{" "}
        <code>standards/</code> and pinned actions — Redline enforced on Redline.
        Nobody installs the CLI to run them, and they need no credential beyond
        the CI run&apos;s own.
      </p>
      <p>
        <code>check-pins.mjs</code> is the only one that needs network: it
        re-resolves every SHA-pinned third-party action against the tag its
        trailing comment claims. It runs as its own CI job here, and{" "}
        <b>only here</b> — the gate references it in a comment explaining where
        its own pin is reviewed, but does not invoke it in your repository.
      </p>

      <h2>What this means for you</h2>
      <div className="callout ok">
        <span className="ic">✓</span>
        <p>
          <b>Does my code leave my machine?</b> Not for a local review. With{" "}
          <code>--engine api</code> pointed at a local endpoint, no key is asked
          for and no diff is sent anywhere; the default <code>embedded</code>{" "}
          engine calls no model at all. If you configure a hosted endpoint, your
          diff goes to that endpoint — that is your choice, made per run, and the
          CLI names the endpoint it is calling.
        </p>
      </div>
      <div className="callout ok">
        <span className="ic">✓</span>
        <p>
          <b>What can Redline do to my other repositories?</b> Nothing. Tier 1
          and Tier 2 are single-repository by construction. Estate-wide write
          exists only as <code>redline sync</code>, which runs from a central
          repository under <code>REDLINE_SYNC_TOKEN</code> — a token your
          platform team created, scoped and stored. It opens pull requests; it
          does not push to a default branch, and it does not merge.
        </p>
      </div>
      <div className="callout warn">
        <span className="ic">⚠</span>
        <p>
          <b>The honest caveats.</b> The workflow files above are the GitHub
          ones. The CLI onboards and verifies on{" "}
          <b>GitHub and Azure DevOps</b> both, but the scheduled measurement and
          sync plane is GitHub-only today — see{" "}
          <Link href="/docs/telemetry">Telemetry &amp; validation</Link>.{" "}
          <code>redline-sync.yml</code> and <code>verify-onboarding.yml</code>{" "}
          are <b>active</b> where a platform team has installed them and created
          the tokens, so <code>sync</code> is a real cross-repository write on a
          GitHub estate — scoped and pull-request-only as described above, but
          not hypothetical. On Azure DevOps both report a registered repository
          as <b>unsupported</b> rather than skipping it silently, so an Azure
          repository is measured and synced by nothing today.
        </p>
      </div>
      <p>
        If you want the repository-level view instead —{" "}
        what <code>init</code> installs and what it asks an administrator for —
        see <Link href="/docs/onboarding">Onboard a repository</Link>, and{" "}
        <Link href="/docs/removing">Removing Redline</Link> for taking it back
        out.
      </p>
    </DocsPage>
  );
}
