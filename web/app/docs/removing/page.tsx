import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { loadManifest } from "@/lib/manifest";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import type { Step } from "@/lib/lifecycle";

export const metadata: Metadata = { title: "Removing Redline" };

// The order the work has to happen in, and the reason each step exists. It is
// the same shape as onboarding's: a pull request the team reviews, not a
// sequence of quiet local deletions.
const STEPS: Step[] = [
  {
    label: "git checkout -b redline/remove",
    detail:
      "Removal is a change to how this repository is reviewed and merged, so it goes through review like any other. redline init opens its own branch for the same reason.",
  },
  {
    label: "Delete the files Redline owns whole",
    detail:
      "Everything under the redline- prefix, the rendered command files, and the gate caller workflow. Nothing in them was written by a human.",
  },
  {
    label: "Strip the REDLINE blocks from the merged files",
    detail:
      "AGENTS.md, CLAUDE.md, .github/copilot-instructions.md and the pull request template are shared with your own content. Delete the marker pair and everything between it; leave every other byte.",
  },
  {
    label: "Delete .redline.json",
    detail:
      "This is the file that says the repository is onboarded. Until it is gone, verify and the central registry both still count this repository as part of the estate.",
  },
  {
    label: "Undo the host settings that are Redline's",
    detail:
      "The branch ruleset entry, the labels, the repository property. Not the security floor — see below, it is the one part you almost certainly want to keep.",
  },
  {
    label: "Open the pull request",
    detail:
      "On an advisory repository the gate runs on this pull request and reports; it is the last thing it reviews. On a blocking one the required check has to come out before the pull request is opened, or nothing publishes it and nothing merges.",
  },
];

