import { Reveal } from "@/components/reveal";

// Every figure in this section is quoted from a published report, with the
// report linked beside it. None of them is ours, none is rounded further than
// the source rounds it, and none is combined with another into a number the
// source did not print. Re-read the source before changing any of them.

type Source = { label: string; href: string };

const FAROS: Source = {
  label: "Faros AI, The AI Productivity Paradox, July 2025",
  href: "https://www.faros.ai/blog/ai-software-engineering",
};

// Faros AI: telemetry from over 10,000 developers across 1,255 teams; the
// change on teams with high AI adoption.
const BARS: { label: string; pct: number; kind: "write" | "review" }[] = [
  { label: "Pull requests merged", pct: 98, kind: "write" },
  { label: "Average pull request size", pct: 154, kind: "write" },
  { label: "Pull request review time", pct: 91, kind: "review" },
  { label: "Bugs per developer", pct: 9, kind: "review" },
];
const SCALE = Math.max(...BARS.map((b) => b.pct));

const STATS: { figure: string; claim: string; source: Source }[] = [
  {
    figure: "43.2M",
    claim: "pull requests merged on GitHub every month, up 23% in a year.",
    source: {
      label: "GitHub Octoverse 2025",
      href: "https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/",
    },
  },
  {
    figure: "1.7×",
    claim: "as many issues in an AI-co-authored pull request as in a human-only one.",
    source: {
      label: "CodeRabbit, State of AI vs Human Code Generation, Dec 2025",
      href: "https://coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report",
    },
  },
  {
    figure: "90%",
    claim:
      "of engineers use AI at work — and AI adoption still has a negative relationship with delivery stability.",
    source: {
      label: "Google DORA, State of AI-assisted Software Development 2025",
      href: "https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report",
    },
  },
];

export function ReviewGap() {
  return (
    <section className="hm-sec hm-gap" id="problem">
      <div className="container">
        <Reveal>
          <div className="hm-sec-head">
            <span className="hm-eyebrow">The problem</span>
            <h2 className="hm-h2">
              AI multiplied how fast we write code.
              <br />
              It did not multiply how fast we can review it.
            </h2>
          </div>

          <figure className="hm-gap-chart">
            <figcaption className="hm-gap-cap">
              <b>On teams with high AI adoption</b> — telemetry from over 10,000
              developers across 1,255 teams
            </figcaption>
            <ul className="hm-gap-bars">
              {BARS.map((bar) => (
                <li className={`hm-gap-row hm-gap-${bar.kind}`} key={bar.label}>
                  <span className="hm-gap-label">{bar.label}</span>
                  <span className="hm-gap-track" aria-hidden="true">
                    <i style={{ width: `${(bar.pct / SCALE) * 100}%` }} />
                  </span>
                  <span className="hm-gap-pct">+{bar.pct}%</span>
                </li>
              ))}
            </ul>
            <p className="hm-gap-legend">
              <span className="hm-gap-key hm-gap-write">more code arriving</span>
              <span className="hm-gap-key hm-gap-review">what it costs</span>
              <a href={FAROS.href} rel="noopener noreferrer" target="_blank">
                {FAROS.label}
              </a>
            </p>
          </figure>

          <ul className="hm-gap-stats">
            {STATS.map((s) => (
              <li key={s.figure}>
                <b className="hm-gap-fig">{s.figure}</b>
                <p>{s.claim}</p>
                <a href={s.source.href} rel="noopener noreferrer" target="_blank">
                  {s.source.label}
                </a>
              </li>
            ))}
          </ul>

          <p className="hm-gap-close">
            The risk moved from writing code to reviewing it — and review had no
            system. <b>Redline is that system.</b>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
