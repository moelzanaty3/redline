import type { Metadata } from "next";
import { DocsPage } from "@/components/docs-page";
import { LearnPath, Quiz } from "@/components/learn/interactive";
import { PackageBadge } from "@/components/package-badge";
import { DEMO_URL, LEARN_MINUTES, LEARN_STEPS } from "@/lib/learn";
import { browserRegistry, packageState } from "@/lib/package-version";
import "./learn.css";

export const metadata: Metadata = { title: "Learn Redline" };

export default async function Page() {
  const state = await packageState();

  return (
    <DocsPage
      crumb="Getting Started / Learn"
      title="Learn Redline"
      intro={`Take a small TypeScript service from no Redline at all to a merge gate that has earned the right to block. ${LEARN_STEPS.length} short pages, about ${LEARN_MINUTES} minutes. You need no prior knowledge of Redline: each new idea is explained where you first meet it.`}
      href="/docs/learn"
    >
      <PackageBadge initial={state} registry={browserRegistry()} />

      <h2>Redline in one minute</h2>
      <p>
        Coding assistants write a lot of code, quickly. A reviewer reading that code cannot hold
        every rule the team cares about in their head: no secrets in code, validate what comes
        in from outside, no <code>as unknown as</code> to make the compiler stop complaining.
        Redline writes those rules down once, and checks them in three places:
      </p>
      <ol>
        <li>
          <b>While the code is written.</b> The rules are rendered into the files your assistant
          reads on every request: <code>AGENTS.md</code>, <code>CLAUDE.md</code>, the Copilot
          instructions and the Cursor rules.
        </li>
        <li>
          <b>Before you push.</b> <code>redline review</code> checks your change on your machine,
          and <code>/redline-review</code> asks your assistant to do the same.
        </li>
        <li>
          <b>On the pull request.</b> A merge gate runs the same checks again, plus a few only a
          pipeline can do: a secret scan, a vulnerable-dependency check, a checklist.
        </li>
      </ol>
      <p>
        It also counts which rules people act on, so a team can tell the rules that catch real
        bugs from the ones that only make noise.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>
          <b>git</b> and <b>Node 18.11 or later</b>.
        </li>
        <li>
          <b>pnpm</b>, or npm, yarn or bun. Every command that differs has a tab for each.
        </li>
        <li>
          <b>A GitHub account</b> and the{" "}
          <a href="https://cli.github.com" rel="noopener noreferrer" target="_blank">
            GitHub CLI
          </a>
          , signed in with <code>gh auth login</code>. The gate runs on pull requests, so each
          step opens one.
        </li>
        <li>
          <b>An AI assistant</b>, if you have one: Claude Code, GitHub Copilot or Cursor. Steps 02
          to 04 run a review inside it. Without one, those steps show what it would say.
        </li>
      </ul>

      <h2>How this path works</h2>
      <p>
        You follow one real repository,{" "}
        <a href={DEMO_URL} rel="noopener noreferrer" target="_blank">
          redline-demo
        </a>
        . Each step is one pull request there, merged and tagged, from <code>step-00</code> to{" "}
        <code>step-09</code>. At every step you can see exactly what the repository held.
      </p>
      <p>
        You do the work in a repository of your own. Step 00 copies the demo&apos;s starting files
        into a new GitHub repository under your account. The demo itself is only ever read from.
      </p>
      <p>
        From step 01 on, a step ends the same way: commit on a branch, open a pull request, watch
        the checks, merge, and pull <code>main</code> before the next step. Step 02 is the exception: its pull
        request stays open, and step 03 fixes and merges it. Rather just read? Every step links
        the demo&apos;s pull request, so you can follow without running anything.
      </p>
      <p>Mark each step complete as you go. Your progress is kept in this browser only.</p>

      <h2>The steps</h2>
      <LearnPath />

      <Quiz
        question="A rule is broken in a pull request. Where can Redline first notice it?"
        options={[
          {
            text: "Only on the pull request, when the merge gate runs",
            why: "The gate is the last place, not the first. The same rules reach your assistant and your terminal before anything is pushed.",
          },
          {
            text: "While the code is being written, because the assistant reads the rules",
            correct: true,
            why: "The rules are in AGENTS.md, CLAUDE.md and the other assistant files, so a well-behaved assistant avoids the mistake before there is anything to review. The local review and the gate catch what slips through.",
          },
          {
            text: "After it is merged, in a weekly report",
            why: "Redline does report on rules over time, but its checks run before the merge: in the editor, on your machine and on the pull request.",
          },
        ]}
      />
    </DocsPage>
  );
}
