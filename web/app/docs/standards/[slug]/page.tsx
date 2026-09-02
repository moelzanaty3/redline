import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { loadManifest } from "@/lib/manifest";
import { STANDARDS, findBySlug } from "@/lib/registry";
import { bySeverityDesc, rulesForStack, type RuleEntry } from "@/lib/rules";
import { STANDARDS_INFO } from "@/lib/standards-info";

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

  return (
    <DocsPage
      crumb={`Reference / Standards / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href="/docs/standards"
    >
      {isManifest ? (
        <>
          <h2>What this is</h2>
          <p>
            The single config file everything else is generated from — stack
            globs, which stacks compose each profile, vendor on/off switches,
            and the standards version every rendered file names.
          </p>
          <h2>When it applies to you</h2>
          <p>
            Indirectly, always: <code>redline init</code> reads it to detect
            which stacks your profile includes and which vendors to render
            for. You don&apos;t edit it directly as a developer — a standards
            change lands here and reaches your repo as a pull request the
            next time you re-run <code>redline init</code>.
          </p>
          <h2>What it actually does</h2>
          <ul>
            <li><code>core</code> — the source file every profile always includes.</li>
            <li><code>stacks</code> — one entry per stack: title, source markdown, <code>globs</code> (plain, never negated or brace-expanded — Copilot&apos;s <code>applyTo</code> can&apos;t express either), and an optional <code>extends</code> list.</li>
            <li><code>profiles</code> — named lists of stack ids; see <Link href="/docs/standards">Standards</Link> for the full table.</li>
            <li><code>profileAliases</code> — legacy profile names accepted for backwards compatibility.</li>
            <li><code>vendors</code> — which of the four renderers are enabled by default (Cursor ships off).</li>
          </ul>
          <h2>What you do with it</h2>
          <p>
            Nothing, unless you&apos;re changing which files a stack matches
            or which stacks a profile pulls in — and even then, this file is
            part of <code>standards/</code>, so the same versioning and
            changelog discipline applies as to the rule files themselves.
          </p>
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

          <h2>When it applies to you</h2>
          {isCore ? (
            <p>Every file, in every profile — core has no globs to check because it isn&apos;t stack-scoped.</p>
          ) : stack ? (
            <>
              <p>Your files match this stack when they fit any of these globs:</p>
              <ul>
                {stack.globs.map((g) => (
                  <li key={g}><code>{g}</code></li>
                ))}
              </ul>
            </>
          ) : (
            <p>Only on a repo whose profile includes this stack.</p>
          )}

          <h2>What it actually does — {rules.length} rules</h2>
          {rules.length > 0 ? (
            <RuleTable rules={rules} />
          ) : (
            <p>No rules were found for this stack at build time.</p>
          )}

          <h2>What you do with it</h2>
          <p>
            Nothing directly — once your profile includes {isCore ? "core (every profile does)" : entry.title}, <code>redline init</code> renders this into your repo&apos;s AI tooling automatically. When a review comment cites one of these ids, this table is where to look up what it catches and why. If a rule fires constantly on code your team has deliberately decided to allow, that&apos;s the signal to raise with the standards owner — not to argue it away comment by comment.
          </p>
        </>
      )}

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
