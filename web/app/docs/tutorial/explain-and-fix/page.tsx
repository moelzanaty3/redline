import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Tutorial: explain and fix" };

// Fixes all four findings for real rather than annotating them away: the
// payload is checked by a type predicate, so no assertion is left to justify.
const FIXED_FILE = `type User = { id: string; name: string }

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

export function loadUser(raw: string): User {
  const parsed: unknown = JSON.parse(raw)
  if (!isUser(parsed)) throw new Error('payload is not a User')
  return parsed
}
`;

const RESTAGE = "git add src/user.ts";

export default async function Page() {
  const state = await packageState();
  const explain = installCommand(state, "explain core/unsafe-assertion");
  const review = installCommand(state, "review");

  return (
    <DocsPage
      crumb="Getting Started / Tutorial"
      title="3. Explain and fix"
      intro="A finding is only useful if you can find out why the rule exists. Ask Redline about the rule, fix the code, and re-run the review until it has nothing to say."
      href="/docs/tutorial/explain-and-fix"
    >
      <h2>Ask what the rule means</h2>
      <p>Pass the id in the brackets of any finding:</p>
      <CodeWindow title="terminal" copyText={explain}>
        <span className="tk-prompt">$</span> <span className="tk-white">{explain}</span>{"\n"}
        <span className="tk-red">BLOCKER</span> core/unsafe-assertion{"\n"}
        {"\n"}
        {"  "}No unsafe assertions (`as unknown as X`, force casts) used to silence an error. Where one is{"\n"}
        {"  "}genuinely required, the justification is a `SAFETY:` comment on the same line or the line above,{"\n"}
        {"  "}stating why the assertion holds (`// SAFETY: payload parsed by the schema above`).{"\n"}
        {"  "}Any other comment does not count.{"\n"}
        {"\n"}
        {"  "}<span className="tk-dim">decided by</span>   a checker, with no model call{"\n"}
        {"  "}<span className="tk-dim">defined in</span>   standards/core.md:87{"\n"}
        {"  "}<span className="tk-dim">applies to</span>   every file — the core standard is not scoped by stack{"\n"}
        {"  "}<span className="tk-dim">reaches</span>      tooling, web-react, web-next, … every profile
      </CodeWindow>
      <p>
        It tells you three things a finding alone does not: the full rule,
        whether a checker or a model decides it, and where it is written down in
        the organisation&apos;s standards. A rule you disagree with has an owner
        and a place to change it, not just a reviewer to argue with. <code>explain --list</code> prints every
        rule id with its severity.
      </p>

      <h2>Fix the code</h2>
      <p>
        Replace <code>src/user.ts</code> with this. The parsed JSON is checked
        by a type predicate before it is returned as a <code>User</code>, so
        there is nothing left to assert or suppress. The <code>TODO</code> and
        the alias for <code>unknown</code> are gone.
      </p>
      <CodeWindow title="src/user.ts" copyText={FIXED_FILE}>
        <span className="tk-white">{FIXED_FILE}</span>
      </CodeWindow>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Adding <code>// SAFETY: …</code> above the assertion would also
          silence <code>core/unsafe-assertion</code>. That is meant for the rare
          assertion that is genuinely correct, not for this one, where the
          comment would be false.
        </p>
      </div>

      <h2>Re-run the review</h2>
      <CodeWindow title="terminal" copyText={`${RESTAGE}\n${review}`}>
        <span className="tk-prompt">$</span> <span className="tk-white">{RESTAGE}</span>{"\n"}
        <span className="tk-prompt">$</span> <span className="tk-white">{review}</span>{"\n"}
        <span className="tk-dim">profile tooling — rules in scope: core, typescript</span>{"\n"}
        <span className="tk-green">no findings</span>
      </CodeWindow>
      <p>
        Run <code>/redline-review</code> in your assistant again as well. The
        checker is satisfied; the model reviews the rest of the standard.
      </p>
      <p>
        Every rule, with examples: <Link href="/docs/standards">Standards</Link>.
      </p>
    </DocsPage>
  );
}
