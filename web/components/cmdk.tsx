"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEARCH_INDEX, type SearchEntry } from "@/lib/docs-nav";

export function openCmdk() {
  window.dispatchEvent(new CustomEvent("redline:cmdk"));
}

export function Cmdk() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SEARCH_INDEX;
    const terms = q.split(/\s+/);
    return SEARCH_INDEX.filter((e) => {
      const hay = `${e.title} ${e.description} ${e.keywords} ${e.group}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, { entry: SearchEntry; index: number }[]>();
    results.forEach((entry, index) => {
      const list = map.get(entry.group) ?? [];
      list.push({ entry, index });
      map.set(entry.group, list);
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
            placeholder="Search documentation…"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="cmdk-list">
          {results.length === 0 && <div className="cmdk-empty">No results for “{query}”</div>}
          {grouped.map(([group, items]) => (
            <div key={group}>
              <div className="cmdk-group">{group}</div>
              {items.map(({ entry, index }) => (
                <button
                  key={entry.href + entry.title}
                  type="button"
                  className={`cmdk-item${index === active ? " active" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(entry.href)}
                >
                  <span className="t">{entry.title}</span>
                  <span className="d">{entry.description}</span>
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
