import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Who runs what" };

const LOCAL_REVIEW = "redline review --engine api --provider openai --model qwen2.5-coder:14b";

type Actor = {
  who: string;
  where: string;
  runs: string;
  credential: string;
  reach: string;
};

// One row per credential. The point of the page is that each one is separate
// and can be reasoned about alone, so two jobs that share a token share a row.
const ACTORS: Actor[] = [
  {
    who: "You",
    where: "Your machine, in one checkout",
    runs: "init, verify, review, remove",
    credential: "Your own GitHub auth",
    reach: "The one repository you are in. init and remove open a pull request; they do not push.",
  },
  {
    who: "The merge gate",
    where: "The onboarded repository's CI, on each pull request",
    runs: "policy, exempt",
    credential: "The run's own GITHUB_TOKEN",
    reach: "The pull request that triggered it, in that repository only.",
  },
  {
    who: "Platform team: measure",
    where: "Scheduled, in the source repository and redline-metrics",
    runs: "metrics, registry, verify",
    credential: "REDLINE_ORG_READ_TOKEN",
    reach: "Every repository in the org, read-only. It writes nothing to them.",
  },
  {
    who: "Platform team: distribute",
    where: "The source repository, on a change to standards/",
    runs: "sync",
    credential: "REDLINE_SYNC_TOKEN",
    reach: "Every registered repository, and only by opening a pull request.",
  },
  {
    who: "Platform team: test the reviewer",
    where: "redline-metrics, weekly",
    runs: "seed-canary.yml",
    credential: "REDLINE_CANARY_TOKEN",
    reach: "The canary repositories only.",
  },
  {
    who: "Redline maintainers",
    where: "This repository's CI",
    runs: "The four source-check scripts",
    credential: "The CI run's own token",
    reach: "This repository only.",
  },
];

