import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Tutorial: your first finding" };

// Each line breaks exactly one rule the offline checker decides, so the
// findings appear at any terminal with no model and no network.
const BAD_FILE = `type User = { id: string; name: string }

// TODO: handle retries
export function loadUser(raw: string) {
  // @ts-ignore
  return JSON.parse(raw) as unknown as User
}

export type Payload = unknown
`;

const BRANCH = "git checkout -b feat/load-user";
const STAGE = "git add src/user.ts";

export default async function Page() {
  const review = installCommand(await packageState(), "review");

  return (
    <DocsPage
      crumb="Getting Started / Tutorial"
      title="1. Your first finding"
      intro="Write a file that looks like a normal afternoon's work, and watch Redline name four problems in it, with no model call."
      href="/docs/tutorial/first-finding"
    >
      <h2>Start a branch</h2>
      <CodeWindow title="terminal" copyText={BRANCH}>
        <span className="tk-prompt">$</span> <span className="tk-white">{BRANCH}</span>
      </CodeWindow>

      <h2>Create the file</h2>
      <p>
        Save this as <code>src/user.ts</code>, creating <code>src/</code> if
        your repository has none. Every line of it is something an assistant
        writes when it is told to make the error go away.
      </p>
      <CodeWindow title="src/user.ts" copyText={BAD_FILE}>
        <span className="tk-white">{BAD_FILE}</span>
      </CodeWindow>

      <h2>Stage it</h2>
      <p>
        Redline reviews a <i>diff</i>, and a file git does not track yet is not
        in one. Skip this and the review stops with{" "}
        <code>there is nothing to review — the diff is empty</code>.
      </p>
      <CodeWindow title="terminal" copyText={STAGE}>
        <span className="tk-prompt">$</span> <span className="tk-white">{STAGE}</span>
      </CodeWindow>

      <h2>Run the review</h2>
      <CodeWindow title="terminal" copyText={review}>
        <span className="tk-prompt">$</span> <span className="tk-white">{review}</span>{"\n"}
        <span className="tk-dim">profile tooling — rules in scope: core, typescript</span>{"\n"}
        src/user.ts:3{"\n"}
        {"  "}<span className="tk-amber">Redline/HIGH</span> [core/untracked-todo]: this TODO carries no ticket reference, so nothing will bring anyone back to it.{"\n"}
        src/user.ts:5{"\n"}
        {"  "}<span className="tk-red">Redline/BLOCKER</span> [core/type-checker-suppression]: a type-checker suppression needs an inline explanation AND a ticket reference on the same line.{"\n"}
        src/user.ts:6{"\n"}
        {"  "}<span className="tk-red">Redline/BLOCKER</span> [core/unsafe-assertion]: a double assertion overrides the type checker with no stated reason.{"\n"}
        src/user.ts:9{"\n"}
        {"  "}<span className="tk-amber">Redline/HIGH</span> [typescript/unknown-type-alias]: this alias names `unknown`, so it reads as a contract it is not.{"\n"}
        4 finding(s){"\n"}
        <span className="tk-dim">that is every rule a checker can decide; the rest of the standard needs a model</span>
      </CodeWindow>
      <p>
        The messages are shortened here; your terminal prints each one in full,
        with the fix. In the playground you see exactly these four. In your own
        repository the profile line names your profile, a{" "}
        <code>warn</code> line may say which files no stack covers, and
        anything else already on your branch is reviewed too.
      </p>
      <p>
        Run it in a terminal. When the output is piped or captured, for example
        by a script or an assistant running it for you, <code>review</code>{" "}
        prints the prompt for a model instead of the findings.
      </p>

      <h2>Reading a finding</h2>
      <p>Every finding has the same three parts, in the same order:</p>
      <ul>
        <li>
          <b>Severity</b> — <code>BLOCKER</code> must not merge,{" "}
          <code>HIGH</code> is a deliberate trade-off,{" "}
          <code>SUGGESTION</code> is optional. See{" "}
          <Link href="/docs/output-contract">The output contract</Link>.
        </li>
        <li>
          <b>Rule id</b> — the part in brackets. It is stable, it is what you
          pass to <code>explain</code>, and it is how the organisation
          measures which rules earn their place.
        </li>
        <li>
          <b>The problem and the fix</b>, in one or two sentences.
        </li>
      </ul>
      <p>
        These four came from a checker, not a model, which is why they are the
        same every time. Most of the standard needs
        judgement — a missing auth check, customer data in a log line — and
        that is what the next step adds.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          A local review always exits 0 and is never recorded. It is a mirror,
          not a gate: nothing here can block you.
        </p>
      </div>
    </DocsPage>
  );
}
