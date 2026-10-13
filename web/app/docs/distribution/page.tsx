import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineTerminal, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Distribution and drift" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Distribution and drift"
      intro="A standards change is worth nothing until it reaches the repositories it is for, and a repository that quietly stops matching is worse than one that never onboarded. This page is how changes travel, and how a repository that falls behind is noticed."
      href="/docs/distribution"
    >
      <h2>What has to travel</h2>
      <p>
        Onboarding writes a copy of the standard into each repository: <code>AGENTS.md</code>,
        the assistant instruction files, the gate&apos;s caller workflow. A copy does not update
        itself. When the standard changes, or a new <code>redlinegate</code> release fixes the
        gate, each repository needs a pull request that rewrites its copy. There are two ways to
        get one.
      </p>

      <h2>One repository: update it yourself</h2>
      <p>
        Raise <code>redlinegate</code> in the repository&apos;s <code>devDependencies</code> to the
        new version with your package manager, then on a branch:
      </p>
      <RedlineTerminal
        commands={`{redline} status
{redline} init --no-commit`}
      />
      <p>
        <code>status</code> says <code>behind</code> when the rendered rules differ from the
        installed version. <code>init</code> keeps every choice recorded in{" "}
        <code>.redline.json</code> and rewrites the generated files. Raising the version alone is
        not enough: the files are copies, and only <code>init</code> replaces them. Commit, open a
        pull request, merge. <Link href="/docs/learn/next-steps">Learn step 10</Link> does it end to
        end.
      </p>

      <h2>The whole estate: sync</h2>
      <p>
        An organisation with many repositories does not ask each team to remember. The team that
        owns Redline runs <code>sync</code>, which opens the same pull request on every registered
        repository that is behind, quoting the version it moves from and to. It is an estate
        command: it runs <b>from a checkout of the Redline source repository</b>, in the{" "}
        <code>Redline Sync</code> workflow when a change to <code>standards/</code> lands on <code>main</code>, or by hand. Run
        from a product repository it fails with <code>no registry.json</code>.
      </p>
      <Terminal
        commands={`# from a checkout of the Redline source repository
npm ci
npm run build
node dist/bin/redline.js sync --dry-run`}
      />
      <p>
        <code>--dry-run</code> prints the whole plan and writes nothing; <code>--repo
        owner/name</code> narrows it to one repository. Three properties, each a way this could
        have gone wrong:
      </p>
      <ul>
        <li>
          <b>Your content survives.</b> The render is seeded with the target&apos;s current files,
          so everything a team wrote above a <code>REDLINE:BEGIN</code> marker is untouched.
          Rendering into an empty directory would produce a correct-looking{" "}
          <code>AGENTS.md</code> that deleted every repository&apos;s own context section at once.
        </li>
        <li>
          <b>The branch rebuilds from your default branch</b>, never from a stale sync branch, so
          an unmerged pull request from an older standards version cannot carry its changes
          forward.
        </li>
        <li>
          <b>An open sync pull request is updated, not duplicated.</b> A scheduled job that opens a
          new pull request every night is one nobody reads.
        </li>
      </ul>
      <p>
        Sync <b>never merges</b> and never pushes to a default branch. It makes the change
        available; merging is the repository&apos;s decision.
      </p>

      <h3>The register decides who gets one</h3>
      <p>
        Sync only reaches repositories listed in <code>registry.json</code>. The register is{" "}
        <b>derived, never maintained</b>: a nightly job in the source repository walks the
        organisation for repositories carrying a <code>.redline.json</code> and writes what it
        finds. An entry exists exactly as long as that file does, so a repository that removes
        Redline leaves the register on the next run without anyone editing a list. A repository
        onboarded since the last run is not a target until the next one.
      </p>

      <h3 id="sync-exemption">A sync pull request exempts itself, for 30 days</h3>
      <p>
        A sync diff is generated, so the launch-readiness checklist and the ADR rule do not fit
        it. Rather than being a special case in the gate, the pull request carries the{" "}
        <code>redline-sync</code> label and a real{" "}
        <Link href="/docs/exemptions">exemption block</Link>, scoped to <code>checklist, adr</code>{" "}
        and expiring <b>30 days</b> after it was opened. One rule for everyone is worth more than a
        convenience for the tool that wrote the rule. It also means that, at a blocking rung,{" "}
        <b>a sync pull request nobody merges starts failing its own gate</b>, which is what
        should happen to a standards change a repository is quietly refusing.
      </p>

      <h2>Not merging is a decision, and it is visible</h2>
      <p>
        A repository that ignores its sync pull requests drifts. Besides the expiring exemption,
        the weekly drift sweep runs <code>verify --repo owner/name</code> against every registered
        repository and opens <b>one</b> tracking issue, updated in place, naming everything that
        has drifted: a hand-edited ruleset, a renamed caller job, push protection switched off,
        artifacts left stale.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Remote verification reports <code>??</code> for a check that genuinely needs a working
          tree, never <code>ok</code>. Reporting a check that never executed as passing produces a{" "}
          <b>false all-clear across the whole estate at once</b>. An <code>??</code> also never
          fails a repository on its own: failing on the absence of evidence trains an operator to
          ignore the weekly issue.
        </p>
      </div>

      <h2>Outstanding</h2>
      <p>
        Sync and remote verify are <b>GitHub-only</b> today. A registered Azure DevOps repository
        is reported as unsupported rather than skipped silently. On Azure DevOps, update a
        repository yourself, as above.
      </p>
    </DocsPage>
  );
}
