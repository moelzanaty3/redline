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
      intro={`${SKILLS.length} public agent skills from ${PUBS} publishers, placed on the delivery lifecycle. Every one is somebody else's — install it from the registry, not from here.`}
      href="/docs/skills"
    >
      {/* The tool comes before the essay. Everything needed to use the filters
          is in these two paragraphs; install mechanics and caveats sit under
          the catalogue, where they are read once rather than scrolled past on
          every visit. */}
      <p>
        Redline reviews the diff. It has no opinion on how the diff gets
        written — but the engineers asking for the standard keep asking the next
        question, which is what to give the agent so the diff arrives in better
        shape. A <b>skill</b> is the answer: a file the model loads when it
        recognises the situation, carrying procedure it would otherwise guess
        at. It is nearly free — it loads, it shifts the output, you move on.
      </p>
      <p>
        Something that takes the wheel instead — spawns subagents, drives a
        browser, keeps going on its own — is on{" "}
        <Link href="/docs/agents">the agents page</Link> ({AGENTS.length} of
        them). That split is a judgement we made, not a field the registry
        publishes: skills.sh lists both as skills, and we separated them because
        the question you ask before installing one is not the question you ask
        before installing the other. Everything below is knowledge applied to
        work you are already doing.
      </p>

      <SkillsExplorer kind="skill" />

      <h2>Installing</h2>
      <p>
        One CLI, and it works across Claude Code, Codex, Cursor, Copilot,
        Windsurf, Zed and the rest — it writes into whichever agent directories
        it finds:
      </p>
      <CodeWindow copyText="npx skills add addyosmani/agent-skills" title="terminal">
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx skills add addyosmani/agent-skills</span>
      </CodeWindow>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>The unit is the repository, not the skill.</b> That command
          installs every skill in <code>addyosmani/agent-skills</code> — all of
          them, not just the one you read about. Worth knowing before you
          install <code>dotnet/skills</code>, which has 107. Install
          deliberately: context you do not need is context the model has to
          ignore.
        </p>
      </div>
      <p>
        Telemetry is on by default and feeds the registry&apos;s install
        rankings. <code>DISABLE_TELEMETRY=1</code> turns it off.
      </p>

      <h2>If you install only one thing</h2>
      <p>
        <code>addyosmani/agent-skills</code> covers every phase above with one
        consistent vocabulary — it is the highest-coverage single install here.
        Add <code>obra/superpowers</code> for the execution discipline (TDD,
        plans, subagents, worktrees) and you have the spine of the lifecycle
        from two commands. Everything after that should be your stack: Expo for
        mobile, Trail of Bits for security work, the .NET set for .NET.
      </p>

      <h2>What this page is not</h2>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>Nothing on this page is ours.</b> Redline does not vendor, fork,
          host or modify any of these. Each entry links to the publisher&apos;s
          repository, and the install command pulls from them directly. If a
          publisher changes a skill, you get their change — this is a map, not a
          mirror.
        </p>
      </div>
      <p>
        Star counts appear on each entry as a <b>dated snapshot</b>: the number
        GitHub returned on the day we counted, printed with that date beside it.
        Install counts and audit verdicts are not here at all — we have no way
        to date those honestly, and a number that drifts with nothing to anchor
        it is worse than no number. {OFFICIAL} of the {PUBLISHERS.length}{" "}
        publishers carry an <b>Official</b> badge, which means they ship the
        thing the skill is about — Vercel on React, Expo on Expo, the .NET team
        on MSBuild.
      </p>

      <h2>Where this stops</h2>
      <p>
        Skills shape what the agent writes. They do not enforce anything: no
        skill blocks a merge, and none of them is versioned against your
        repository or measured for whether it changed an outcome. That is the
        other half of the loop, and it is the half Redline does — see{" "}
        <Link href="/docs/output-contract">the output contract</Link> and{" "}
        <Link href="/docs/gate">the merge gate</Link>. Use both: skills to
        raise the floor on what gets written, the gate to catch what still gets
        through.
      </p>
      <p>
        Redline can also render its own standards as skills, which is a
        different thing from this page —{" "}
        <Link href="/docs/adaptors/skills">Claude skills adaptor</Link> covers
        that.
      </p>
    </DocsPage>
  );
}
