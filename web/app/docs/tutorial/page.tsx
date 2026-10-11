import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Tutorial" };

const CREATE = `mkdir redline-demo && cd redline-demo
git init -b main
npm init -y
mkdir src && echo 'export const ok = 1' > src/index.ts
git add -A && git commit -m "chore: initial commit"`;

const COMMIT = `git add -A && git commit -m "chore: onboard redline"`;

export default async function Page() {
  const state = await packageState();
  const review = installCommand(state, "review");
  const explain = installCommand(state, "explain");
  const init = installCommand(state, "init");

  return (
    <DocsPage
      crumb="Getting Started"
      title="Tutorial"
      intro="Make a throwaway repository, let Redline onboard it, then write code that breaks the rules and watch Redline catch it, explain it and stop complaining once it is fixed. About fifteen minutes. Nothing is pushed anywhere."
      href="/docs/tutorial"
    >
      <h2>How the pieces fit</h2>
      <p>
        Onboarding puts the same rules in three places, and each one catches
        mistakes at a different moment:
      </p>
      <ol>
        <li>
          <b>While the code is written.</b> <code>AGENTS.md</code>,{" "}
          <code>CLAUDE.md</code>, <code>.github/copilot-instructions.md</code>{" "}
          and <code>.cursor/rules/</code> are read by your assistant on every
          request.
        </li>
        <li>
          <b>Before you push.</b> <code>review</code> runs the rules a checker
          can decide on your machine, and <code>/redline-review</code> asks your
          assistant to apply the rest.
        </li>
        <li>
          <b>On the pull request.</b> The gate runs the checker rules again,
          along with the pull request checklist, the secret scan and dependency
          review.
        </li>
      </ol>

      <h2>What you will do</h2>
      <ol>
        <li>
          <b>Set up a playground</b>, on this page: a new repository on your
          machine, onboarded by Redline.
        </li>
        <li>
          <Link href="/docs/tutorial/first-finding">Your first finding</Link>:
          plant four violations and run <code>{review}</code>.
        </li>
        <li>
          <Link href="/docs/tutorial/assistant">Ask your assistant</Link>: the
          same review inside Claude Code, Copilot or Cursor.
        </li>
        <li>
          <Link href="/docs/tutorial/explain-and-fix">Explain and fix</Link>:{" "}
          <code>{explain}</code>, then make the findings go away properly.
        </li>
        <li>
          <Link href="/docs/tutorial/stay-current">Push and stay current</Link>:
          what happens on the pull request, and how new rules reach you.
        </li>
      </ol>

      <h2>What you need</h2>
      <ul>
        <li>
          <a href="https://nodejs.org" rel="noopener noreferrer" target="_blank">Node</a>{" "}
          18 or later
        </li>
        <li>
          A terminal, such as{" "}
          <a href="https://iterm2.com" rel="noopener noreferrer" target="_blank">iTerm2</a>
        </li>
        <li>
          <a href="https://git-scm.com/downloads" rel="noopener noreferrer" target="_blank">git</a>
        </li>
      </ul>
      <p>
        <b>You do not need to install Redline.</b> Every command runs the
        published package through <code>npx</code>, so you always get the
        current version.
      </p>

      <h2>Set up a playground</h2>

      <h3>Create a repository</h3>
      <p>A new folder with one file and one commit, on your machine only.</p>
      <CodeWindow title="terminal" copyText={CREATE}>
        <span className="tk-white">{CREATE}</span>
      </CodeWindow>
      <p>
        <code>npm: command not found</code> or <code>git: command not found</code>?
        Install{" "}
        <a href="https://nodejs.org" rel="noopener noreferrer" target="_blank">Node</a>{" "}
        (npm comes with it) or{" "}
        <a href="https://git-scm.com/downloads" rel="noopener noreferrer" target="_blank">git</a>,
        open a new terminal, and run it again.
      </p>

      <h3>Onboard it</h3>
      <p>
        Run this on its own. The first time, <code>npx</code> asks{" "}
        <code>Ok to proceed? (y)</code>; answer <code>y</code>.
      </p>
      <CodeWindow title="terminal" copyText={init}>
        <span className="tk-prompt">$</span> <span className="tk-white">{init}</span>{"\n"}
        {"  "}profile tooling{"\n"}
        {"  "}<span className="tk-amber">▲</span> this repository has no git remote, so Redline installed the rules and{"\n"}
        {"    "}the local review only. The merge gate, branch policy, labels and security{"\n"}
        {"    "}floor need a host: add a remote and run redline init again to install them{"\n"}
        {"\n"}
        {"  "}Files  18 written{"\n"}
        {"   "}<span className="tk-green">+</span> AGENTS.md{"\n"}
        {"   "}<span className="tk-green">+</span> CLAUDE.md{"\n"}
        {"   "}<span className="tk-green">+</span> .github/copilot-instructions.md{"\n"}
        {"   "}<span className="tk-green">+</span> .claude/commands/redline-review.md{"\n"}
        {"   "}<span className="tk-green">+</span> .redline.json{"\n"}
        {"   "}<span className="tk-dim">…</span>{"\n"}
        {"\n"}
        {"  "}<span className="tk-dim">not committed — the files are in your working tree; commit them when you are ready</span>
      </CodeWindow>
      <p>
        With no remote there is nowhere for a merge gate to run, so Redline
        installs what works on your machine and stops: it contacts no host,
        needs no credential and commits nothing. Add a remote later and run{" "}
        <code>init</code> again, and the gate and repository settings follow.
        Commit the files:
      </p>
      <CodeWindow title="terminal" copyText={COMMIT}>
        <span className="tk-prompt">$</span> <span className="tk-white">{COMMIT}</span>
      </CodeWindow>

      <h3>Look at what it wrote</h3>
      <ul>
        <li>
          <code>AGENTS.md</code>, <code>CLAUDE.md</code>,{" "}
          <code>.github/copilot-instructions.md</code> and{" "}
          <code>.cursor/rules/</code>: the rules, in the form each assistant
          reads.
        </li>
        <li>
          <code>.claude/commands/</code>, <code>.github/prompts/</code> and{" "}
          <code>.cursor/commands/</code>: a <code>/redline-review</code>{" "}
          command for each assistant. Step 2 uses them.
        </li>
        <li>
          <code>.redline.json</code>: what was installed and at which version.
        </li>
      </ul>
      <p>
        Open <code>redline-demo</code> as the workspace folder in your editor,
        so your assistant finds the rules and the commands. Then go to step 1.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Trying it on a repository you have already onboarded? Skip the
          playground and follow the steps there. Your profile line and file
          list will differ from what these pages show, and nothing else
          changes.
        </p>
      </div>
    </DocsPage>
  );
}