export default function Page() {
  return (
    <DocsPage
      crumb="Who runs what"
      title="Who runs what"
      intro="Every place Redline runs, the credential it holds there, and how far that credential reaches."
      href="/docs/who-runs-what"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>For the platform team</b> setting up or auditing Redline, and for
          any engineer who wants to know what Redline can touch before they
          onboard.
        </p>
      </div>

      <h2>The model in one table</h2>
      <p>
        Redline writes into repositories and reads across an organisation, so it
        owes you an exact account of its <b>blast radius</b>: what each
        credential could reach if it were misused or leaked. Each row below holds
        a different credential, and none can do another row&apos;s job.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Who</th>
              <th>Runs where</th>
              <th>Runs</th>
              <th>Credential</th>
              <th>Can reach</th>
            </tr>
          </thead>
          <tbody>
            {ACTORS.map((a) => (
              <tr key={a.who}>
                <td>
                  <b>{a.who}</b>
                </td>
                <td>{a.where}</td>
                <td>{a.runs}</td>
                <td>
                  <code>{a.credential}</code>
                </td>
                <td>{a.reach}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Three things follow from it:</p>
      <ul>
        <li>
          <b>Onboarding grants Redline nothing.</b> No product repository holds a
          Redline secret. The central tokens are created by a person on the
          platform team, never by <code>redline init</code>.
        </li>
        <li>
          <b>The widest credential is read-only.</b> Only the measurement token
          reaches every repository, and it cannot write.
        </li>
        <li>
          <b>Nothing pushes to your default branch.</b> Every write into a product
          repository arrives as a pull request.
        </li>
      </ul>
      <p>The sections below give the evidence for each row.</p>

      <h2>You, on your own machine</h2>
      <p>
        <code>redline init</code>, <code>redline verify</code>,{" "}
        <code>redline review</code> and <code>redline remove</code> run in your
        shell, from a checkout.
      </p>
      <ul>
        <li>
          <b>Credential:</b> your own GitHub auth and nothing else.{" "}
          <code>cli/platforms/github/client.ts</code> reads{" "}
          <code>GH_TOKEN</code>, then <code>GITHUB_TOKEN</code>, then falls back
          to <code>gh auth token</code>. Redline never creates or stores a
          credential. <code>.redline.json</code> records your choices, not a
          secret.
        </li>
        <li>
          <b>Reach:</b> the repository you are in. It cannot reach a second
          repository or act on the organisation.
        </li>
        <li>
          <b>Without admin rights it still works.</b> Whatever your token cannot
          change is recorded for an administrator rather than skipped — see{" "}
          <Link href="/docs/onboarding">Onboard a repository</Link>.
        </li>
      </ul>
      <p>
        Six more commands need no credential and contact no host:{" "}
        <code>status</code>, <code>explain</code>, <code>doctor</code>,{" "}
        <code>evidence</code> (writes only <code>.redline.json</code>),{" "}
        <code>funnel</code> (a file under <code>~/.redline</code>, off by
        default) and <code>completion</code>.
      </p>

      <h3>Does a local review send my code anywhere?</h3>
      <p>
        Not unless you choose an endpoint that does. The default{" "}
        <code>embedded</code> engine calls no model: it prints a prompt for the
        assistant already running the command.
      </p>
      <p>
        The <code>api</code> engine calls an endpoint. For the{" "}
        <code>openai</code> provider the default is{" "}
        <code>http://localhost:11434/v1</code>, a local Ollama server.{" "}
        <code>cli/review/engines/api.ts</code> asks for no API key when the
        endpoint is <code>localhost</code>, <code>127.0.0.1</code> or{" "}
        <code>[::1]</code>. With a local model, the diff stays on your machine:
      </p>
      <CodeWindow title="terminal" copyText={LOCAL_REVIEW}>
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">{LOCAL_REVIEW}</span>
      </CodeWindow>
      <p>
        A remote endpoint with no key fails instead of sending an
        unauthenticated request. See{" "}
        <Link href="/docs/local-review">Reviewing before you push</Link>.
      </p>

      <h2>The merge gate, in your repository&apos;s CI</h2>
      <p>
        You do not run <code>redline policy</code> or{" "}
        <code>redline exempt</code>. The <Link href="/docs/gate">merge gate</Link>{" "}
        does: <code>workflows/redline-gate.yml</code>, called on each pull
        request by the thin <code>.github/workflows/redline.yml</code> that{" "}
        <code>redline init</code> installs.
      </p>
      <ul>
        <li>
          <b>Credential:</b> the run&apos;s own <code>GITHUB_TOKEN</code>, which
          GitHub scopes to one repository. The gate&apos;s whole grant is below.
        </li>
        <li>
          <b>Reach:</b> the pull request that triggered it. A repository-scoped
          token cannot address another repository.
        </li>
        <li>
          <b>No model call.</b> <code>redline policy</code> checks only the{" "}
          <Link href="/docs/deterministic">deterministic rules</Link>, the ones
          a program can decide. AI review is a separate concern.
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
      </CodeWindow>

      <h2>The platform team, on a schedule</h2>
      <p>
        Three central tokens, each created and stored by a person on the
        platform team. They could have been one token. They are three so that
        each can be reasoned about on its own.
      </p>

      <h3>
        Measure: <code>REDLINE_ORG_READ_TOKEN</code>
      </h3>
      <p>
        Read-only. It runs <code>redline metrics</code> and{" "}
        <code>redline registry</code> from <code>redline-collect.yml</code>,{" "}
        <code>dashboard.yml</code>, <code>inbox.yml</code>,{" "}
        <code>weekly-digest.yml</code>, <code>verify-onboarding.yml</code> and{" "}
        <code>.github/workflows/registry.yml</code>.{" "}
        <code>redline-collect.yml</code> states it where the token is used:{" "}
        <i>&ldquo;Read-only: repo metadata + pull requests across the org. No
        write scope.&rdquo;</i>
      </p>
      <p>
        Some of these workflows declare <code>contents: write</code>,{" "}
        <code>pages: write</code> or <code>issues: write</code>. Those apply to
        the central repository the job runs in, through the run&apos;s own
        token: committing telemetry, publishing a page, opening a tracking
        issue. They never apply to the repositories being measured.
      </p>
      <div className="callout ok">
        <span className="ic">✓</span>
        <p>
          <b>Why measurement is central.</b> A collector in every repository
          would need a cross-repository token stored in every one of them. One
          read token in one central repository has a far smaller blast radius.
        </p>
      </div>

      <h3>
        Distribute: <code>REDLINE_SYNC_TOKEN</code>
      </h3>
      <p>
        One workflow, <code>workflows/redline-sync.yml</code>, running{" "}
        <code>redline sync</code>. The file documents its scope where the
        secret is used: <code>contents</code>, <code>pull_requests</code> and{" "}
        <code>workflows</code> write on each target repository.
      </p>
      <ul>
        <li>
          <b>It only opens pull requests.</b> The file&apos;s header: standards
          are distributed{" "}
          <i>&ldquo;never as direct pushes, and never as a merge&rdquo;</i>.
          Merging is the repository&apos;s decision.
        </li>
        <li>
          <b>Its targets are derived, not listed.</b> They come from{" "}
          <code>registry.json</code>, rebuilt nightly from the{" "}
          <code>.redline.json</code> each onboarded repository carries. A
          repository that runs <code>redline remove</code> drops out without
          anyone editing a list.
        </li>
        <li>
          <b>It refuses to distribute stale files.</b> The job runs{" "}
          <code>render-self.mjs --check</code> before it opens anything.
        </li>
      </ul>
      <p>
        More on <Link href="/docs/distribution">Distribution and drift</Link>.
      </p>

      <h3>
        Test the reviewer: <code>REDLINE_CANARY_TOKEN</code>
      </h3>
      <p>
        <code>workflows/seed-canary.yml</code> opens a throwaway pull request of
        known-bad code on a canary repository each week, to check the reviewer
        still catches it — see <Link href="/docs/seeds">Seeded corpus</Link>.
        That needs write access, so it gets its own token, and the file limits
        it:
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

      <h2>Redline&apos;s own maintainers</h2>
      <p>
        <code>.github/workflows/ci.yml</code> runs the four source checks —{" "}
        <code>validate.mjs</code>, <code>assign-rule-ids.mjs</code>,{" "}
        <code>render-self.mjs</code> and <code>check-pins.mjs</code> — on this
        repository. <code>release.yml</code> runs the first three again before
        a publish. They need no credential beyond the CI run&apos;s own.
      </p>
      <p>
        Only <code>check-pins.mjs</code> uses the network. It compares each
        pinned action and image with the tag its comment names, and checks the
        gate&apos;s <code>redlinegate</code> version against npm. It runs here
        and nowhere else; the gate never runs it in your repository. All of them
        are on <Link href="/docs/scripts">Maintainer scripts</Link>.
      </p>

      <h2>Limits</h2>
      <div className="callout warn">
        <span className="ic">⚠</span>
        <p>
          The workflows on this page are GitHub Actions, and they reach GitHub
          repositories only. The CLI onboards and verifies Azure DevOps
          repositories by hand, but the register is discovered from GitHub,{" "}
          <code>redline sync</code> refuses an Azure entry as unsupported, and{" "}
          <code>verify-onboarding.yml</code> checks GitHub entries only. Today,
          nothing on a schedule measures or syncs an Azure repository — see{" "}
          <Link href="/docs/telemetry">Telemetry &amp; validation</Link>.
        </p>
      </div>
      <p>
        For what <code>redline init</code> installs in one repository, see{" "}
        <Link href="/docs/onboarding">Onboard a repository</Link>. To take it
        back out, see <Link href="/docs/removing">Removing Redline</Link>.
      </p>
    </DocsPage>
  );
}
