import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import {
  STARS_FETCHED_AT,
  formatSnapshotDate,
  formatStars,
  starsFor,
} from "@/lib/github-stars";
import {
  KIND_COPY,
  type CatalogEntry,
  basePathOf,
  hrefOf,
  installCommand,
  phasesOf,
  publisherOf,
  relatedTo,
  repoUrl,
  slugOf,
  summaryBullets,
} from "@/lib/skills-catalog";

// One layout for both kinds. A skill page and an agent page answer the same
// questions in the same order — what is it, how do I install it, where does it
// sit, what else is like it — and two copies of that would drift within a
// month.
export function CatalogDetail({ entry }: { entry: CatalogEntry }) {
  const p = publisherOf(entry);
  const kind = KIND_COPY[entry.kind];
  const phases = phasesOf(entry);
  const related = relatedTo(entry);
  const cmd = installCommand(p);
  const primary = phases[0];
  const base = basePathOf(entry.kind);
  const starCount = starsFor(p);

  return (
    <div className="sk-detail">
      <div className="sk-detail-main">
        <section className="sk-block">
          <h2 className="sk-block-h">Installation</h2>
          <div className="sk-cmd">
            <code>
              <span className="sk-cmd-p">$</span> {cmd}
            </code>
            <CopyButton
              ariaLabel={`Copy install command for ${p.owner}/${p.repo}`}
              icon
              label="Copy"
              text={cmd}
            />
          </div>
          <p className="sk-cmd-note">
            The CLI&apos;s unit is the repository, so this installs everything in{" "}
            <code>
              {p.owner}/{p.repo}
            </code>
            , not <code>{entry.name}</code> alone. It writes into whichever agent
            directories it finds — Claude Code, Codex, Cursor, Copilot, Windsurf, Zed.
          </p>
        </section>

        <section className="sk-block">
          <h2 className="sk-block-h">Summary</h2>
          <div className="sk-summary">
            <p>{entry.summary}</p>
            <ul>
              {summaryBullets(entry).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="sk-block">
          <h2 className="sk-block-h">Where it sits in delivery</h2>
          <div className="sk-phase-list">
            {phases.map((ph) => (
              <div className="sk-phase-row" key={ph.id}>
                <b>{ph.label}</b>
                <span>{ph.blurb}</span>
                <Link className="sk-phase-more" href={`${base}?phase=${ph.id}`}>
                  Everything in {ph.short} →
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* No mirrored SKILL.md. The registry renders the real file, it changes
            when the publisher changes it, and a stale copy of somebody else's
            procedure is the one thing a catalogue must never ship. */}
        <section className="sk-block">
          <h2 className="sk-block-h">The {kind.label.toLowerCase()} itself</h2>
          <p className="sk-cmd-note">
            The full text lives with its publisher and changes when they change it. Read
            it there rather than here — a mirrored copy of somebody else&apos;s procedure
            goes stale silently, and this page would have no way of telling you.
          </p>
          <div className="sk-links">
            <a
              className="sk-out"
              href={repoUrl(p)}
              rel="noopener noreferrer"
              target="_blank"
            >
              <b>
                github.com/{p.owner}/{p.repo}
              </b>
              <span>SKILL.md, source, licence, issues and history ↗</span>
            </a>
          </div>
        </section>

        {related.length > 0 && (
          <section className="sk-block">
            <h2 className="sk-block-h">Related</h2>
            {primary && (
              <p className="sk-more-in">
                More in <Link href={`${base}?phase=${primary.id}`}>{primary.label}</Link>
              </p>
            )}
            <ul className="sk-rel">
              {related.map((e) => {
                const rp = publisherOf(e);
                return (
                  <li key={slugOf(e)}>
                    <Link href={hrefOf(e)}>
                      <span className="sk-rel-l">
                        <b>{e.title}</b>
                        <span>{e.summary}</span>
                      </span>
                      <span className="sk-rel-r">
                        {e.kind !== entry.kind && (
                          <span className={`sk-kind ${e.kind}`}>
                            {KIND_COPY[e.kind].label}
                          </span>
                        )}
                        <code>
                          {rp.owner}/{rp.repo}
                        </code>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* The facts panel. The star count is the one number here that moves, so
          it carries the date it was taken; everything else is structural and
          does not drift. Install counts and audit verdicts are deliberately
          absent — we have no snapshot of those we could date honestly. */}
      <aside className="sk-rail-side">
        <div className="sk-fact">
          <h3>Type</h3>
          <span className={`sk-kind ${entry.kind}`}>{kind.label}</span>
          <p>{kind.blurb}</p>
        </div>
        <div className="sk-fact">
          <h3>
            Repository
            {p.official && (
              <span className="sk-verified" title="Published by the vendor itself">
                <VerifiedGlyph />
              </span>
            )}
          </h3>
          <a href={repoUrl(p)} rel="noopener noreferrer" target="_blank">
            {p.owner}/{p.repo}
          </a>
          <p>{p.note}</p>
        </div>
        {starCount !== undefined && (
          <div className="sk-fact">
            <h3>GitHub stars</h3>
            <div className="sk-stars">
              <StarGlyph />
              <b>{formatStars(starCount)}</b>
            </div>
            <p>
              On {p.owner}/{p.repo}, counted {formatSnapshotDate(STARS_FETCHED_AT)}. It
              will have moved since.
            </p>
          </div>
        )}
        <div className="sk-fact">
          <h3>Publisher</h3>
          <div className="sk-fact-row">
            <span>{p.name}</span>
            {p.official && <span className="sk-official">Official</span>}
          </div>
          <p>
            {p.official
              ? "Ships the thing this is about."
              : "Independent — respected, but not the vendor."}
          </p>
        </div>
        <div className="sk-fact">
          <h3>Phases</h3>
          <div className="sk-fact-row wrap">
            {phases.map((ph) => (
              <Link className="sk-tag phase" href={`${base}?phase=${ph.id}`} key={ph.id}>
                {ph.short}
              </Link>
            ))}
          </div>
        </div>
        <div className="sk-fact">
          <h3>Stack</h3>
          <div className="sk-fact-row wrap">
            {entry.stacks.map((s) => (
              <span className="sk-tag" key={s}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

/* aria-hidden: both glyphs sit beside text that already says the same thing. */

function VerifiedGlyph() {
  return (
    <svg aria-hidden="true" height="13" viewBox="0 0 24 24" width="13">
      <path
        d="M12 2 14.5 4.2 17.8 4 18.6 7.2 21.4 9 20 12l1.4 3-2.8 1.8-.8 3.2-3.3-.2L12 22l-2.5-2.2-3.3.2-.8-3.2L2.6 15 4 12 2.6 9l2.8-1.8L6.2 4l3.3.2z"
        fill="currentColor"
      />
      <path
        d="m8.5 12.2 2.4 2.4 4.6-4.8"
        fill="none"
        stroke="var(--bg)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function StarGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9z" />
    </svg>
  );
}
