import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { SkillsExplorer } from "@/components/skills-explorer";
import { AGENTS, SKILLS } from "@/lib/skills-catalog";
import "../../skills-catalog.css";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "Public agents from skills.sh — the ones that run their own loop. Placed on the delivery lifecycle, with what each one costs you before you hand it a job.",
};

const PUBS = new Set(AGENTS.map((e) => e.publisher)).size;

export default function Page() {
  return (
    <DocsPage
      crumb="Agents"
      title="Agents"
      intro={`${AGENTS.length} public agents from ${PUBS} publishers, placed on the delivery lifecycle. These run their own loop — hand one a job and it keeps going without you.`}
      href="/docs/agents"
    >
      <p>
        The registry calls everything a skill. That flattens the distinction
        that matters most when you are deciding what to install. A{" "}
        <Link href="/docs/skills">skill</Link> is knowledge the model reads and
        applies to whatever it was already doing — it loads, it shifts the
        output, you move on. An <b>agent</b> takes the wheel: it spawns
        subagents, drives a browser, writes artifacts, and runs a multi-step
        loop of its own.
      </p>
      <p>
        That difference is a budget. An agent costs tokens and wall-clock time,
        and it needs a task actually worth handing over — a test suite to
        generate, a codebase to audit, a browser flow to exercise. Installing
        one you never invoke costs you nothing but context; invoking one
        casually costs real money. The {SKILLS.length} entries on{" "}
        <Link href="/docs/skills">the skills page</Link> are the cheap half.
      </p>

      <SkillsExplorer kind="agent" />

      <h2>Installing</h2>
      <p>
        Same CLI as skills — there is no separate agent installer, because the
        registry does not distinguish them. The split on this site is ours:
      </p>
      <CodeWindow copyText="npx skills add obra/superpowers" title="terminal">
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx skills add obra/superpowers</span>
      </CodeWindow>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>An agent you install is an agent your model can invoke.</b> The
          unit is the repository, so one command can add several autonomous
          loops at once. That is fine — they only cost you when something calls
          them — but it is worth knowing what arrived. Read the entry before you
          hand it a job, not after.
        </p>
      </div>

      <h2>Before you hand one a job</h2>
      <p>
        Agents fail differently from skills. A skill that misses the mark leaves
        you with a slightly worse diff; an agent that misses the mark can spend
        twenty minutes and a lot of tokens producing confident, wrong work.
        Three things worth doing every time:
      </p>
      <ul>
        <li>
          <b>Give it a task with a checkable result.</b> &ldquo;Write tests for
          this module&rdquo; has an obvious pass/fail. &ldquo;Improve the
          architecture&rdquo; does not, and you will not know when it is done.
        </li>
        <li>
          <b>Run it where you can throw the result away.</b> A branch or a
          worktree, never a dirty main checkout.
        </li>
        <li>
          <b>Read what it wrote before you read its summary.</b> The summary is
          the agent&apos;s own account of its work, and it is the least
          reliable artifact it produced.
        </li>
      </ul>

      <h2>What this page is not</h2>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>Nothing on this page is ours.</b> Redline does not vendor, fork,
          host or modify any of these. Each entry links to the publisher&apos;s
          repository, and the install command pulls from them directly. If a
          publisher changes an agent, you get their change — this is a map, not
          a mirror.
        </p>
      </div>
      <p>
        The skill/agent split is a judgement we made, not a field the registry
        publishes. An entry is an agent here if it runs a multi-step loop of its
        own rather than informing one you are already running. Reasonable people
        would draw a couple of these differently.
      </p>

      <h2>Where this stops</h2>
      <p>
        An agent writing code is still code arriving in a pull request, and
        nothing on this page reviews it. That is the half Redline does — see{" "}
        <Link href="/docs/output-contract">the output contract</Link> and{" "}
        <Link href="/docs/gate">the merge gate</Link>. The more autonomous the
        thing writing the diff, the more the gate is the only thing standing
        between it and main.
      </p>
    </DocsPage>
  );
}
