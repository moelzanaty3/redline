"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import {
  META_PHASE,
  PHASES,
  type CatalogEntry,
  type Kind,
  type Phase,
  countsByPhaseOfKind,
  entriesOfKind,
  hrefOf,
  installCommand,
  publisherOf,
  stacksOfKind,
} from "@/lib/skills-catalog";

type StackFilter = string | "all";
type PhaseFilter = Phase | "all";

const ALL_PHASES = [...PHASES, META_PHASE];
const PHASE_SHORT = new Map(ALL_PHASES.map((p) => [p.id, p.short]));
const VALID_PHASES = new Set<string>(ALL_PHASES.map((p) => p.id));
const MAX_QUERY = 100;

function matches(
  entry: CatalogEntry,
  phase: PhaseFilter,
  stack: StackFilter,
  query: string,
): boolean {
  if (phase !== "all" && !entry.phases.includes(phase)) return false;
  if (stack !== "all" && !entry.stacks.includes(stack)) return false;
  if (query === "") return true;
  const p = publisherOf(entry);
  const hay =
    `${entry.title} ${entry.name} ${entry.summary} ${entry.reachFor} ${p.name} ${p.owner} ${p.repo} ${entry.stacks.join(" ")}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((t) => hay.includes(t));
}

function Card({ entry, activePhase }: { entry: CatalogEntry; activePhase: PhaseFilter }) {
  const p = publisherOf(entry);
  const cmd = installCommand(p);
  return (
    // Not an <a> wrapping the card. The most valuable string on it is the
    // install command, and a copy button inside a link is both invalid markup
    // and unreachable by click. The title carries the link and stretches over
    // the card for the large target; the copy button lifts back above it.
    <article className="sk-card">
      <div className="sk-card-top">
        {p.official && (
          <span className="sk-official" title={`Published by ${p.name} themselves`}>
            Official
          </span>
        )}
        <span aria-hidden="true" className="sk-arrow">
          →
        </span>
      </div>
      <h3 className="sk-title">
        <Link className="sk-link" href={hrefOf(entry)}>
          {entry.title}
        </Link>
      </h3>
      <div className="sk-pub">
        {p.owner}/{p.repo}
      </div>
      <p className="sk-sum">{entry.summary}</p>
      <p className="sk-reach">
        <b>Reach for it when</b> {entry.reachFor}
      </p>
      <div className="sk-tags">
        {/* Phases are on the card because anything spanning two of them is
            listed in two sections, and without this the repeat reads as a bug. */}
        {entry.phases.map((ph) => (
          <span className={`sk-tag phase${activePhase === ph ? " on" : ""}`} key={ph}>
            {PHASE_SHORT.get(ph)}
          </span>
        ))}
        {entry.stacks.map((s) => (
          <span className="sk-tag" key={s}>
            {s}
          </span>
        ))}
      </div>
      <div className="sk-install-row">
        <code>{cmd}</code>
        <CopyButton
          ariaLabel={`Copy install command for ${p.owner}/${p.repo}`}
          label="Copy"
          text={cmd}
        />
      </div>
      {/* Copying from the grid is the likeliest path to running this command,
          so the repo-scope warning has to be here too — not only in the callout
          above the explorer and on the detail page. */}
      <p className="sk-card-scope">
        Installs all of <b>{p.repo}</b>, not this one alone.
      </p>
    </article>
  );
}

export function SkillsExplorer({ kind }: { kind: Kind }) {
  const all = useMemo(() => entriesOfKind(kind), [kind]);
  const stacks = useMemo(() => stacksOfKind(kind), [kind]);
  const phaseCounts = useMemo(() => countsByPhaseOfKind(kind), [kind]);
  const validStacks = useMemo(() => new Set(stacks), [stacks]);
  const noun = kind === "agent" ? "agents" : "skills";

  const [phase, setPhase] = useState<PhaseFilter>("all");
  const [stack, setStack] = useState<StackFilter>("all");
  const [query, setQuery] = useState("");
  // Filters start unset on both server and client so hydration matches, then the
  // URL is applied once mounted. Doing it in the initialiser would render one
  // set of results on the server and a different one in the browser.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // A query string is external input, so it is validated rather than trusted:
    // an unknown ?phase= would otherwise filter the list down to nothing and
    // read as a broken page rather than a bad link.
    const sp = new URLSearchParams(window.location.search);
    const ph = sp.get("phase");
    const st = sp.get("stack");
    const q = sp.get("q");
    if (ph !== null && VALID_PHASES.has(ph)) setPhase(ph as Phase);
    if (st !== null && validStacks.has(st)) setStack(st);
    if (q !== null) setQuery(q.slice(0, MAX_QUERY));
    setHydrated(true);
  }, [validStacks]);

  // replaceState rather than push: filtering is not navigation, and a dozen chip
  // clicks should not cost a dozen presses of the back button to escape.
  useEffect(() => {
    if (!hydrated) return;
    const sp = new URLSearchParams();
    if (phase !== "all") sp.set("phase", phase);
    if (stack !== "all") sp.set("stack", stack);
    if (query.trim() !== "") sp.set("q", query.trim());
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [hydrated, phase, stack, query]);

  const results = useMemo(
    () => all.filter((e) => matches(e, phase, stack, query.trim())),
    [all, phase, stack, query],
  );

  // With no phase picked the list is grouped by phase so the shape of delivery
  // is the first thing you see. Pick one and the grouping becomes a single
  // heading repeating the filter you just set, so it collapses to a flat grid.
  const grouped = phase === "all";
  const sections = grouped
    ? ALL_PHASES.map((p) => ({
        phase: p,
        items: results.filter((e) => e.phases.includes(p.id)),
      })).filter((s) => s.items.length > 0)
    : [];

  const active = phase === "all" ? null : ALL_PHASES.find((p) => p.id === phase);
  const filtered = phase !== "all" || stack !== "all" || query.trim() !== "";

  const reset = () => {
    setPhase("all");
    setStack("all");
    setQuery("");
  };

  return (
    <div className="sk-explorer">
      {/* No wrapper around the rail and the controls. A sticky element only
          sticks inside its own containing block, so grouping these in a div
          would unstick the rail ~190px down the page — exactly where the
          results start and it begins to earn its keep. */}
      <div aria-label="Filter by delivery phase" className="sk-rail" role="group">
        {PHASES.map((p, i) => (
          <button
            aria-pressed={phase === p.id}
            className={`sk-stage${phase === p.id ? " on" : ""}`}
            disabled={phaseCounts.get(p.id) === 0}
            key={p.id}
            onClick={() => setPhase(phase === p.id ? "all" : p.id)}
            type="button"
          >
            <span className="sk-stage-n">{String(i + 1).padStart(2, "0")}</span>
            <span className="sk-stage-l">{p.short}</span>
            <span className="sk-stage-c">{phaseCounts.get(p.id)}</span>
          </button>
        ))}
        <button
          aria-pressed={phase === META_PHASE.id}
          className={`sk-stage meta${phase === META_PHASE.id ? " on" : ""}`}
          disabled={phaseCounts.get(META_PHASE.id) === 0}
          onClick={() => setPhase(phase === META_PHASE.id ? "all" : META_PHASE.id)}
          type="button"
        >
          <span className="sk-stage-n">··</span>
          <span className="sk-stage-l">{META_PHASE.short}</span>
          <span className="sk-stage-c">{phaseCounts.get(META_PHASE.id)}</span>
        </button>
      </div>

      <div className="sk-controls">
        <input
          aria-label={`Search ${noun}`}
          className="sk-search"
          maxLength={MAX_QUERY}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${noun} — react, security, tests, cloudflare…`}
          type="search"
          value={query}
        />
        <div aria-label="Filter by stack" className="sk-chips" role="group">
          <button
            aria-pressed={stack === "all"}
            className={`sk-chip${stack === "all" ? " on" : ""}`}
            onClick={() => setStack("all")}
            type="button"
          >
            All stacks
          </button>
          {stacks.map((s) => (
            <button
              aria-pressed={stack === s}
              className={`sk-chip${stack === s ? " on" : ""}`}
              key={s}
              onClick={() => setStack(stack === s ? "all" : s)}
              type="button"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="sk-count">
        {/* Announced, because for a screen reader the only evidence a filter
            did anything is this number changing. */}
        <span aria-atomic="true" aria-live="polite">
          {filtered
            ? `${results.length} of ${all.length} shown`
            : `${all.length} ${noun}`}
        </span>
        {filtered && (
          <button className="sk-reset" onClick={reset} type="button">
            Clear filters
          </button>
        )}
      </div>

      {active && (
        <div className="sk-phase-note">
          <b>{active.label}.</b> {active.blurb}
        </div>
      )}

      {grouped && (
        <p className="sk-hint">
          Ordered by delivery phase. Anything that spans two phases is listed under
          both — the phase chips on each card say which.
        </p>
      )}

      {results.length === 0 && (
        <p className="sk-empty">
          <b>Nothing here matches.</b> This page lists {all.length} {noun}; the
          registry itself runs to thousands.{" "}
          <button className="sk-reset" onClick={reset} type="button">
            Clear the filters
          </button>{" "}
          or search{" "}
          <a href="https://www.skills.sh" rel="noopener noreferrer" target="_blank">
            skills.sh
          </a>{" "}
          directly.
        </p>
      )}

      {grouped ? (
        sections.map((s) => (
          <section className="sk-section" key={s.phase.id}>
            <h2 id={s.phase.id}>
              {s.phase.label} <span>{s.items.length}</span>
            </h2>
            <p className="sk-section-blurb">{s.phase.blurb}</p>
            <div className="sk-grid">
              {s.items.map((e) => (
                <Card activePhase={phase} entry={e} key={`${e.publisher}/${e.name}`} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="sk-grid">
          {results.map((e) => (
            <Card activePhase={phase} entry={e} key={`${e.publisher}/${e.name}`} />
          ))}
        </div>
      )}
    </div>
  );
}
