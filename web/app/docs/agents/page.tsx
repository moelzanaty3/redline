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
      intro={`${AGENTS.length} public agents from ${PUBS} publishers, grouped by the stage of delivery they help with. Hand one a job and it keeps going without you.`}
      href="/docs/agents"
    >
      <p>
        An <b>agent</b> here is a skill that takes over a whole job. It runs its own multi-step
        loop: it may start subagents, drive a browser, or write files and keep going until it
        decides it is done. A <Link href="/docs/skills">skill</Link>, by contrast, only adds
        knowledge to work you are already doing.
      </p>
      <p>
        skills.sh lists both as skills. Redline splits them because the cost differs: an agent
        spends tokens and time on every run, so it needs a job worth handing over, such as
        generating a test suite or auditing a codebase. This catalogue places each agent on the
        stage of delivery it helps with. Redline does not write, copy or host any of them. The{" "}
        {SKILLS.length} cheaper skills are on <Link href="/docs/skills">the skills page</Link>.
      </p>

      <h2>How to use the catalogue</h2>
      <ol>
        <li>Pick a delivery stage, a stack, or search for the job you want done.</li>
        <li>
          Open an entry. It says when to reach for the agent, who publishes it, and links to the
          source, where you can read what it does before installing it.
        </li>
        <li>Copy the install command from the entry and run it in your project.</li>
      </ol>

      <SkillsExplorer kind="agent" />

      <h2>Installing</h2>
      <p>
        Agents install with the same <code>skills</code> CLI as skills. Name the one you want with{" "}
        <code>--skill</code>; without it, the CLI offers everything in the publisher&apos;s
        repository.
      </p>
      <CodeWindow copyText="npx skills add obra/superpowers --skill <name>" title="terminal">
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx skills add obra/superpowers --skill &lt;name&gt;</span>
      </CodeWindow>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>An agent you install is one your assistant can start.</b> An installed agent costs
          nothing until something calls it, but know what you added. Read the entry before you hand
          it a job.
        </p>
      </div>

      <h2>Before you hand one a job</h2>
      <p>
        A skill that misses leaves you a slightly worse diff. An agent that misses can spend twenty
        minutes producing confident, wrong work. Every time:
      </p>
      <ul>
        <li>
          <b>Give it a task with a checkable result.</b> &ldquo;Write tests for this module&rdquo;
          has a clear pass or fail. &ldquo;Improve the architecture&rdquo; does not.
        </li>
        <li>
          <b>Run it where you can throw the result away</b>, on a branch or in a worktree.
        </li>
        <li>
          <b>Read what it wrote before you read its summary.</b> The summary is the agent&apos;s own
          account of its work, and the least reliable thing it produces.
        </li>
      </ul>

      <h2>What the entries show</h2>
      <p>
        Each entry links to the publisher&apos;s repository, and the install command pulls from
        there. When the publisher changes an agent, you get their change. Which entries count as
        agents is Redline&apos;s judgement, not a field the registry publishes.
      </p>

      <h2>Where this stops</h2>
      <p>
        Code an agent writes still arrives in a pull request, and nothing on this page reviews it.
        Redline does that, with <Link href="/docs/output-contract">the output contract</Link> and{" "}
        <Link href="/docs/gate">the merge gate</Link>. The more autonomous the author, the more the
        gate matters.
      </p>
    </DocsPage>
  );
}
