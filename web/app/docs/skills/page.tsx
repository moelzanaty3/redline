import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { SkillsExplorer } from "@/components/skills-explorer";
import { AGENTS, PUBLISHERS, SKILLS } from "@/lib/skills-catalog";
import "../../skills-catalog.css";

export const metadata: Metadata = {
  title: "Skills",
  description:
    "Public agent skills from skills.sh, mapped onto the delivery lifecycle — plan, design, build, test, review, secure, ship, operate. Nothing vendored, nothing rewritten.",
};

const PUBS = new Set(SKILLS.map((e) => e.publisher)).size;
const OFFICIAL = PUBLISHERS.filter((p) => p.official).length;

export default function Page() {
  return (
    <DocsPage
      crumb="Skills"
      title="Skills"
      intro={`${SKILLS.length} public skills from ${PUBS} publishers, grouped by the stage of delivery they help with. Find one for the task in front of you, then install it from its publisher.`}
      href="/docs/skills"
    >
      <p>
        A <b>skill</b> is a file of instructions an AI coding assistant loads when it recognises
        the task, such as how to write a migration or review a React component. It changes what the
        assistant writes while you work. It does not run anything on its own.
      </p>
      <p>
        This catalogue is a reading list of public skills from{" "}
        <a href="https://skills.sh" rel="noopener noreferrer" target="_blank">
          skills.sh
        </a>
        , placed on the stage of delivery each one helps with: plan, design, build, test, review,
        secure, ship and operate. Redline does not write, copy or host any of them. Skills that run
        their own multi-step loop are on{" "}
        <Link href="/docs/agents">the agents page</Link> ({AGENTS.length} of them).
      </p>

      <h2>How to use the catalogue</h2>
      <ol>
        <li>Pick a delivery stage, a stack, or search for the task in front of you.</li>
        <li>
          Open an entry. It says when to reach for the skill, who publishes it, and links to the
          source, where you can read the skill itself before installing it.
        </li>
        <li>Copy the install command from the entry and run it in your project.</li>
      </ol>

      <SkillsExplorer kind="skill" />

      <h2>Installing</h2>
      <p>
        Skills install with the <code>skills</code> CLI, which writes them into the directories
        your assistants read: Claude Code, Codex, Cursor, Copilot and many others. Name the skill
        you want with <code>--skill</code>:
      </p>
      <CodeWindow
        copyText="npx skills add addyosmani/agent-skills --skill <name>"
        title="terminal"
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx skills add addyosmani/agent-skills --skill &lt;name&gt;</span>
      </CodeWindow>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>A publisher&apos;s repository can hold many skills.</b> Without{" "}
          <code>--skill</code>, the CLI offers every skill in the repository, and{" "}
          <code>--all</code> installs every one of them. <code>dotnet/skills</code> has 107. Install
          only what you need: every skill you add is context the assistant has to read past.
        </p>
      </div>
      <p>
        The <code>skills</code> CLI sends anonymous usage data by default. Set{" "}
        <code>DISABLE_TELEMETRY=1</code> to turn it off.
      </p>

      <h2>Where to start</h2>
      <p>
        <code>addyosmani/agent-skills</code> covers every stage with one consistent vocabulary. Add{" "}
        <code>obra/superpowers</code> for working discipline: test-driven development, written
        plans, subagents and worktrees. After that, add skills for your own stack, such as Expo for
        mobile, Trail of Bits for security work, or the .NET set for .NET.
      </p>

      <h2>What the entries show</h2>
      <ul>
        <li>
          <b>Nothing here is ours.</b> Each entry links to the publisher&apos;s repository, and the
          install command pulls from there. When the publisher changes a skill, you get their change.
        </li>
        <li>
          <b>Star counts</b> are a snapshot, printed with the date they were counted. Install counts
          and audit verdicts are not shown, because they cannot be dated.
        </li>
        <li>
          <b>Official</b> marks a publisher that ships the thing the skill is about, such as Vercel
          on React or Expo on Expo. {OFFICIAL} of the {PUBLISHERS.length} publishers carry it.
        </li>
      </ul>

      <h2>Where this stops</h2>
      <p>
        Skills shape what the assistant writes. They enforce nothing: no skill blocks a merge, and
        none is measured for whether it changed an outcome. Redline does that half, with{" "}
        <Link href="/docs/output-contract">the output contract</Link> and{" "}
        <Link href="/docs/gate">the merge gate</Link>. Use skills to improve what gets written, and
        the gate to catch what still gets through.
      </p>
    </DocsPage>
  );
}
