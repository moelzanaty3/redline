import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeWindow } from "@/components/code-window";
import { loadManifest, stackDef } from "@/lib/manifest";
import { profilesIncluding } from "@/lib/lifecycle";
import { findBySlug, STANDARDS } from "@/lib/registry";
import { findRule, getRules } from "@/lib/rules";
import { ruleAnchor } from "@/lib/search-index";

// The canonical address of a rule: /r/<stack>/<slug>.
//
// This route is the other half of the output contract. Every finding Redline
// produces already names a permanent rule id, and until now that id was the
// most useful thing on the line and the least reachable — a reader had the
// exact name of the rule and nowhere to take it. `redline init --docs-url`
// makes the CLI print `→ <base>/r/<rule-id>` under every finding, and this is
// what the other end of that link has to be.
//
// It is deliberately not a redirect into the stack page's anchor. A developer
// arriving from a review comment has one question about one rule, and landing
// them in a table of eighty with one row tinted is answering a question they
// did not ask. The anchor still exists, and this page links to it, because
// "what else applies to this file" is the second question, not the first.
//
// Short path because the string is pasted into review comments by the
// thousand, and stable because a rule id is stable — that is the whole premise
// the telemetry is keyed on.

export const dynamic = "force-static";

type Params = { params: Promise<{ id: string[] }> };

export function generateStaticParams() {
  return getRules().map((rule) => ({ id: rule.id.split("/") }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const rule = findRule(id.join("/"));
  if (rule === undefined) return { title: "Unknown rule" };
  return {
    title: `${rule.id}`,
    description: `${rule.severity} — ${rule.text}`,
  };
}

export default async function Page({ params }: Params) {
  const { id } = await params;
  const ruleId = id.join("/");
  const rule = findRule(ruleId);
  // A rule id that is not in the catalogue is a 404, not a guess. A finding
  // citing an id that no longer exists is a real signal — it means a comment
  // outlived its rule — and quietly resolving it to something near would hide
  // exactly that.
  if (rule === undefined) notFound();

  const manifest = loadManifest();
  const deterministic = (manifest.deterministic ?? []).includes(rule.id);
  const isCore = rule.stack === "core";
  const stack = stackDef(rule.stack);
  const entry = findBySlug(STANDARDS, rule.stack);
  const profiles = isCore ? Object.keys(manifest.profiles).sort() : profilesIncluding(rule.stack);
  const globs = stack?.globs ?? [];

  // Rules that sit beside this one under the same heading in the same file are
  // the ones a reader who got here from a finding most often wants next: the
  // same severity, the same stack, the near-misses of the thing they just hit.
  const siblings = getRules()
    .filter((r) => r.stack === rule.stack && r.severity === rule.severity && r.id !== rule.id)
    .slice(0, 6);

  return (
    <main className="rule-page" id="content" tabIndex={-1}>
      <nav className="crumb" aria-label="Breadcrumb">
        <Link href="/docs">Docs</Link>
        <span className="sep" aria-hidden="true">/</span>
        <Link href="/docs/standards">Standards</Link>
        <span className="sep" aria-hidden="true">/</span>
        {entry ? <Link href={`/docs/standards/${rule.stack}`}>{entry.title}</Link> : <span>{rule.stack}</span>}
        <span className="sep" aria-hidden="true">/</span>
        <span aria-current="page">rule</span>
      </nav>

      <div className="rule-head">
        <span className={`rule-sev sv-${rule.severity.toLowerCase()}`}>{rule.severity}</span>
        <h1>{rule.id}</h1>
      </div>

      <p className="rule-text">{rule.text}</p>

      <div className="rule-facts">
        <div>
          <dt>Decided by</dt>
          <dd>
            {deterministic ? (
              <>
                a checker, <b>with no model call</b> —{" "}
                <Link href="/docs/deterministic">the deterministic tier</Link>
              </>
            ) : (
              "review judgement"
            )}
          </dd>
        </div>
        <div>
          <dt>Severity means</dt>
          <dd>
            {rule.severity === "BLOCKER" && "must not merge."}
            {rule.severity === "HIGH" && "merge is a deliberate trade-off a reviewer acknowledges."}
            {rule.severity === "SUGGESTION" && "optional — the author may dismiss it without justification."}{" "}
            <Link href="/docs/output-contract">The output contract</Link>
          </dd>
        </div>
        <div>
          <dt>Applies to</dt>
          <dd>
            {globs.length > 0 ? (
              globs.map((g, i) => (
                <span key={g}>
                  {i > 0 ? ", " : ""}
                  <code>{g}</code>
                </span>
              ))
            ) : (
              "every file — the core standard is not scoped by stack"
            )}
          </dd>
        </div>
        <div>
          <dt>Reaches</dt>
          <dd>
            {profiles.length} profile{profiles.length === 1 ? "" : "s"}:{" "}
            {profiles.map((p, i) => (
              <span key={p}>
                {i > 0 ? ", " : ""}
                <code>{p}</code>
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Defined in</dt>
          <dd>
            <code>
              {rule.source}:{rule.line}
            </code>
          </dd>
        </div>
      </div>

      <h2>Read it in the terminal</h2>
      <p>
        The same facts, from the checkout you are already in — no browser, and no
        network.
      </p>
      <CodeWindow title="terminal" copyText={`npx redlinegate explain ${rule.id}`}>
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx redlinegate explain {rule.id}</span>
      </CodeWindow>

      <h2>Where this came from</h2>
      <p>
        You are most likely here from a review comment. A finding names its rule
        and, when your repository has told Redline where the standard is
        published, its address:
      </p>
      <CodeWindow title="on the pull request">
        <span className="tk-red">Redline/{rule.severity}</span>{" "}
        <span className="tk-blue">[{rule.id}]</span>
        <span className="tk-dim">: …</span>
        {"\n"}
        <span className="tk-dim">{"  → "}</span>
        <span className="tk-dim">…/r/{rule.id}</span>
      </CodeWindow>
      <p>
        That second line is written by <code>redline init --docs-url</code> and
        is empty until an organisation sets one — there is no default, because a
        link to somebody else&apos;s copy of the standard is worse than no link.
        See <Link href="/docs/onboarding">Onboard a repository</Link>.
      </p>

      <h2>In context</h2>
      <p>
        {isCore ? (
          <>
            This is a core rule: it applies in every profile, and every stack
            extends it rather than overriding it. The{" "}
            <Link href={`/docs/standards/core#${ruleAnchor(rule.id)}`}>
              core standard
            </Link>{" "}
            lists it beside everything else a reviewer is asked to consider.
          </>
        ) : (
          <>
            The{" "}
            <Link href={`/docs/standards/${rule.stack}#${ruleAnchor(rule.id)}`}>
              {entry?.title ?? rule.stack} standard
            </Link>{" "}
            lists this rule with the rest of its stack, in the file a reviewer
            and an AI assistant both read.
          </>
        )}
      </p>

      {siblings.length > 0 && (
        <>
          <h2>Other {rule.severity} rules in this stack</h2>
          <ul className="rule-siblings">
            {siblings.map((s) => (
              <li key={s.id}>
                <Link href={`/r/${s.id}`}>
                  <code>{s.id}</code>
                </Link>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
