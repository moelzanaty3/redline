"use client";

import Link from "next/link";
import { useId, useMemo, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { LEARN_STEPS, learnHref } from "@/lib/learn";

// ---------------------------------------------------------------------------
// Progress. Which steps the reader has marked done, kept in this browser only:
// a list of step slugs, nothing about the reader. useSyncExternalStore rather
// than state in an effect, so every component showing progress on the page
// agrees, and a step ticked in another tab shows up here too.
// ---------------------------------------------------------------------------

const PROGRESS_KEY = "redline-learn-done";
const listeners = new Set<() => void>();

function readProgress(): string {
  try {
    return localStorage.getItem(PROGRESS_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeProgress(done: Set<string>) {
  try {
    localStorage.setItem(PROGRESS_KEY, [...done].join(","));
  } catch {
    // storage unavailable: progress lasts for this page view only
  }
  for (const listener of listeners) listener();
}

function useProgress() {
  // The server has no storage, so it renders every step as not done and the
  // ticks appear once the page hydrates.
  const raw = useSyncExternalStore(subscribe, readProgress, () => "");
  return useMemo(() => new Set(raw.split(",").filter(Boolean)), [raw]);
}

/** The button at the foot of each step. */
export function StepDone({ slug }: { slug: string }) {
  const done = useProgress();
  const isDone = done.has(slug);
  const index = LEARN_STEPS.findIndex((s) => s.slug === slug);
  const next = LEARN_STEPS[index + 1];

  function toggle() {
    const updated = new Set(done);
    if (isDone) updated.delete(slug);
    else updated.add(slug);
    writeProgress(updated);
  }

  return (
    <div className={isDone ? "learn-done is-done" : "learn-done"}>
      <button type="button" onClick={toggle} aria-pressed={isDone}>
        <span className="learn-done-box" aria-hidden="true">
          {isDone ? "✓" : ""}
        </span>
        {isDone ? "Step complete" : "Mark this step complete"}
      </button>
      {isDone && next ? (
        <Link href={learnHref(next)} className="learn-done-next">
          Next: {next.n} · {next.title} →
        </Link>
      ) : null}
      {isDone && !next ? <span className="learn-done-next">You finished the path.</span> : null}
    </div>
  );
}

/** Every step as a numbered dot, at the top of each step page. */
export function LearnStepper({ current }: { current: string }) {
  const done = useProgress();
  return (
    <nav className="learn-stepper" aria-label="Learn steps">
      <ol>
        {LEARN_STEPS.map((s) => {
          const state = s.slug === current ? "is-current" : done.has(s.slug) ? "is-done" : "";
          return (
            <li key={s.slug} className={state}>
              <Link
                href={learnHref(s)}
                aria-current={s.slug === current ? "step" : undefined}
                title={`${s.n} · ${s.title}`}
              >
                <span aria-hidden="true">{done.has(s.slug) && s.slug !== current ? "✓" : s.n}</span>
                <span className="learn-sr">
                  {s.n} · {s.title}
                  {done.has(s.slug) ? " (complete)" : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The overview's list of steps, with the reader's progress through them. */
export function LearnPath() {
  const done = useProgress();
  const count = LEARN_STEPS.filter((s) => done.has(s.slug)).length;
  const resume = LEARN_STEPS.find((s) => !done.has(s.slug));
  const first = LEARN_STEPS[0];

  return (
    <div className="learn-path">
      <div className="learn-path-head">
        <div
          className="learn-bar"
          role="progressbar"
          aria-label="Steps complete"
          aria-valuemin={0}
          aria-valuemax={LEARN_STEPS.length}
          aria-valuenow={count}
        >
          <span style={{ width: `${(count / LEARN_STEPS.length) * 100}%` }} />
        </div>
        <span className="learn-path-count">
          {count} of {LEARN_STEPS.length} complete
        </span>
        {count > 0 ? (
          <button type="button" className="learn-path-reset" onClick={() => writeProgress(new Set())}>
            Reset
          </button>
        ) : null}
      </div>
      <ol>
        {LEARN_STEPS.map((s) => (
          <li key={s.slug} className={done.has(s.slug) ? "is-done" : ""}>
            <Link href={learnHref(s)}>
              <span className="learn-path-n" aria-hidden="true">
                {done.has(s.slug) ? "✓" : s.n}
              </span>
              <span className="learn-path-body">
                <b>{s.title}</b>
                <span>{s.summary}</span>
              </span>
              <span className="learn-path-meta">
                {s.minutes} min{s.needsGitHub ? " · GitHub" : ""}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {resume && first ? (
        <Link className="learn-path-go" href={learnHref(resume)}>
          {count === 0 ? "Start with step 00 →" : `Continue: ${resume.n} · ${resume.title} →`}
        </Link>
      ) : (
        <p className="learn-path-go-done">Every step is complete. Nicely done.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs. Every panel is rendered on the server and the inactive ones are only
// hidden, so the text is in the HTML, in search, and readable with no script.
// ---------------------------------------------------------------------------

export type Tab = { label: string; content: ReactNode };

export function Tabs({ label, tabs }: { label: string; tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const base = useId();

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (active + step + tabs.length) % tabs.length;
    setActive(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  }

  return (
    <div className="learn-tabs">
      <div role="tablist" aria-label={label}>
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKey}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.label}
          role="tabpanel"
          id={`${base}-panel-${i}`}
          aria-labelledby={`${base}-tab-${i}`}
          hidden={i !== active}
          className="learn-tabpanel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Check your understanding. One question, one right answer, and an
// explanation for every choice, so a wrong pick teaches as much as a right one.
// ---------------------------------------------------------------------------

export type QuizOption = { text: ReactNode; correct?: boolean; why: ReactNode };

export function Quiz({ question, options }: { question: ReactNode; options: QuizOption[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const choice = picked === null ? undefined : options[picked];

  return (
    <div className="learn-quiz">
      <p className="learn-quiz-label">Check your understanding</p>
      <p className="learn-quiz-q">{question}</p>
      <ul>
        {options.map((option, i) => {
          const state = picked !== i ? "" : option.correct ? "is-right" : "is-wrong";
          return (
            <li key={i}>
              <button type="button" className={state} onClick={() => setPicked(i)} aria-pressed={picked === i}>
                <span className="learn-quiz-letter" aria-hidden="true">
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{option.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {choice ? (
        <div className={choice.correct ? "learn-quiz-why is-right" : "learn-quiz-why is-wrong"} aria-live="polite">
          <b>{choice.correct ? "Right." : "Not quite."}</b> {choice.why}
          {choice.correct ? null : <span className="learn-quiz-retry"> Try another answer.</span>}
        </div>
      ) : null}
    </div>
  );
}
