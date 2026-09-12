import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { STANDARDS } from "@/lib/registry";
import { findRule, getRules } from "@/lib/rules";

export const metadata: Metadata = { title: "Standards" };

const EXAMPLE_RULE_ID = "core/query-string-concatenation";

export default function Page() {
  const rules = getRules();
  const example = findRule(EXAMPLE_RULE_ID);

  return (
    <DocsPage
      crumb="Reference"
      title="Standards"
      intro={`A versioned catalogue of ${rules.length} rules — core plus 16 stacks — and the only files a human edits. Everything a developer's tooling actually sees is generated from these.`}
      href="/docs/standards"
    >
      <h2>What a standard is here</h2>
      <p>
        Two paths and a version number:{" "}
        <code>standards/core.md</code> for the rules every repository gets,{" "}
        <code>standards/stacks/*.md</code> for the sixteen stack sets, both
        versioned together in <code>standards/manifest.json</code>. What a
        repository ends up with —{" "}
        <code>.github/copilot-instructions.md</code>, <code>AGENTS.md</code>,{" "}
        <code>CLAUDE.md</code>, <code>.cursor/rules/</code> — is rendered from
        those by the CLI and written in by <code>redline init</code>.
      </p>

      <h2>What a developer actually sees</h2>
      <p>
        A developer never opens <code>standards/</code>. They meet it as a
        review comment. This is the output contract the standard specifies
        for a reviewer — every finding begins with a machine-readable prefix,
        a real rule pulled straight out of <code>standards/core.md</code>:
      </p>
      {example && (
        <CodeWindow title="a real finding">
          <span className="tk-red">Redline/BLOCKER</span>{" "}
          <span className="tk-blue">[{example.id}]</span>:{" "}
          <span className="tk-white">{example.text}</span>
          {"\n"}
          <span className="tk-white">
            Use a parameterised query: db.Query(&quot;SELECT id FROM users
            WHERE name = $1&quot;, name)
          </span>
        </CodeWindow>
      )}
      <p>
        Then one or two sentences: why it breaks, and the concrete fix. One
        finding per comment. What each severity obliges the developer to do, why
        the bracketed id is permanent, and the &ldquo;what NOT to flag&rdquo;
        section every standard ships are all on{" "}
        <Link href="/docs/output-contract">The output contract</Link>.
      </p>

      <h2>A repo installs exactly one profile</h2>
      <p>
        A profile names exactly which stacks apply, and never composes two rule
        sets that contradict each other — which is what keeps every stack&apos;s
        globs plain and unambiguous inside a repository.{" "}
        <code>redline init</code> proposes one by scanning the repo;{" "}
        <code>--profile &lt;name&gt;</code> overrides the guess. The sixteen of
        them, and why glob negation was not the answer, are on{" "}
        <Link href="/docs/profiles">Profiles &amp; stacks</Link>.
      </p>

      <h2>Browse the standards</h2>
      <p>
        The full source, plus a rule reference table grouped by severity, per
        stack.
      </p>
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {STANDARDS.map((s) => (
          <Link className="doc-card" href={`/docs/standards/${s.slug}`} key={s.slug}>
            <h3>{s.title} <span>→</span></h3>
            <p>{s.description}</p>
          </Link>
        ))}
      </div>
    </DocsPage>
  );
}
