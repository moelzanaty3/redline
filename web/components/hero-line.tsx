import { HeroTicker } from "@/components/hero-ticker";
import type { DiffLine } from "@/components/seed-excerpt";

// The hero's one object: the seeded diff, small and quiet, with the row the
// finding is about marked in red.
// Under it, the finding Redline posts, cycling through the reviewers that can
// post it.
// Every string here is passed in from the seed file and the rule catalogue, so
// a renamed rule or a moved exec() fails the build rather than the picture.
export function HeroLine({
  diff,
  file,
  severity,
  ruleId,
  ruleHref,
  moreHref,
}: {
  diff: DiffLine[];
  file: string;
  severity: string;
  ruleId: string;
  ruleHref: string;
  moreHref: string;
}) {
  return (
    <figure className="hl">
      <div className="hl-stage">
      <div className="hl-card">
        <figcaption className="hl-file">
          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M4 1.5h5l3 3v10H4z M9 1.5v3h3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          {file.split("/").at(-1)}
        </figcaption>
        <pre className="hl-code">
          {diff.map((line, i) => (
            <span className={`hl-row hl-${line.kind}`} key={`${i}-${line.text}`}>
              <span className="hl-g" aria-hidden="true">
                {line.kind === "ctx" ? " " : "+"}
              </span>
              <span className="hl-t">{line.text === "" ? " " : line.text}</span>
            </span>
          ))}
        </pre>
      </div>
      </div>

      <HeroTicker severity={severity} ruleId={ruleId} ruleHref={ruleHref} moreHref={moreHref} />
    </figure>
  );
}

