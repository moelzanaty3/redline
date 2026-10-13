"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

export type Tok = { t: string; c?: string };
export type Line = { toks: Tok[]; cmd?: boolean };
export type Chapter = { title: ReactNode; body: ReactNode; lines: Line[] };

// The transcript is told in chapters: each step on the left owns a run of lines
// in the terminal on the right, and the terminal grows to the step being read.
// Nothing here is a second copy of the transcript — the steps only decide how
// much of the one transcript is showing.
export function JourneyScroll({ chapters, title }: { chapters: Chapter[]; title: string }) {
  // null until the observer first reports. The server HTML, the pre-hydration
  // paint and a JavaScript-disabled browser therefore show every chapter at full
  // strength; the scroll-linked state is the enhancement, not the only way in.
  const [active, setActive] = useState<number | null>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const preRef = useRef<HTMLPreElement>(null);
  const chapterRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    // A thin band across the middle of the viewport: whichever step crosses it
    // is the one being read.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.chapter));
          }
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const el of stepRefs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const pre = preRef.current;
    const chapter = active === null ? null : chapterRefs.current[active];
    if (!pre || !chapter) return;
    // Show the end of the transcript so far, unless the current chapter is
    // taller than the panel — then show where it starts, never its tail alone.
    const top = Math.min(chapter.offsetTop - 24, pre.scrollHeight - pre.clientHeight);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pre.scrollTo({ top: Math.max(0, top), behavior: still ? "auto" : "smooth" });
  }, [active]);

  const state = (i: number) =>
    active === null ? "all" : i < active ? "past" : i === active ? "on" : "next";

  return (
    <div className="js-grid">
      <ol className="js-steps">
        {chapters.map((chapter, i) => (
          <li
            key={i}
            className="js-step"
            data-chapter={i}
            data-state={state(i)}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
          >
            <span className="js-n">{String(i + 1).padStart(2, "0")}</span>
            <h3>{chapter.title}</h3>
            <div className="js-body">{chapter.body}</div>
          </li>
        ))}
      </ol>

      <div className="js-stage">
        <div className="jr-term js-term">
          <div className="jr-bar">
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <span className="jr-title">{title}</span>
          </div>
          <pre className="jr-pre js-pre" ref={preRef}>
            {chapters.map((chapter, i) => (
              <span
                key={i}
                className="js-ch"
                data-state={state(i)}
                ref={(el) => {
                  chapterRefs.current[i] = el;
                }}
              >
                {chapter.lines.map((line, j) => (
                  <Fragment key={`${j}-${line.toks[0]?.t ?? ""}`}>
                    <span className="jr-l">
                      {line.toks.map((tok, k) => (
                        <span key={k} className={tok.c}>
                          {tok.t}
                        </span>
                      ))}
                    </span>
                    {"\n"}
                  </Fragment>
                ))}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
