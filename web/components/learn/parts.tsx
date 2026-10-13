import type { ReactNode } from "react";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { LearnStepper, PackageManagerTabs, StepDone } from "@/components/learn/interactive";
import { DEMO_URL, REDLINE_RUNNERS, learnHref, learnStep } from "@/lib/learn";
import "@/app/docs/learn/learn.css";

// Commands are copied as one block; output is shown dimmed under them and is
// never part of what the Copy button puts on the clipboard.
// The lines of a heredoc (`cat > file <<'EOF'` … `EOF`) are input to the
// command above them, not commands: they get no prompt, and a markdown heading
// among them is not a shell comment.
function heredocLines(lines: string[]) {
  let delimiter: string | null = null;
  return lines.map((line) => {
    if (delimiter !== null) {
      if (line === delimiter) delimiter = null;
      return true;
    }
    delimiter = /<<-?\s*'?(\w+)'?\s*$/.exec(line)?.[1] ?? null;
    return false;
  });
}

export function Terminal({ commands, output }: { commands: string; output?: string }) {
  const lines = commands.split("\n");
  const inHeredoc = heredocLines(lines);
  return (
    <CodeWindow title="terminal" copyText={commands}>
      {lines.map((line, i) => (
        <span key={i}>
          {inHeredoc[i] ? (
            <span className="tk-white">{line}</span>
          ) : line.startsWith("#") ? (
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

/**
 * A terminal whose Redline commands follow the package manager the reader
 * picked. `{redline}` in `commands` becomes that manager's way of running the
 * project's own copy; every other line is shown as written.
 */
export function RedlineTerminal({ commands, output }: { commands: string; output?: string }) {
  return (
    <PackageManagerTabs
      panels={(["pnpm", "npm", "yarn", "bun"] as const).map((name) => ({
        name,
        content: (
          <Terminal
            commands={commands.replaceAll("{redline}", REDLINE_RUNNERS[name])}
            output={output}
          />
        ),
      }))}
    />
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

/**
 * What changes on a private repository. The path assumes a public one, where
 * GitHub's security features are free; a private one without Advanced Security
 * meets a different result at a few steps, and this is where each step says so.
 * Folded, like a term: a reader on a public repository walks past it.
 */
export function PrivateRepo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="learn-term learn-private">
      <summary>
        <span className="learn-term-tag">Private repository</span> {title}
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
          <a href={`${DEMO_URL}/tree/${step.tag}`} rel="noopener noreferrer" target="_blank">
            Files after this step ↗
          </a>
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
