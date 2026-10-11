import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Tutorial: push and stay current" };

const COMMIT = `git commit -m "feat: load users from JSON"
git push -u origin feat/load-user`;

const CLEANUP = "cd .. && rm -rf redline-demo";

export default async function Page() {
  const state = await packageState();
  const status = installCommand(state, "status");
  const verify = installCommand(state, "verify");

  return (
    <DocsPage
      crumb="Getting Started / Tutorial"
      title="4. Push and stay current"
      intro="What the same rules do once the change leaves your machine, and how a new version of the rules reaches your repository without you running anything."
      href="/docs/tutorial/stay-current"
    >
      <h2>Push and open a pull request</h2>
      <p>
        In a real repository, commit and push as usual. The playground has no
        remote, so there the commit is as far as it goes.
      </p>
      <CodeWindow title="terminal" copyText={COMMIT}>
        <span className="tk-white">{COMMIT}</span>
      </CodeWindow>
      <p>
        Open the pull request and fill in the template onboarding added,
        including its <code>## Launch readiness</code> checklist. The gate then
        runs these jobs:
      </p>
      <ul>
        <li>
          <b>Deterministic policy</b>: the same checker rules as{" "}
          <code>review</code> in step 1, with no model. Its findings are in the
          job&apos;s log. Had you pushed the file from step 1, this job would
          have failed on its two BLOCKERs.
        </li>
        <li>
          <b>PR checklist</b> and <b>ADR</b>: whether the checklist is complete,
          and whether a change of more than 300 lines links a decision record.
        </li>
        <li>
          <b>Secret scan</b> and <b>dependency review</b>: the security floor.
        </li>
      </ul>
      <p>
        Their results are combined into one required check,{" "}
        <code>redline-gate / gate</code>. A newly onboarded repository is at
        the <code>observe</code> rung: a failing policy, checklist or ADR job is
        reported as a warning and the check stays green. The secret scan and
        dependency review are the exception. They block at every rung,{" "}
        <code>observe</code> included. See{" "}
        <Link href="/docs/enforcement">Enforcement</Link> for how a repository
        is promoted to blocking. The model review from step 2 does not run in
        the gate; it is advice to you, before you push.
      </p>
      <p>
        To prove the gate passes, blocks and refuses a bad exemption on your
        repository, run the <Link href="/docs/verification">Verification</Link>{" "}
        drill once on a throwaway branch.
      </p>

      <h2>When the standards change</h2>
      <p>
        The rules are versioned. When the organisation publishes a new version,
        your repository is behind until it takes it, and{" "}
        <code>status</code> says so:
      </p>
      <CodeWindow title="terminal" copyText={status}>
        <span className="tk-prompt">$</span> <span className="tk-white">{status}</span>{"\n"}
        <span className="tk-dim">…</span>{"\n"}
        <span className="tk-dim">standards</span>    0.2.0 — <span className="tk-amber">behind 0.2.1, a sync will raise it</span>
      </CodeWindow>
      <p>
        You do not run anything to catch up. The team that owns Redline runs{" "}
        <code>redline sync</code>, which opens a pull request on every
        repository that is behind, re-rendering <code>AGENTS.md</code>,{" "}
        <code>CLAUDE.md</code> and the rest with the new rules. Review that
        pull request like any other and merge it.
      </p>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          Do not run <code>redline sync</code> from your own repository. It is
          the estate-wide command: it runs from a checkout of the Redline source
          repository and opens pull requests on <i>every</i> registered
          repository.
        </p>
      </div>
      <p>
        To check that your repository still matches what{" "}
        <code>.redline.json</code> says is installed (the gate workflow, the
        rendered files, the host settings), run <code>{verify}</code>. Unlike
        the commands above it asks the host, so it needs a credential (on
        GitHub, <code>gh auth login</code> or <code>GH_TOKEN</code>), and it
        does not work in the playground. See{" "}
        <Link href="/docs/success">What success looks like</Link> for what a
        healthy result looks like.
      </p>

      <h2>What you just did</h2>
      <ul>
        <li>
          Wrote code that broke four rules, and saw <code>review</code> name
          each one by severity and rule id, with no model.
        </li>
        <li>
          Had your assistant review the same change, against the same rules,
          in the same format.
        </li>
        <li>
          Asked <code>explain</code> what a rule means and who decided it, then
          fixed the code properly and watched the review come back clean.
        </li>
        <li>
          Saw which of those rules the gate enforces on a pull request, and
          how a new version of the rules reaches your repository.
        </li>
      </ul>
      <p>To remove the playground:</p>
      <CodeWindow title="terminal" copyText={CLEANUP}>
        <span className="tk-prompt">$</span> <span className="tk-white">{CLEANUP}</span>
      </CodeWindow>

      <h2>Where to go next</h2>
      <ul>
        <li>
          <Link href="/docs/adopting">Adopting Redline</Link>: from day one to
          blocking merges.
        </li>
        <li>
          <Link href="/docs/local-review">Local review</Link>: every way to run
          the review before you push.
        </li>
        <li>
          <Link href="/docs/troubleshooting">Troubleshooting</Link>: when
          something here did not match what you saw.
        </li>
      </ul>
    </DocsPage>
  );
}
