import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineTerminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Reviewing before you push" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Reviewing before you push"
      intro="Anyone can ask an assistant to review a diff. What redline review adds is the bound — only the rules that apply to the files you touched — and a finding contract the model cannot free-type."
      href="/docs/local-review"
    >
      <h2>Why bounding matters more than the model</h2>
      <p>
        Hand a model every rule in the standard and it spends most of its attention on rules for
        files your change never touched. <b>The findings get worse, not better.</b>{" "}
        <code>review</code> resolves the applicable stacks from the changed files and the prompt
        carries only those.
      </p>
      <RedlineTerminal
        commands={`# the working tree against its merge base
{redline} review
# only what is staged, before you commit
{redline} review --staged
# a local model through Ollama: the diff never leaves the machine
{redline} review --engine api --provider openai --base-url http://localhost:11434/v1 --model qwen2.5-coder:14b`}
      />
      <p>
        <Link href="/docs/learn/first-finding">Learn step 02</Link> runs a review on your machine and
        in your assistant.
      </p>

      <h2>Two engines, and the default calls no model</h2>
      <p>
        Typed at a terminal with no <code>--engine</code>, <code>review</code>{" "}
        prints the findings the checker decides without a model and says where
        the rest come from — it never sends the diff anywhere unasked.
      </p>
      <ul>
        <li>
          <b>embedded</b> (the default inside an assistant or a pipe) — emits the
          bounded prompt for the assistant already running the command, which
          replies with the list of issues. That is the design, not a stub: the CLI is
          usually being run <i>by</i> an assistant that already has a model and a
          context, and calling a second one from inside that session pays twice
          for a worse answer.
        </li>
        <li>
          <b>api</b> — the CLI calls an endpoint itself, in either the
          OpenAI-compatible or the Anthropic dialect. The OpenAI-compatible half
          covers the <b>fully local case for free</b>: Ollama, LM Studio and vLLM
          all expose it, and a local endpoint needs no key. That matters: a
          review that must send a diff to a third party is one several markets
          cannot run at all. For a local server, pass <code>--provider openai</code>{" "}
          and its <code>--base-url</code>: with no API key exported there is nothing
          to infer the provider from, and with <code>OPENAI_API_KEY</code> exported
          and no <code>--base-url</code> the engine calls OpenAI&apos;s hosted API.
        </li>
      </ul>

      <h2>The model returns data, not comments</h2>
      <p>
        With <code>--engine api</code> the model returns JSON against a published schema. The CLI validates it
        and writes the <code>Redline/&lt;SEVERITY&gt; [rule-id]:</code> line
        itself. A model that writes that prefix will eventually write a severity
        that does not exist or an id it invented, and{" "}
        <b>every aggregate keyed on that line becomes fiction</b>. A finding citing
        a rule the prompt did not carry is discarded, and the reason is said out
        loud rather than swallowed.
      </p>

      <h2>The honest limitation</h2>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          A local review is opt-in and therefore <b>enforces nothing</b>. The pull
          request review remains the system of record, and{" "}
          <code>review</code> always exits 0 — a non-zero exit would
          invite someone to wire it into CI as a second gate, where it would
          enforce nothing while looking like it did.
        </p>
      </div>
      <p>
        Local findings are <b>excluded from rule-tuning telemetry</b>, and the
        command says so on every run. A local run has no thread to resolve, no
        reviewer to attribute, and no way to tell a finding that was fixed from
        one the author never read. Counting it would compute the{" "}
        <Link href="/docs/telemetry#acted-on">acted-on rate</Link> partly from runs nobody can
        verify.
      </p>

      <h2>It tells you what the standard does not cover</h2>
      <p>
        A changed file that matches no stack is reported rather than dropped. That
        is a gap in the standard, and reviewing it against the core rules alone
        while saying nothing hides it. See{" "}
        <Link href="/docs/profiles">Profiles &amp; stacks</Link> for how the
        matching works.
      </p>
    </DocsPage>
  );
}
