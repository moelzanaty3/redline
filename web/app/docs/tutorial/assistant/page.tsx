import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Tutorial: ask your assistant" };

const WRITE_PROMPT = `Write a function in src/account.ts that parses an Account { id: string; email: string } from a JSON string.`;

export default async function Page() {
  const printPrompt = `${installCommand(await packageState(), "review --print-prompt")} | pbcopy`;

  return (
    <DocsPage
      crumb="Getting Started / Tutorial"
      title="2. Ask your assistant"
      intro="The terminal review only covers the rules a checker can decide. Your assistant covers the rest, using the same rules, and reports in the same format."
      href="/docs/tutorial/assistant"
    >
      <p>
        Keep <code>src/user.ts</code> staged from the previous step. Onboarding
        added a <code>/redline-review</code> command to every assistant it
        rendered for. It has the assistant run Redline&apos;s review with{" "}
        <code>--engine embedded</code>, which collects the rules that apply to
        the changed files, the diff and the checker&apos;s findings into one
        prompt, and then follow that prompt. If the assistant cannot run it,
        the command tells it to collect the same rules from{" "}
        <code>AGENTS.md</code> or <code>CLAUDE.md</code> and read the diff
        itself, so the review works either way.
      </p>

      <h2>In Claude Code, Copilot Chat or Cursor</h2>
      <p>Type this in the chat, in the repository:</p>
      <CodeWindow title="assistant chat" copyText="/redline-review">
        <span className="tk-prompt">&gt;</span> <span className="tk-white">/redline-review</span>
      </CodeWindow>
      <p>
        In Copilot Chat it comes from <code>.github/prompts/redline-review.prompt.md</code>{" "}
        and runs in agent mode. In Claude Code it comes from{" "}
        <code>.claude/commands/</code>, and in Cursor from{" "}
        <code>.cursor/commands/</code>.
      </p>
      <p>
        The reply is a list of findings in the same{" "}
        <code>Redline/SEVERITY [rule-id]: problem</code> shape the terminal
        printed, BLOCKER first, ending with a count such as{" "}
        <code>2 BLOCKER · 2 HIGH · 0 SUGGESTION</code>. If nothing qualifies, the
        reply is <code>No Redline issues in this change.</code> and nothing
        else. Expect the four findings from step 1. A model may add findings for
        rules the checker cannot decide, and its wording changes from run to
        run; the rule ids do not.
      </p>

      <h2>In any other chat</h2>
      <p>
        A browser tab works too. This copies the whole prompt to the clipboard;
        paste it into the chat. On Linux, pipe to <code>xclip -selection clipboard</code>{" "}
        instead of <code>pbcopy</code>, and on Windows to <code>clip</code>.
      </p>
      <CodeWindow title="terminal" copyText={printPrompt}>
        <span className="tk-prompt">$</span> <span className="tk-white">{printPrompt}</span>
      </CodeWindow>

      <h2>The assistant follows the rules while it writes</h2>
      <p>
        Reviewing is half of it. <code>AGENTS.md</code>, <code>CLAUDE.md</code>,{" "}
        <code>.github/copilot-instructions.md</code> and{" "}
        <code>.cursor/rules/</code> are read by the assistant on every request,
        so the rules shape the code before anything is reviewed. Ask for new
        code:
      </p>
      <CodeWindow title="assistant chat" copyText={WRITE_PROMPT}>
        <span className="tk-prompt">&gt;</span> <span className="tk-white">{WRITE_PROMPT}</span>
      </CodeWindow>
      <p>
        Compare its answer with <code>src/user.ts</code>. An assistant that
        has read the rules validates the parsed value, usually with a type
        guard or a schema, instead of writing <code>as unknown as Account</code>.
        This depends on the model, so treat it as something to look for, not a
        guarantee. That is why the review exists.
      </p>
      <p>
        More on what each assistant reads:{" "}
        <Link href="/docs/adaptors/claude">Claude</Link>,{" "}
        <Link href="/docs/adaptors/github-copilot">GitHub Copilot</Link>,{" "}
        <Link href="/docs/adaptors/cursor">Cursor</Link>.
      </p>
    </DocsPage>
  );
}
