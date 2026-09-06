import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { loadManifest } from "@/lib/manifest";
import { STANDARDS, findBySlug } from "@/lib/registry";
import { bySeverityDesc, rulesForStack, type RuleEntry } from "@/lib/rules";
import { STANDARDS_INFO } from "@/lib/standards-info";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { CodeWindow } from "@/components/code-window";
import { STANDARDS_EDIT, profilesIncluding, severityBreakdown } from "@/lib/lifecycle";

export function generateStaticParams() {
  return STANDARDS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(STANDARDS, slug);
  return { title: entry ? `${entry.title} — Standards` : "Standards" };
}

function RuleTable({ rules }: { rules: RuleEntry[] }) {
  const ordered = bySeverityDesc(rules);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr><th>Rule id</th><th>Severity</th><th>Catches</th></tr>
        </thead>
        <tbody>
          {ordered.map((r) => (
            <tr key={r.id}>
              <td><code>{r.id}</code></td>
              <td>{r.severity}</td>
              <td>{r.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = findBySlug(STANDARDS, slug);
  if (!entry) notFound();

  const manifest = loadManifest();
  const isCore = slug === "core";
  const isManifest = slug === "manifest";
  const stack = isCore || isManifest ? undefined : manifest.stacks[slug];
  const rules = isCore ? rulesForStack("core") : stack ? rulesForStack(slug) : [];
  const ruleStack = isCore ? "core" : slug;
  const profiles = isCore || isManifest ? [] : profilesIncluding(slug);
  const counts = severityBreakdown(ruleStack);
  // Core carries no SUGGESTION rules, so an unconditional three-part sentence
  // would read "and 0 SUGGESTION". List only the tiers that exist.
  const breakdown = (["BLOCKER", "HIGH", "SUGGESTION"] as const)
    .filter((sev) => counts[sev] > 0)
    .map((sev) => `${counts[sev]} ${sev}`)
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
  // The output contract shown with this file's own id, taken from its highest
  // severity rule — a generic placeholder would not tell the reader what their
  // findings will actually look like.
  const sample = bySeverityDesc(rules)[0];
  const example = sample
    ? `Redline/${sample.severity} [${sample.id}]: <one-line problem>`
    : `Redline/BLOCKER [${ruleStack}/<slug>]: <one-line problem>`;

  return (
    <DocsPage
      crumb={`Reference / Standards / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href={`/docs/standards/${slug}`}
    >
      {isManifest ? (
        <>
          <h2>What this is</h2>
          <p>
            The single config file everything else is generated from — stack
            globs, which stacks compose each profile, vendor on/off switches,
            and the standards version every rendered file names.
          </p>
          <h2>How to onboard it</h2>
          <p>
            Nothing to onboard: it arrives with the CLI. <code>redline init</code>{" "}
            reads it to detect which stacks your profile includes and which
            vendors to render for. You never install or copy this file into a
            product repository — it stays in the source repo and ships inside
            the published package.
          </p>
          <h2>How to use it</h2>
          <ul>
            <li><code>core</code> — the source file every profile always includes.</li>
            <li><code>stacks</code> — one entry per stack: title, source markdown, <code>globs</code> (plain, never negated or brace-expanded — Copilot&apos;s <code>applyTo</code> can&apos;t express either), and an optional <code>extends</code> list.</li>
            <li><code>profiles</code> — named lists of stack ids; see <Link href="/docs/standards">Standards</Link> for the full table.</li>
            <li><code>profileAliases</code> — legacy profile names accepted for backwards compatibility.</li>
            <li><code>vendors</code> — which of the four renderers are enabled by default (Cursor ships off).</li>
          </ul>
          <h2>Expected output</h2>
          <p>
            The manifest produces no findings of its own. What it decides is
            which rule files get composed into each rendered artifact and under
            which <code>applyTo</code> globs — so an error here shows up as a
            stack that never loads, or one that loads on the wrong files, rather
            than as a bad review comment.
          </p>
          <p>
            <code>scripts/validate.mjs</code> is what catches that: it fails the
            build on a stack whose source is missing, a profile naming an unknown
            stack, an alias shadowing a real profile, and on globs Copilot&apos;s{" "}
            <code>applyTo</code> cannot express — negated (<code>!</code>), brace
            expansions, or a glob containing the separator comma.
          </p>
          <h2>How to edit it</h2>
          <p>
            It is part of <code>standards/</code>, so the same discipline applies
            as to the rule files themselves — including the version bump, which
            lives in this very file.
          </p>
          <LifecycleSteps steps={STANDARDS_EDIT} />
        </>
      ) : (
        <>
          <h2>What this is</h2>
          <p>
            {isCore
              ? "The rules that apply to every file in every profile, regardless of stack — security, type safety, error handling, scope discipline, and the output contract itself."
              : (STANDARDS_INFO[slug] ?? entry.description)}
          </p>
          {stack?.extends && stack.extends.length > 0 && (
            <p>
              Extends{" "}
              {stack.extends.map((base, i) => (
                <span key={base}>
                  {i > 0 && ", "}
                  <Link href={`/docs/standards/${base}`}>{manifest.stacks[base]?.title ?? base}</Link>
                </span>
              ))}{" "}
              — those rules apply too; this file only adds what&apos;s specific
              to {entry.title}.
            </p>
          )}

          <h2>How to onboard it</h2>
          {isCore ? (
            <p>
              Nothing to do, and nothing you can opt out of. Core is included by
              every profile and applies to every file — it has no globs to match
              because it is not stack-scoped. Onboarding a repository at all
              onboards these rules.
            </p>
          ) : (
            <>
              <p>
                A repository picks up this stack by onboarding on a profile that
                includes it. <code>redline init</code> detects the profile from
                what is in the repository, so in most cases this is automatic:
              </p>
              <CodeWindow title="terminal" copyText={`npx redlinegate init --profile ${profiles[0] ?? "web"}`}>
                <span className="tk-prompt">$</span>{" "}
                <span className="tk-white">npx redlinegate init</span>
                <span className="tk-dim">{"  # detects the profile"}</span>
                {"\n"}
                <span className="tk-prompt">$</span>{" "}
                <span className="tk-white">npx redlinegate init --profile {profiles[0] ?? "web"}</span>
                <span className="tk-dim">{"  # or name one"}</span>
              </CodeWindow>
              {profiles.length > 0 ? (
                <p>
                  {profiles.length === 1 ? "One profile pulls" : `${profiles.length} profiles pull`}{" "}
                  these rules in:{" "}
                  {profiles.map((name, i) => (
                    <span key={name}>
                      {i > 0 && ", "}
                      <code>{name}</code>
                    </span>
                  ))}
                  . {stack?.extends?.length ? "A profile that includes a stack extending this one gets these rules too." : ""}
                </p>
              ) : (
                <p>
                  No profile in the manifest currently pulls this stack in, so no
                  repository receives these rules today.
                </p>
              )}
              {stack && (
                <>
                  <p>Once onboarded, your files match this stack when they fit any of these globs:</p>
                  <ul>
                    {stack.globs.map((g) => (
                      <li key={g}><code>{g}</code></li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <h2>How to use it — {rules.length} rules</h2>
          <p>
            Nothing to run. Once your profile includes{" "}
            {isCore ? "core (every profile does)" : entry.title},{" "}
            <code>redline init</code> renders these rules into your repository&apos;s
            AI tooling and the reviewer applies them on every pull request. When a
            review comment cites one of these ids, this table is where to look up
            what it catches and why.
          </p>
          {rules.length > 0 ? (
            <RuleTable rules={rules} />
          ) : (
            <p>No rules were found for this stack at build time.</p>
          )}

          <h2>Expected output</h2>
          <p>
            A finding from this file, and every finding Redline produces, opens
            with a machine-readable first line — severity, then the rule id in
            brackets, then the problem in one line:
          </p>
          <CodeWindow title="a finding from this file" copyText={example}>
            <span className="tk-white">{example}</span>
          </CodeWindow>
          <p>
            Ids are aggregated per rule, which is how the organisation finds out
            which rules earn their place and which only generate noise — so a
            finding without a valid id cannot be measured and counts as untagged.
            Of the {rules.length} rules here, {breakdown}. Only a BLOCKER must not
            merge; a SUGGESTION may be dismissed without justification, and is
            never upgraded to get attention.
          </p>
          <p>
            If a rule here fires constantly on code your team has deliberately
            decided to allow, that is the signal to raise with the standards owner
            — the rule id is what makes that conversation measurable — not to
            argue it away comment by comment.
          </p>

          <h2>How to edit it</h2>
          <p>
            Rules are edited in <code>{entry.file}</code> and nowhere else. The
            rendered copies in <code>AGENTS.md</code>,{" "}
            <code>.github/copilot-instructions.md</code> and{" "}
            <code>.github/instructions/</code> are generated and are overwritten by
            the next render. A change here propagates to every onboarded repository
            as a pull request, so treat it as a production change.
          </p>
          <LifecycleSteps steps={STANDARDS_EDIT} />
          <p>
            <b>Rule ids are permanent.</b> Rewording a rule is fine and keeps its
            id; renaming or removing an id orphans every historical telemetry
            record that cited it.
          </p>
        </>
      )}

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
