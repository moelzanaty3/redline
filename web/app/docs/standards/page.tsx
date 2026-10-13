import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { STANDARDS } from "@/lib/registry";
import { loadManifest } from "@/lib/manifest";
import { findRule, getRules } from "@/lib/rules";
import { STANDARDS_EDIT, profilesIncluding, severityBreakdown } from "@/lib/lifecycle";

export const metadata: Metadata = { title: "Standards" };

const EXAMPLE_RULE_ID = "core/query-string-concatenation";

export default function Page() {
  const rules = getRules();
  const example = findRule(EXAMPLE_RULE_ID);
  const { version, stacks, profiles } = loadManifest();
  const stackCount = Object.keys(stacks).length;
  const profileCount = Object.keys(profiles).length;
  const ruleFiles = STANDARDS.filter((s) => s.slug !== "manifest");

  return (
    <DocsPage
      crumb="Reference"
      title="Standards"
      intro={`The ${rules.length} review rules every onboarded repository is held to: a core set for every file, plus ${stackCount} stack sets. Look up any rule id you see in a review comment.`}
      href="/docs/standards"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>For product engineers</b> who want to know what a finding means,
          and for anyone proposing a rule change. Editing a rule is a platform
          change: see <a href="#changing-a-rule">Changing a rule</a>.
        </p>
      </div>

      <h2>Why the standards exist</h2>
      <p>
        AI reviewers comment on whatever they notice. The standards turn that
        into a fixed list: what to flag, how severe it is, and what not to flag
        at all. Every finding names the rule it applies, so you can look it up
        here and argue with the rule rather than the reviewer.
      </p>

      <h2>What a finding looks like</h2>
      <p>
        You never open <code>standards/</code> yourself. You meet a rule as a
        review comment on your pull request. Every comment starts with its
        severity and the rule id in brackets:
      </p>
      {example ? (
        <CodeWindow title="a finding">
          <span className="tk-red">Redline/BLOCKER</span>{" "}
          <span className="tk-blue">[{example.id}]</span>:{" "}
          <span className="tk-white">{example.text}</span>
          {"\n"}
          <span className="tk-white">
            Use a parameterised query: db.Query(&quot;SELECT id FROM users
            WHERE name = $1&quot;, name)
          </span>
        </CodeWindow>
      ) : null}
      <p>
        A <b>BLOCKER</b> must be fixed before merge, a <b>HIGH</b> needs a
        reviewer to accept the trade-off, and a <b>SUGGESTION</b> is optional.
        What each one obliges you to do is on{" "}
        <Link href="/docs/output-contract">The output contract</Link>. Whether a
        BLOCKER actually stops the merge depends on your repository&apos;s{" "}
        <b>rung</b>, its position on the enforcement ladder — see{" "}
        <Link href="/docs/enforcement">Enforcement</Link>.
      </p>

      <h2>Which rules your repository gets</h2>
      <p>
        A <b>stack</b> is one rule file for one language or framework, such as
        React or Go. It applies only to files matching its globs. A{" "}
        <b>profile</b> is a named list of stacks, such as{" "}
        <code>web-react</code>. Each repository installs exactly one of the{" "}
        {profileCount} profiles, and always gets core. <code>redline init</code>{" "}
        detects the profile; <code>--profile &lt;name&gt;</code> overrides it.
        More on <Link href="/docs/profiles">Profiles &amp; stacks</Link>.
      </p>

      <h2>All standards</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Standard</th>
              <th>Covers</th>
              <th>BLOCKER</th>
              <th>HIGH</th>
              <th>SUGGESTION</th>
              <th>In profiles</th>
            </tr>
          </thead>
          <tbody>
            {ruleFiles.map((s) => {
              const counts = severityBreakdown(s.slug);
              return (
                <tr key={s.slug}>
                  <td>
                    <Link href={`/docs/standards/${s.slug}`}>{s.title}</Link>
                  </td>
                  <td>{s.description}</td>
                  <td>{counts.BLOCKER}</td>
                  <td>{counts.HIGH}</td>
                  <td>{counts.SUGGESTION}</td>
                  <td>{s.slug === "core" ? "All" : profilesIncluding(s.slug).length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        <Link href="/docs/standards/manifest">
          <code>manifest.json</code>
        </Link>{" "}
        ties them together: each stack&apos;s globs, the profiles, and the
        standards version, currently <code>{version}</code>.
      </p>

      <h2>Where the rules live</h2>
      <p>
        The rules are written once, in <code>standards/core.md</code> and{" "}
        <code>standards/stacks/*.md</code>. These are the only files a human
        edits. The CLI renders them into the files each assistant reads:{" "}
        <code>.github/copilot-instructions.md</code>, <code>AGENTS.md</code>,{" "}
        <code>CLAUDE.md</code> and <code>.cursor/rules/</code>.{" "}
        <code>redline init</code> writes them into a repository, and{" "}
        <Link href="/docs/distribution">sync</Link> keeps them current.
      </p>

      <h2>Changing a rule</h2>
      <p>
        A merged change reaches every onboarded repository as a pull request, so
        treat it as a production change. Rule ids are permanent: reword a rule
        freely, but never rename or delete its id.
      </p>
      <LifecycleSteps steps={STANDARDS_EDIT} />
    </DocsPage>
  );
}
