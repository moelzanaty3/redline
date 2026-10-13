import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineTerminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Reviewing before you push" };

const TERMINAL_OUTPUT = `profile javascript-typescript — rules in scope: core, typescript
warn  no stack covers 1 changed file(s), so only the core rules applied to them: run.sh
a.ts:2
  Redline/HIGH [core/untracked-todo]: this TODO carries no ticket reference, so nothing will bring anyone back to it. Add the ticket id on the same line, or do the work now.
…
4 finding(s)
that is every rule a checker can decide; the rest of the standard needs a model — run /redline-review in your assistant, or \`redline review --engine api\`
local review — not recorded, and not counted in rule-tuning telemetry`;

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Reviewing before you push"
      intro="redline review checks your change against only the rules that apply to the files you touched, before anyone else sees it. It never blocks, and its findings are never counted."
      href="/docs/local-review"
    >
      <h2>Why bound the review</h2>
      <p>
        Anyone can ask an assistant to review a diff. Hand it the whole standard, though, and it
        spends most of its attention on rules for files you never touched: Terraform rules on a
        React change, React rules on a service. <b>The findings get worse, not better.</b>
      </p>
      <p>
        <code>review</code> works out which <Link href="/docs/profiles">stacks</Link> your changed
        files belong to and sends only those rules. It reads the profile from{" "}
        <code>.redline.json</code>; in a repository that is not onboarded, pass{" "}
        <code>--profile &lt;name&gt;</code>.
      </p>

      <h2>What gets reviewed</h2>
      <RedlineTerminal
        commands={`# the working tree against its merge base with the default branch
{redline} review
# only what is staged, before you commit
{redline} review --staged
# against a branch other than the default
{redline} review --base release/2.4`}
      />

      <h2>Who does the reviewing: engines</h2>
      <p>
        The CLI checks deterministic rules itself. For the judgement rules it needs a model, and the{" "}
        <b>engine</b> decides which one. It never picks a model for you: nothing leaves your
        machine unless you choose an engine that sends it.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Where you run it</th>
              <th>What happens</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>At a terminal, no <code>--engine</code></td>
              <td>
                Prints the <Link href="/docs/deterministic">deterministic</Link> findings
                straight away, and says how to get the rest. Calls no model.
              </td>
            </tr>
            <tr>
              <td>
                Inside an assistant or a pipe (<code>--engine embedded</code>, the default there)
              </td>
              <td>
                Prints the bounded prompt for the assistant that ran the command, which replies with
                the findings. <code>/redline-review</code> in your assistant does this for you.
              </td>
            </tr>
            <tr>
              <td>
                <code>--engine api</code>
              </td>
              <td>The CLI calls a model endpoint itself, hosted or local, and prints the findings.</td>
            </tr>
            <tr>
              <td>
                <code>--print-prompt</code>
              </td>
              <td>
                Writes only the prompt to stdout, for any assistant you have, including a browser
                tab. Pipe it to <code>pbcopy</code> to copy it.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>At a terminal, the default looks like this:</p>
      <RedlineTerminal commands="{redline} review --staged" output={TERMINAL_OUTPUT} />
      <p>
        The embedded engine is the design, not a stub. The CLI is usually run <i>by</i> an
        assistant that already has a model and the context of your work. Calling a second model
        from inside that session pays twice for a worse answer.
      </p>

      <h3>The api engine, hosted or local</h3>
      <p>
        <code>--engine api</code> speaks either the OpenAI-compatible or the Anthropic API. It
        infers the provider from <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code>, and
        the model from <code>REDLINE_REVIEW_MODEL</code>, so you set them once.
      </p>
      <p>
        The OpenAI-compatible API is also what Ollama, LM Studio and vLLM expose, so a fully local
        review costs nothing and needs no key. That matters where a diff may not be sent to a third
        party at all. For a local server, pass both <code>--provider openai</code> and{" "}
        <code>--base-url</code>:
      </p>
      <RedlineTerminal
        commands="{redline} review --engine api --provider openai --base-url http://localhost:11434/v1 --model qwen2.5-coder:14b"
      />
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          Without <code>--base-url</code>, an exported <code>OPENAI_API_KEY</code> sends the diff to
          OpenAI&apos;s hosted API. Without a key and without <code>--provider</code>, there is
          nothing to infer the provider from.
        </p>
      </div>

      <h2>The model returns data, not comments</h2>
      <p>
        With <code>--engine api</code> the model returns JSON in a published schema: rule,
        severity, file, line, problem, fix. The CLI validates it and writes the{" "}
        <code>Redline/&lt;SEVERITY&gt; [rule-id]:</code> line itself.
      </p>
      <p>
        A model that writes that line freely will sooner or later invent a severity or a rule id,
        and <b>every count keyed on that line becomes wrong</b>. So a finding that cites a rule the
        prompt did not include is rejected, and the rejection is printed with its reason rather
        than hidden.
      </p>

      <h2>What a local review does not do</h2>
      <ul>
        <li>
          <b>It never blocks.</b> <code>review</code> exits 0 whatever it finds. A non-zero exit
          would invite someone to wire it into CI as a second gate that looks like enforcement and
          is not. The <Link href="/docs/gate">merge gate</Link> and the pull request review remain
          the system of record.
        </li>
        <li>
          <b>It is never counted.</b> Local findings are left out of rule-tuning telemetry, and
          every run says so. A local run has no review thread to resolve, so nobody can tell a
          finding that was fixed from one that was never read. Counting them would skew the{" "}
          <Link href="/docs/telemetry#acted-on">acted-on rate</Link> with runs nobody can verify.
        </li>
      </ul>

      <h2>Files the standard does not cover</h2>
      <p>
        A changed file that matches no stack is named in a warning, as in the output above, and
        gets the core rules only. That is a gap in the standard, and saying nothing would hide it.
      </p>
      <p>
        <Link href="/docs/learn/first-finding">Learn step 02</Link> runs a review on your machine and
        in your assistant.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/cli/review">
            <code>redline review</code>
          </Link>
          : every flag.
        </li>
        <li>
          <Link href="/docs/deterministic">Deterministic rules</Link>: the findings that need no
          model.
        </li>
        <li>
          <Link href="/docs/output-contract">The output contract</Link>: the line the CLI writes for
          each finding.
        </li>
      </ul>
    </DocsPage>
  );
}
