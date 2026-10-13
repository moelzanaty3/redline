import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { loadManifest } from "@/lib/manifest";
import { SEEDS, STANDARDS, findBySlug } from "@/lib/registry";
import { bySeverityDesc, rulesForStack, type RuleEntry } from "@/lib/rules";
import { STANDARDS_INFO } from "@/lib/standards-info";
import { ruleAnchor } from "@/lib/search-index";
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
            /* The row is the anchor a ⌘K rule result lands on. Without it the
               search knows the rule and can only offer the page that lists it,
               which on a stack page is a table of eighty. */
            <tr key={r.id} id={ruleAnchor(r.id)}>
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
  const seed = findBySlug(SEEDS, slug);
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
          <p>
            The one config file the renderer reads to decide which rule files go
            into which artifact, under which globs, for which assistants. It
            ships inside the published package; a product repository never
            carries a copy. <code>redline init</code> reads it to detect a
            profile and to know which vendors it can render for.
          </p>
          <h2>What it holds</h2>
          <ul>
            <li><code>version</code> — the standards version every rendered file and every sync pull request names.</li>
            <li><code>core</code> — the source file every profile includes.</li>
            <li><code>stacks</code> — one entry per stack: title, source markdown, <code>globs</code> (plain, never negated or brace-expanded — Copilot&apos;s <code>applyTo</code> can&apos;t express either), and an optional <code>extends</code> list.</li>
            <li><code>profiles</code> — named lists of stack ids. A repository installs exactly one; see <Link href="/docs/profiles">Profiles &amp; stacks</Link>.</li>
            <li><code>profileAliases</code> — older profile names, still accepted, mapped to current ones.</li>
            <li><code>vendors</code> — the assistants the renderer can write for, and whether each is on by default.</li>
            <li><code>deterministic</code> — the rule ids a checker decides without a model; see <Link href="/docs/deterministic">Deterministic rules</Link>.</li>
          </ul>
          <h2>What a mistake here looks like</h2>
          <p>
            Not a bad review comment: a stack that never loads, or one that loads
            on the wrong files. <code>scripts/validate.mjs</code> fails CI on a
            stack whose source is missing, a profile naming an unknown stack, an
            alias shadowing a real profile, and globs Copilot&apos;s{" "}
            <code>applyTo</code> cannot express — negated (<code>!</code>), brace
            expansions, or a glob containing the separator comma.
          </p>
          <h2>Changing it</h2>
          <p>
            It is part of <code>standards/</code>, so the same loop applies as to
            the rule files, including the version bump, which lives in this very
            file.
          </p>
          <LifecycleSteps steps={STANDARDS_EDIT} />
        </>
      ) : (
        <>
          <p>
            {isCore
              ? "The rules that apply to every file in every profile, regardless of stack — security, type safety, error handling, scope discipline, and the output contract itself."
              : (STANDARDS_INFO[slug] ?? entry.description)}
          </p>
          {stack?.extends && stack.extends.length > 0 ? (
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
          ) : null}

          <h2>Which repositories get it</h2>
          {isCore ? (
            <p>
              Every one. Core is in every profile and applies to every file, so it
              has no globs. Onboarding a repository at all onboards these rules.
            </p>
          ) : (
            <>
              {profiles.length > 0 ? (
                <p>
                  A repository on {profiles.length === 1 ? "this profile" : `any of these ${profiles.length} profiles`}:{" "}
                  {profiles.map((name, i) => (
                    <span key={name}>
                      {i > 0 && ", "}
                      <code>{name}</code>
                    </span>
                  ))}
                  . <code>redline init</code> detects the profile and{" "}
                  <code>--profile</code> overrides it — see{" "}
                  <Link href="/docs/profiles">Profiles &amp; stacks</Link>.
                </p>
              ) : (
                <p>
                  None today: no profile in the manifest pulls this stack in, so no
                  repository receives these rules.
                </p>
              )}
              {stack && (
                <>
                  <p>Within such a repository, a file gets these rules when it matches one of these globs:</p>
                  <ul>
                    {stack.globs.map((g) => (
                      <li key={g}><code>{g}</code></li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <h2>The {rules.length} rules</h2>
          <p>
            When a review comment cites one of these ids, this is where to look up
            what it catches. Of the {rules.length}, {breakdown}. A finding from
            this file opens like this:
          </p>
          <CodeWindow title="a finding from this file" copyText={example}>
            <span className="tk-white">{example}</span>
          </CodeWindow>
          <p>
            What each severity obliges you to do is on{" "}
            <Link href="/docs/output-contract">The output contract</Link>.
          </p>
          {rules.length > 0 ? (
            <RuleTable rules={rules} />
          ) : (
            <p>No rules were found for this stack at build time.</p>
          )}

          <h2>Changing a rule</h2>
          <p>
            Edit <code>{entry.file}</code> and nowhere else. Every other copy is
            generated from it. A merged change reaches every onboarded repository
            as a pull request, so treat it as a production change.
          </p>
          <p>
            <b>Rule ids are permanent.</b> Reword a rule freely; it keeps its id.
            Renaming or removing an id orphans every telemetry record that cited
            it.
          </p>
          <LifecycleSteps steps={STANDARDS_EDIT} />
        </>
      )}

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/output-contract">The output contract</Link> — what
          each severity obliges you to do.
        </li>
        <li>
          <Link href="/docs/profiles">Profiles &amp; stacks</Link> — how a
          repository ends up with a set of rules.
        </li>
        {seed ? (
          <li>
            <Link href={`/docs/seeds/${seed.slug}`}>Seeded corpus: {seed.title}</Link>{" "}
            — the known-bad code that tests whether reviewers catch these rules.
          </li>
        ) : null}
        <li>
          <Link href="/docs/standards">All standards</Link>
        </li>
      </ul>

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
