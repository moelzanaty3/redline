"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEARCH_INDEX, type SearchEntry } from "@/lib/docs-nav";
import type { RuleHit } from "@/lib/search-index";

export function openCmdk() {
  window.dispatchEvent(new CustomEvent("redline:cmdk"));
}

// A rule result is not a page result: it carries a severity, its id is the
// thing being matched, and it lands on a row rather than at the top of an
// article. Keeping them in one union lets one keyboard cursor walk both.
type Hit =
  | { kind: "page"; group: string; href: string; title: string; description: string }
  | { kind: "rule"; group: string; href: string; rule: RuleHit };

const RULE_GROUP = "Rules";

// How many rules one query may contribute. A two-letter query matches most of
// the catalogue, and 300 rows of rule would bury every page result under it.
const RULE_LIMIT = 8;

export function Cmdk({
  rules = [],
  body = {},
}: {
  rules?: RuleHit[];
  body?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("redline:cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("redline:cmdk", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = (entries: SearchEntry[]): Hit[] =>
      entries.map((e) => ({
        kind: "page" as const,
        group: e.group,
        href: e.href,
        title: e.title,
        description: e.description,
      }));

    if (!q) return pages(SEARCH_INDEX);
    const terms = q.split(/\s+/);

    // Rules first when the query looks like one. A reader who pasted a rule id
    // wants the rule, not the nine pages that mention its stack.
    const ruleHits: Hit[] = rules
      .filter((r) => {
        const hay = `${r.id} ${r.severity} ${r.text} ${r.stackTitle}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      // An exact id match outranks a rule that merely mentions the words.
      .sort((a, b) => Number(b.id.toLowerCase().includes(q)) - Number(a.id.toLowerCase().includes(q)))
      .slice(0, RULE_LIMIT)
      .map((rule) => ({ kind: "rule" as const, group: RULE_GROUP, href: rule.href, rule }));

    const pageHits = SEARCH_INDEX.filter((e) => {
      // The page's own body is part of the haystack now, so a term that appears
      // only in the prose — `pendingAdmin`, `swiftlint`, "waiting for status" —
      // finds the page that explains it.
      const hay = `${e.title} ${e.description} ${e.keywords} ${e.group} ${body[e.href] ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });

    // Title matches ahead of body-only matches: a page named for the thing you
    // typed is a better answer than one that mentions it in passing.
    const titled = pageHits.filter((e) => `${e.title} ${e.description}`.toLowerCase().includes(q));
    const rest = pageHits.filter((e) => !titled.includes(e));

    return [...ruleHits, ...pages(titled), ...pages(rest)];
  }, [query, rules, body]);

  const grouped = useMemo(() => {
    const map = new Map<string, { hit: Hit; index: number }[]>();
    results.forEach((hit, index) => {
      const list = map.get(hit.group) ?? [];
      list.push({ hit, index });
      map.set(hit.group, list);
    });
    return [...map.entries()];
  }, [results]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  // Keyboard selection has to stay on screen or the arrow keys are steering
  // something the reader cannot see — the same failure the docs sidebar fixes.
  useEffect(() => {
    listRef.current?.querySelector(".cmdk-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      const hit = results[active];
      if (hit) go(hit.href);
    }
  };

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search documentation">
        <div className="cmdk-input-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            placeholder="Search docs and rule ids…"
            aria-label="Search documentation and rule ids"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && <div className="cmdk-empty">No results for “{query}”</div>}
          {grouped.map(([group, items]) => (
            <div key={group}>
              <div className="cmdk-group">{group}</div>
              {items.map(({ hit, index }) => (
                <button
                  key={`${hit.href}-${hit.kind === "rule" ? hit.rule.id : hit.title}`}
                  type="button"
                  className={`cmdk-item${index === active ? " active" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(hit.href)}
                >
                  {hit.kind === "rule" ? (
                    <>
                      <span className="t">
                        <code className="cmdk-rule-id">{hit.rule.id}</code>
                        <span className={`cmdk-sev sev-${hit.rule.severity.toLowerCase()}`}>
                          {hit.rule.severity}
                        </span>
                      </span>
                      <span className="d">{hit.rule.text}</span>
                    </>
                  ) : (
                    <>
                      <span className="t">{hit.title}</span>
                      <span className="d">{hit.description}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
