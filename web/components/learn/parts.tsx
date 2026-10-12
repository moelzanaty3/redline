import type { ReactNode } from "react";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { LearnStepper, StepDone } from "@/components/learn/interactive";
import { DEMO_URL, learnHref, learnStep } from "@/lib/learn";
import "@/app/docs/learn/learn.css";

// Commands are copied as one block; output is shown dimmed under them and is
// never part of what the Copy button puts on the clipboard.
export function Terminal({ commands, output }: { commands: string; output?: string }) {
  return (
    <CodeWindow title="terminal" copyText={commands}>
      {commands.split("\n").map((line, i) => (
        <span key={i}>
          {line.startsWith("#") ? (
            <span className="tk-dim">{line}</span>
          ) : (
            <>
              <span className="tk-prompt">$</span> <span className="tk-white">{line}</span>
            </>
          )}
          {"\n"}
        </span>
      ))}
      {output ? <span className="tk-dim">{`\n${output}`}</span> : null}
    </CodeWindow>
  );
}

export function File({ name, text }: { name: string; text: string }) {
  return (
    <CodeWindow title={name} copyText={text}>
      <span className="tk-white">{text}</span>
    </CodeWindow>
  );
}

/**
 * A word the reader may not know yet, explained where it first matters.
 * A native <details>: it opens with no script, and a reader who knows the term
 * walks straight past it.
 */
export function Term({ word, children }: { word: string; children: ReactNode }) {
  return (
    <details className="learn-term">
      <summary>
        <span className="learn-term-tag">New term</span> {word}
      </summary>
      <div>{children}</div>
    </details>
  );
}

export function LearnPage({
  slug,
  intro,
  learn,
  children,
}: {
  slug: string;
  intro: string;
  learn: string[];
  children: ReactNode;
}) {
  const step = learnStep(slug);
  return (
    <DocsPage
      crumb={`Getting Started / Learn / ${step.n} · ${step.title}`}
      title={`${step.n} · ${step.title}`}
      intro={intro}
      href={learnHref(step)}
    >
      <LearnStepper current={slug} />
      <p className="learn-meta">
        <span>About {step.minutes} minutes</span>
        <span>{step.needsGitHub ? "Needs GitHub" : "Works on your machine"}</span>
        {step.tag ? (
          <span>
            Demo: <code>git checkout {step.tag}</code>
          </span>
        ) : null}
        {step.pr ? (
          <a href={`${DEMO_URL}/pull/${step.pr}`} rel="noopener noreferrer" target="_blank">
            Pull request #{step.pr} ↗
          </a>
        ) : null}
      </p>
      <div className="callout ok">
        <span className="ic">✓</span>
        <div>
          <p>
            <b>You will learn</b>
          </p>
          <ul>
            {learn.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      {children}
      <StepDone slug={slug} />
    </DocsPage>
  );
}
