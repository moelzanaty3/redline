"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

export type Tok = { t: string; c?: string };
export type Line = { toks: Tok[]; cmd?: boolean };

const CMD_PAUSE = 240;
const OUT_PAUSE = 46;
const LEAD_IN = 120;

export function JourneyTerminal({ lines, title }: { lines: Line[]; title: string }) {
  // Starts fully revealed so the server-rendered HTML, the pre-hydration paint and a
  // JavaScript-disabled browser all show the complete transcript. Replay is the
  // enhancement, not the only way to read it.
  const [shown, setShown] = useState(lines.length);
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // Replay never *removes* the transcript. Every line stays in flow and stays
  // legible; the sweep only lifts each line from pending to full strength as the
  // cursor reaches it. The previous version reset to zero visible lines while the
  // hidden ones still held their space, so the section whose entire job is to
  // prove the tool runs opened as a ~750px rectangle of empty black for three
  // seconds — indistinguishable from a render failure. Dimming instead of hiding
  // keeps the box full of text at every frame and costs no layout shift.
  const play = useCallback(() => {
    stop();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      setShown(lines.length);
      return;
    }
    setPlaying(true);
    setShown(0);
    const step = (i: number): void => {
      setShown(i + 1);
      if (i + 1 >= lines.length) {
        setPlaying(false);
        return;
      }
      timer.current = setTimeout(() => step(i + 1), lines[i]?.cmd ? CMD_PAUSE : OUT_PAUSE);
    };
    timer.current = setTimeout(() => step(0), LEAD_IN);
  }, [lines, stop]);

  useEffect(() => {
    setMounted(true);
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            io.disconnect();
            play();
          }
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      stop();
    };
  }, [play, stop]);

  return (
    <div className="jr-term" ref={hostRef}>
      <div className="jr-bar">
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <span className="jr-title">{title}</span>
        {mounted ? (
          <button
            type="button"
            className="jr-replay"
            onClick={play}
            aria-label="Replay the redline init and redline verify transcript"
          >
            <span aria-hidden="true">▸</span> Replay
          </button>
        ) : null}
      </div>
      <pre className={`jr-pre${playing ? " run" : ""}`}>
        {lines.map((line, i) => (
          <Fragment key={`${i}-${line.toks[0]?.t ?? ""}`}>
            <span
              className={`jr-l${playing && i >= shown ? " pend" : ""}${
                playing && i === shown - 1 ? " cur" : ""
              }`}
            >
              {line.toks.map((tok, j) => (
                <span key={j} className={tok.c}>
                  {tok.t}
                </span>
              ))}
            </span>
            {"\n"}
          </Fragment>
        ))}
      </pre>
    </div>
  );
}
