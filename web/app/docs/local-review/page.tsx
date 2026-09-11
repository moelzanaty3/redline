import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

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
        Hand a model the composed standard for a sixteen-stack profile and it
        spends most of its attention on rules for languages your change never
        touched. <b>The findings get worse, not better.</b>{" "}
        <code>redline review</code> resolves the applicable stacks from the
        changed files and the prompt carries only those.
      </p>
      <CodeWindow
        title="terminal"
        copyText={"redline review\nredline review --staged\nredline review --engine api --model qwen2.5-coder:14b"}
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">redline review</span>
        <span className="tk-dim">{"                # working tree vs the merge base"}</span>
        {"\n"}
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">redline review --staged</span>
        <span className="tk-dim">{"       # before you commit"}</span>
        {"\n"}
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">redline review --engine api --model qwen2.5-coder:14b</span>
      </CodeWindow>

      <h2>Two engines, and the default calls no model</h2>
      <ul>
        <li>
          <b>embedded</b> (default) — emits the bounded prompt for the assistant
          already running the command. That is the design, not a stub: the CLI is
          usually being run <i>by</i> an assistant that already has a model and a
          context, and calling a second one from inside that session pays twice
          for a worse answer.
        </li>
        <li>
          <b>api</b> — the CLI calls an endpoint itself, in either the
          OpenAI-compatible or the Anthropic dialect. The OpenAI-compatible half
          covers the <b>fully local case for free</b>: Ollama, LM Studio and vLLM
          all expose it, and a local endpoint needs no key. That matters — a
          review that must send a diff to a third party is one several markets
          cannot run at all.
        </li>
      </ul>

      <h2>The model returns data, not comments</h2>
      <p>
        The model returns JSON against a published schema. The CLI validates it
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
          <code>redline review</code> always exits 0 — a non-zero exit would
          invite someone to wire it into CI as a second gate, where it would
          enforce nothing while looking like it did.
        </p>
      </div>
      <p>
        Local findings are <b>excluded from rule-tuning telemetry</b>, and the
        command says so on every run. A local run has no thread to resolve, no
        reviewer to attribute, and no way to tell a finding that was fixed from
        one the author never read — counting it would compute acted-on rate partly
        from runs nobody can verify.
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
