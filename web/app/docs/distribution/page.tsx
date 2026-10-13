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
      intro="A standards change is worth nothing until it reaches the repositories it is for. This page covers how changes travel, and how a repository that falls behind gets noticed."
      href="/docs/distribution"
    >
      <h2>Why changes have to travel</h2>
      <p>
        Onboarding writes a copy of the standard into each repository: <code>AGENTS.md</code>, the
        assistant instruction files, the gate&apos;s caller workflow. A copy does not update itself.
        When the standard changes, or a new <code>redlinegate</code> release fixes something, each
        repository needs a pull request that rewrites its copy.
      </p>
      <p>
        A repository that quietly stops matching is worse than one that never onboarded: everyone
        believes it is covered. So Redline also checks, every week, that each repository still
        matches what it claims.
      </p>

      <h2>Two ways to update</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Update one repository</th>
              <th>Sync the whole organisation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Who runs it</td>
              <td>the repository&apos;s own team</td>
              <td>the team that owns Redline</td>
            </tr>
            <tr>
              <td>Where</td>
              <td>in the product repository</td>
              <td>in a checkout of the Redline source repository</td>
            </tr>
            <tr>
              <td>Command</td>
              <td>
                <code>init --no-commit</code>
              </td>
              <td>
                <code>sync</code>
              </td>
            </tr>
            <tr>
              <td>Hosts</td>
              <td>GitHub and Azure DevOps</td>
              <td>GitHub only</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Update one repository</h2>
      <p>
        Raise <code>redlinegate</code> in the repository&apos;s <code>devDependencies</code> to the
        new version with your package manager. Then, on a branch:
      </p>
      <RedlineTerminal
        commands={`{redline} status
{redline} init --no-commit`}
      />
      <p>
        <code>status</code> shows whether the repository is behind on its <code>standards</code>{" "}
        line, for example <code>— behind 0.2.2, a sync will raise it</code>, or{" "}
        <code>— current</code>. <code>init</code> keeps every choice recorded in{" "}
        <code>.redline.json</code> and rewrites the generated files.
      </p>
      <p>
        Raising the version alone is not enough: the files are copies, and only <code>init</code>{" "}
        replaces them. Commit, open a pull request, merge.{" "}
        <Link href="/docs/learn/next-steps">Learn step 10</Link> does it end to end.
      </p>

      <h2>Sync the whole organisation</h2>
      <p>
        An organisation with many repositories does not rely on each team remembering.{" "}
        <code>sync</code> opens the same pull request on every registered repository that is
        behind, naming the version it moves from and to.
      </p>
      <p>
        It runs from a checkout of the Redline source repository: automatically in the{" "}
        <code>Redline Sync</code> workflow when a change to <code>standards/</code>, the renderer or
        the templates lands on <code>main</code>, or by hand. Run from a product repository it
        stops with <code>no registry.json</code>.
      </p>
      <Terminal
        commands={`# from a checkout of the Redline source repository
npm ci
npm run build
node dist/bin/redline.js sync --dry-run`}
      />
      <p>
        <code>--dry-run</code> prints the plan and changes nothing. <code>--repo owner/name</code>{" "}
        narrows it to one repository. What a sync pull request guarantees:
      </p>
      <ul>
        <li>
          <b>Your own content survives.</b> Everything a team wrote above the{" "}
          <code>REDLINE:BEGIN</code> marker in <code>AGENTS.md</code> is untouched, because the
          render starts from the repository&apos;s current files.
        </li>
        <li>
          <b>It starts from your default branch</b>, never from an older sync branch, so an unmerged
          sync pull request cannot carry stale changes forward.
        </li>
        <li>
          <b>One open sync pull request per repository.</b> A newer change updates it rather than
          opening another.
        </li>
        <li>
          <b>It never merges</b> and never pushes to a default branch. Merging is the
          repository&apos;s decision.
        </li>
      </ul>

      <h3>Which repositories sync reaches</h3>
      <p>
        Only those in <code>registry.json</code>, the register of onboarded repositories. Nobody
        edits it by hand. A nightly workflow in the source repository walks the organisation for
        repositories that carry a <code>.redline.json</code> and writes what it finds.
      </p>
      <p>
        So a repository is registered exactly as long as that file exists. One that removes Redline
        drops out on the next run. One onboarded today becomes a sync target after tonight&apos;s
        run.
      </p>

      <h3 id="sync-exemption">A sync pull request exempts itself, for 30 days</h3>
      <p>
        A sync diff is generated, so the launch-readiness checklist and the ADR check do not fit
        it. Instead of a special case in the gate, the pull request carries the{" "}
        <code>redline-sync</code> label and a real{" "}
        <Link href="/docs/exemptions">exemption block</Link>, scoped to <code>checklist, adr</code>{" "}
        and expiring <b>30 days</b> after it was opened. The tool that writes the rules follows
        them too.
      </p>
      <p>
        The expiry is deliberate. At a blocking rung,{" "}
        <b>a sync pull request nobody merges starts failing its own gate</b> after 30 days, which
        makes a repository quietly refusing a standards change visible.
      </p>

      <h2>Drift: noticing a repository that fell behind</h2>
      <p>
        <b>Drift</b> is any gap between what a repository&apos;s <code>.redline.json</code> claims
        and what is actually there: a hand-edited ruleset, a renamed caller job, push protection
        switched off, generated files left stale.
      </p>
      <p>
        A weekly workflow in the source repository runs <code>verify --repo owner/name</code>{" "}
        against every registered GitHub repository. If any has drifted, it opens <b>one</b>{" "}
        tracking issue, and adds each later week&apos;s results to that same issue as a comment.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Verifying over the API cannot run every check: some need a working tree. Those report{" "}
          <code>??</code>, never <code>ok</code>, because reporting an unrun check as passing would
          give a false all-clear across every repository at once. A <code>??</code> never fails a
          repository on its own either.
        </p>
      </div>
      <p>
        In a product repository, <code>verify</code> runs the full set of checks against the
        checkout:
      </p>
      <RedlineTerminal commands="{redline} verify" />

      <h2>Azure DevOps</h2>
      <p>
        Sync and remote verify are GitHub-only today. A registered Azure DevOps repository is
        reported as unsupported rather than silently skipped. On Azure DevOps, update each
        repository yourself, as above.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/cli/sync">
            <code>redline sync</code>
          </Link>{" "}
          and{" "}
          <Link href="/docs/cli/verify">
            <code>redline verify</code>
          </Link>
          : every flag.
        </li>
        <li>
          <Link href="/docs/workflows/redline-sync">Redline Sync</Link> and{" "}
          <Link href="/docs/workflows/verify-onboarding">Verify Onboarding</Link>: the scheduled
          workflows.
        </li>
        <li>
          <Link href="/docs/who-runs-what">Who runs what</Link>: which commands belong to a product
          team and which to the Redline owners.
        </li>
      </ul>
    </DocsPage>
  );
}
