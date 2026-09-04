import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Distribution and drift" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Distribution and drift"
      intro="A standards change is worth nothing until it reaches the estate, and an estate that quietly stops matching is worse than one that never onboarded. Three moving parts keep both honest."
      href="/docs/distribution"
    >
      <h2>The register knows who is onboarded</h2>
      <p>
        <code>registry.json</code> is <b>derived, never maintained</b>. A nightly
        job walks the organisation for repositories carrying a{" "}
        <code>.redline.json</code> and writes what it finds. An entry exists
        exactly as long as that file does, so a repository that removes Redline
        leaves the register on the next run without anyone editing a list.
      </p>
      <p>
        Its predecessor was a hand-maintained text file. It lost its only writer,
        then was deleted, and the dashboard&apos;s coverage figure quietly went
        absent for months — which is why the bundle self-check now fails the build
        if the register&apos;s machinery goes missing again.
      </p>

      <h2>Sync makes the change available</h2>
      <p>
        A push to <code>standards/</code> opens one pull request on every
        registered repository that is behind, quoting the version it moves from
        and to.
      </p>
      <CodeWindow
        title="terminal"
        copyText="npx redline-cli sync --dry-run"
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx redline-cli sync --dry-run</span>
        <span className="tk-dim">{"   # the whole plan, writing nothing"}</span>
      </CodeWindow>
      <p>Three properties, each a way this could have gone wrong:</p>
      <ul>
        <li>
          <b>Your content survives.</b> The render is seeded with the target&apos;s
          current files, so everything a team wrote above a{" "}
          <code>REDLINE:BEGIN</code> marker is untouched. Rendering into an empty
          directory would produce a correct-looking <code>AGENTS.md</code> that
          deleted every repository&apos;s own context section at once.
        </li>
        <li>
          <b>The branch rebuilds from your default branch</b>, never from a stale
          sync branch — so an unmerged pull request from an older standards
          version cannot carry its changes forward.
        </li>
        <li>
          <b>An open sync pull request is updated, not duplicated.</b> A scheduled
          job that opens a new pull request every night is one nobody reads.
        </li>
      </ul>
      <p>
        Sync <b>never merges</b> and never pushes to a default branch. It makes
        the change available; merging is the repository&apos;s decision.
      </p>

      <h2>Not merging is a decision, and it is visible</h2>
      <p>
        A repository that ignores its sync pull requests drifts. Two things make
        that impossible to miss rather than a slow silence:
      </p>
      <ul>
        <li>
          The sync pull request carries its own{" "}
          <Link href="/docs/exemptions">exemption</Link>, and it expires after 30
          days — so <b>a sync pull request nobody merges starts failing its own
          gate</b>.
        </li>
        <li>
          The weekly drift sweep runs{" "}
          <code>redline verify --repo owner/name</code> against every registered
          repository and opens <b>one</b> tracking issue, updated in place, naming
          everything that has drifted — a hand-edited ruleset, a renamed caller
          job, push protection switched off, artifacts left stale.
        </li>
      </ul>

      <h2>A check that could not run says so</h2>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Remote verification reports <code>??</code> for a check that genuinely
          needs a working tree, never <code>ok</code>. Reporting a check that
          never executed as passing produces a <b>false all-clear across the whole
          estate at once</b>. An <code>??</code> also never fails a repository on
          its own — failing on the absence of evidence trains an operator to
          ignore the weekly issue.
        </p>
      </div>

      <h2>Outstanding</h2>
      <p>
        Sync and remote verify are <b>GitHub-only</b> today. A registered Azure
        DevOps repository is reported as unsupported rather than skipped silently,
        and the distribution story is not complete until it exists.
      </p>
    </DocsPage>
  );
}