export default function Page() {
  // Which vendors a default install actually rendered decides whether these two
  // paths are on disk at all. standards/manifest.json ships cursor and skills
  // disabled, and render() treats the org manifest as a ceiling, so listing them
  // flatly as "delete them" sends most readers hunting for files that were never
  // written. Read the flag rather than restate it: a vendor switched on later
  // must not leave this page quietly wrong.
  const manifest = loadManifest();
  const off = (id: string): boolean => manifest.vendors[id]?.enabled !== true;
  const cursorOff = off("cursor");
  const skillsOff = off("skills");
  const anyOff = cursorOff || skillsOff;

  return (
    <DocsPage
      crumb="Removing Redline"
      title="Removing Redline"
      intro="Everything redline init wrote, and how to take it back out — which files are Redline's to delete, which are yours with a Redline block inside them, and which host settings you should think twice about switching off."
      href="/docs/removing"
    >
      <p>
        <code>redline remove</code> does this in one step and opens the pull
        request for you. The rest of this page is the manual path, and it is
        written out in full deliberately: <code>redline init</code> writes into
        files you already own and changes settings on your host, so
        &ldquo;how do I back this out&rdquo; deserves an answer you can read
        and check rather than a command you have to trust.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          If you only want Redline to stop maintaining <b>part</b> of this
          repository, removal is the wrong tool.{" "}
          <code>redline init --skip gate</code> stops Redline maintaining the
          merge gate — the caller workflow an earlier run installed stays on
          disk and keeps running; it is yours to keep or delete —{" "}
          <code>--skip merge-policy</code> hands back the branch policy, and{" "}
          <code>--vendors</code> narrows which AI tools get rendered files: a
          deselected vendor&apos;s block is stripped and its files pruned on
          the next run. Every one of those choices is recorded in{" "}
          <code>.redline.json</code>, so it survives the next run. See{" "}
          <Link href="/docs/onboarding">Onboard a repository</Link>.
        </p>
      </div>

      <h2>The order of work</h2>
      <LifecycleSteps steps={STEPS} />

      <h2>Files Redline owns whole — delete them</h2>
      <p>
        These are generated end to end. Nothing in them came from your
        repository, and the <code>redline-</code> prefix is what makes them
        identifiable: it is the same prefix <code>render()</code> prunes on
        when a stack leaves your profile.
      </p>
      <p>
        Only the vendors your organisation has enabled ever wrote anything, so
        expect gaps in this list rather than a clean sweep.{" "}
        {anyOff ? (
          <>
            On the manifest as it ships today that means{" "}
            <b>
              {[cursorOff ? "Cursor" : null, skillsOff ? "Claude skills" : null]
                .filter((v) => v !== null)
                .join(" and ")}{" "}
              rendered nothing
            </b>
            , and their rows below will not exist in your repository.
          </>
        ) : (
          <>Every vendor listed below is enabled on the manifest as it ships today.</>
        )}{" "}
        Check <code>.redline.json</code> — it records the vendors this repository
        actually rendered.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Path</th><th>What it is</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>.github/instructions/redline-*.instructions.md</td>
              <td>One per stack in your profile — the Copilot rules with their <code>applyTo</code> globs.</td>
            </tr>
            <tr>
              <td>.cursor/rules/redline-*.mdc</td>
              <td>
                Cursor rules, core plus one per stack.
                {cursorOff ? <> <b>Only if the Cursor vendor was enabled</b> — it ships off, so a default install never wrote these.</> : null}
              </td>
            </tr>
            <tr>
              <td>.claude/skills/redline-*/</td>
              <td>
                Whole directories, each holding a <code>SKILL.md</code>. Delete the
                directory, not just the file.
                {skillsOff ? <> <b>Only if the skills vendor was enabled</b> — it ships off, so a default install never wrote these.</> : null}
              </td>
            </tr>
            <tr>
              <td>.github/prompts/redline-*.prompt.md</td>
              <td>The rendered slash commands for Copilot. Equivalents live in <code>.claude/commands/</code>, <code>.opencode/command/</code> and <code>.cursor/commands/</code>.</td>
            </tr>
            <tr>
              <td>.github/workflows/redline.yml</td>
              <td>The caller workflow: a few lines that reference your org&apos;s reusable gate. On Azure DevOps this is <code>.azuredevops/redline-gate.yml</code>.</td>
            </tr>
            <tr>
              <td>.redline.json</td>
              <td>The record of what was installed. Covered on its own below.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="callout warn">
        <span className="ic">⚠</span>
        <p>
          One exception, in the command files. Redline renders{" "}
          <code>redline-init</code> and <code>redline-verify</code> into paths
          that nothing reserves — a team can have its own{" "}
          <code>.claude/commands/redline-init.md</code>. Where a file was
          already there, Redline merged into it instead of owning it, and the
          file is a merged file, not a generated one. The tell is what sits
          outside the block: a file that is nothing but a{" "}
          <code># Managed by Redline</code> frontmatter line and one REDLINE
          block is Redline&apos;s and can go; anything else is yours with a
          block in it, so strip the block and keep the file.
        </p>
      </div>

      <h2>Files that are yours — strip the block only</h2>
      <p>
        These files are shared. Redline writes into them between two marker
        lines and never touches a byte outside that span — that is the whole
        reason the markers exist. Removing Redline means deleting the marker
        pair and everything between them, and leaving the rest of the file
        exactly as it is.
      </p>
      <CodeWindow title="AGENTS.md">
        <span className="tk-dim"># Checkout service</span>{"\n"}
        <span className="tk-dim">Your own notes, untouched by every redline run.</span>{"\n"}
        {"\n"}
        <span className="tk-red">&lt;!-- REDLINE:BEGIN — generated by Redline. Do not edit inside this block. --&gt;</span>{"\n"}
        <span className="tk-dim">…everything here is Redline&apos;s — delete it…</span>{"\n"}
        <span className="tk-red">&lt;!-- REDLINE:END --&gt;</span>{"\n"}
        {"\n"}
        <span className="tk-dim">More of your own notes, also untouched.</span>
      </CodeWindow>
      <ul>
        <li><b><code>AGENTS.md</code></b> — the composed standard: core rules plus every stack in your profile. Usually the largest block.</li>
        <li><b><code>CLAUDE.md</code></b> — four lines that import <code>AGENTS.md</code>.</li>
        <li><b><code>.github/copilot-instructions.md</code></b> — the core standard for Copilot code review.</li>
        <li><b>The pull request template</b> — <code>.github/pull_request_template.md</code>, or wherever your host resolves one. Same marker rule; see below.</li>
      </ul>
      <p>
        If nothing but the markers was ever in the file — no notes of your own
        above or below the block — delete the file. That is exactly what Redline itself
        does when a vendor is deselected — strip the block, and remove the file
        if nothing is left.
      </p>
      <div className="callout">
        <span className="ic">!</span>
        <p>
          Match the marker pair literally:{" "}
          <code>&lt;!-- REDLINE:BEGIN</code> at the start of a line, through to{" "}
          the matching <code>&lt;!-- REDLINE:END --&gt;</code>. Redline itself
          refuses to write a file carrying a half-edited pair — one marker
          without the other, or two of either — rather than guess which span is
          its own, so leaving a stray marker behind is the one edit here that
          can break a later <code>redline init</code>.
        </p>
      </div>

      <h3>The pull request template</h3>
      <p>
        Created, never taken over. A template your repository wrote for itself
        is not Redline&apos;s to edit, so there are four cases and only two of
        them leave you anything to undo:
      </p>
      <ul>
        <li><b>You had no template.</b> Redline wrote the packaged one whole. Delete the file.</li>
        <li><b>You had one that already answered the gate.</b> Redline left it untouched and there is nothing to undo.</li>
        <li><b>You had one that did not answer the gate.</b> Redline still did not edit it. The install named the sections it lacks — <code>## Launch readiness</code>, <code>## Architecture decision</code> — and said the checklist job will fail until someone adds them or the gate is deselected. Nothing to undo; the file is entirely yours.</li>
        <li><b>Your template carries a REDLINE block.</b> Redline put it there on an earlier run, and refreshes only what is inside it. Strip the block and keep every other byte.</li>
      </ul>
      <p>
        On Azure DevOps, check the branch-specific templates too — anything
        under a <code>branches/</code> folder inside{" "}
        <code>pull_request_template/</code>, in <code>.azuredevops/</code>,{" "}
        <code>.vsts/</code>, <code>docs/</code> or the repository root. Azure
        serves those in preference to the default, so{" "}
        <code>redline init</code> considers every one it finds — under the same
        four cases above, which for a template you wrote means it is reported
        and left alone.
      </p>

      <h3><code>.github/CODEOWNERS</code></h3>
      <p>
        <b>Seeded only if you asked for it, and only if this repository had
        none.</b> Ownership is off by default — it is written when{" "}
        <code>redline init --with review-ownership</code> selects it, because
        the generated file names an owner Redline cannot prove exists and a
        ruleset requiring code-owner review with an unresolvable owner blocks
        every pull request in the repository. Where it is selected,{" "}
        <code>redline init</code> looks for{" "}
        <code>.github/CODEOWNERS</code>, <code>CODEOWNERS</code> and{" "}
        <code>docs/CODEOWNERS</code>; if any of the three exists the file is
        reported as <i>already present, left untouched</i> and Redline never
        writes ownership at all. So a pre-existing CODEOWNERS is not Redline&apos;s
        and must not be deleted.
      </p>
      <p>
        The tell is the first line. A seeded file opens with{" "}
        <code># Managed by Redline.</code> and then names one owning team
        against the sensitive paths — workflows, the rendered standards,{" "}
        <code>infra/</code>, <code>Dockerfile</code>. A file that does not open
        with that line was yours before Redline arrived.
      </p>
      <div className="callout warn">
        <span className="ic">⚠</span>
        <p>
          Deleting a seeded CODEOWNERS removes code-owner review from{" "}
          <code>.github/workflows/</code> and your infrastructure paths — a
          protection that has nothing to do with Redline and that your branch
          policy may still be requiring. Removing Redline is not a reason to
          give that up: keep the file and drop the{" "}
          <code># Managed by Redline.</code> line, unless you know the ownership
          was never wanted. On Azure DevOps this question does not arise —
          required reviewers there take identity GUIDs rather than team slugs,
          so Redline reports the capability as unsupported and writes nothing.
        </p>
      </div>

      <h3><code>.redline/local.md</code></h3>
      <p>
        Yours, entirely. Redline reads this file and renders a copy of it inside
        the block in each artifact; it never writes it, never prunes it and
        never fails a run over what is in it. Stripping the blocks removes the
        copies. The source file stays unless you delete it yourself.
      </p>

      <h2><code>.redline.json</code> — what deleting it means</h2>
      <p>
        This is the file that makes the repository <i>onboarded</i>, and
        deleting it is what makes the removal real rather than cosmetic.
      </p>
      <ul>
        <li><code>redline verify</code> stops recognising the repository. It reports a single finding — <code>no .redline.json — run: npx redlinegate init</code> — and exits <code>2</code>, a usage error, not drift.</li>
        <li>Central discovery reads <code>.redline.json</code> from the default branch of every repository in the org. With the file gone this repository is simply not in the registry, and stops appearing in coverage and drift reporting.</li>
        <li>It also carries <code>onboardedAt</code>, the recorded menu, the pending-admin list and the content ids of the command files. All of that is gone with it — a later <code>redline init</code> would start from nothing and read as a fresh onboarding.</li>
      </ul>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Delete it <b>last</b>, and only in the same pull request as the rest.
          A repository with the files still on disk and no{" "}
          <code>.redline.json</code> looks, to <code>redline init</code>, very
          like a repository from an older generation of the tool that is due a
          migration.
        </p>
      </div>

      <h2>Host settings</h2>
      <p>
        None of these live in the repository, so no pull request removes them.
        They are split here into the ones that are Redline&apos;s and the ones
        that only arrived with Redline.
      </p>

      <h3>Keep these</h3>
      <p>
        Secret scanning, push protection and dependency alerts are an
        organisation-wide security floor. They are additive host settings —
        they displace nothing else the repository runs — and they have nothing
        to do with code review standards. <b>Removing Redline is not a reason
        to turn them off.</b> The CLI itself refuses{" "}
        <code>--skip security-floor</code> by name for exactly this reason,
        rather than quietly recording an opt-out.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Setting</th><th>Where</th></tr>
          </thead>
          <tbody>
            <tr><td>secret scanning</td><td>GitHub repository settings; Azure DevOps Advanced Security.</td></tr>
            <tr><td>push protection</td><td>Same place — the half of secret scanning that blocks the push rather than reporting after it.</td></tr>
            <tr><td>dependency alerts</td><td>Dependabot alerts and automated security fixes on GitHub; Advanced Security dependency scanning on Azure.</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Remove these</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Object</th><th>What to do</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>ruleset &ldquo;Redline&rdquo;</td>
              <td>The branch ruleset on your default branch, created under exactly that name. Delete it — or, if your team wants the approval rules it carries, rename it and keep it; from then on it is yours and Redline would create a second one beside it.</td>
            </tr>
            <tr>
              <td>redline-gate / gate</td>
              <td>The required status check inside that ruleset, present only on a repository promoted to blocking. This one comes out <b>first</b> — see the ordering note below.</td>
            </tr>
            <tr>
              <td>redline=onboarded</td>
              <td>The custom repository property. GitHub only; Azure DevOps has no repository properties and the central registry tracks the repo instead.</td>
            </tr>
            <tr>
              <td>no-adr</td>
              <td>Label. Created by the gate install and meaningless without it.</td>
            </tr>
            <tr>
              <td>redline-exempt</td>
              <td>Label. Same — it is what the gate soft-failed on. Check for open pull requests carrying it before deleting.</td>
            </tr>
            <tr>
              <td>redline-sync</td>
              <td>Label, applied to the pull requests the standards sync opens.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        On Azure DevOps the equivalents are branch policies whose display name
        starts <code>Redline:</code> — the minimum-reviewers, comment-resolution,
        gate-status and gate-build policies — plus the build definition{" "}
        <code>redline-gate</code> in the <code>{"\\Redline"}</code> folder. A policy
        of the same type <i>without</i> that prefix is a human&apos;s and was
        never touched by Redline.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          The reusable gate workflow itself lives in your organisation&apos;s{" "}
          <code>.github</code> repository, not here. Removing Redline from one
          repository deletes its caller and leaves the org-level workflow alone
          — which is what you want while any other repository still calls it.
        </p>
      </div>

      <h2>Do it as a pull request</h2>
      <p>
        Onboarding never pushes to your default branch, and removal should not
        either. Everything above except the host settings is a file change, so
        it goes on a branch and through review — which is also the only way the
        rest of the team finds out that the standard they have been reviewing
        against is gone.
      </p>
      <div className="callout warn">
        <span className="ic">⚠</span>
        <p>
          <b>On a repository promoted to blocking, drop the required check
          before you open the removal pull request.</b> The caller workflow runs
          from the head of the branch under review, so a pull request that
          deletes it is a pull request on which{" "}
          <code>redline-gate / gate</code> is never reported — and a ruleset
          still requiring that check will not let it merge, or anything else
          after it. Remove the <code>required_status_checks</code> rule (or the
          whole ruleset) first, then open the pull request. On the default{" "}
          <b>advisory</b> install there is no required check and no such
          problem: the gate runs on the removal pull request, reports, and
          blocks nothing.
        </p>
      </div>
      <CodeWindow
        title="terminal"
        copyText={"git checkout -b redline/remove\ngit add -A\ngit commit -m 'chore(redline): remove Redline from this repository'\ngit push -u origin redline/remove"}
      >
        <span className="tk-prompt">$</span> <span className="tk-white">git checkout -b redline/remove</span>{"\n"}
        <span className="tk-prompt">$</span> <span className="tk-white">git add -A</span>{"\n"}
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">git commit -m &apos;chore(redline): remove Redline from this repository&apos;</span>{"\n"}
        <span className="tk-prompt">$</span> <span className="tk-white">git push -u origin redline/remove</span>{"\n"}
        <span className="tk-dim">  on an advisory repo the gate still runs here — it is the last thing it reviews</span>
      </CodeWindow>
      <p>
        Once it has merged, take out what is left on the host: the ruleset, the{" "}
        <code>redline=onboarded</code> property, the three labels. Leave the
        security floor on.
      </p>
    </DocsPage>
  );
}
