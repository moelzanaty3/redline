import type { Metadata } from "next";
import Link from "next/link";
import { CorpusMarkers, RecallTrend } from "@/components/scoreboard-parts";
import { latestRelease } from "@/lib/release";
import { standardsVersion } from "@/lib/package-version";
import {
  DEFAULT_SCORE_HISTORY_PATH,
  percent,
  scoreboard,
  scoredOn,
  type ReviewerScore,
  type ScoreRun,
} from "@/lib/scores";
import { seedCorpora, seededFindingCount } from "@/lib/seeds";
import { GITHUB_URL } from "@/lib/site";

// The stylesheet is imported here rather than in the root layout: it is scoped
// to this route and nothing else on the site uses it.
import "../scoreboard.css";

export const metadata: Metadata = {
  title: "Scoreboard",
  description:
    "The public benchmark behind Redline: a corpus of deliberately seeded defects with known answers, a clean corpus that must attract zero comments, and the recall, attribution and false-positive numbers any AI reviewer scores against them.",
};

// The loaders behind this page read the repository at build time and throw when
// it no longer says what the page claims. That throw is a build gate only while
// the page is prerendered.
export const dynamic = "force-static";

// Where the pipeline that produces a number is documented, so the page states
// the shape and links to the detail rather than restating the whole workflow.
const CANARY_HREF = "/docs/workflows/seed-canary";
const SEEDS_HREF = "/docs/seeds";
const SCORER_HREF = "/docs/scripts/score-seeds";

export default function ScoreboardPage() {
  const data = scoreboard();
  const corpora = seedCorpora();

  const seeded = seededFindingCount();
  const stacks = [...corpora.values()].filter((c) => c.slug !== "clean");
  const blockers = stacks.reduce(
    (n, c) => n + c.defects.filter((d) => d.severity === "BLOCKER").length,
    0,
  );
  // The precision half of the corpus. Missing means the page's claim — that a
  // reviewer is scored on staying quiet as well as on finding things — is no
  // longer true, so it fails the build rather than rendering a zero.
  const clean = corpora.get("clean");
  if (clean === undefined || clean.files.length === 0) {
    throw new Error("seeded/clean/ is empty or missing; /scoreboard states its file count");
  }
  const cleanFiles = clean.files.length;

  const version = standardsVersion();
  const release = latestRelease();

  return (
    <main className="sb">
      <header className="sb-head">
        <div className="sb-wrap">
          <p className="sb-eyebrow">Public benchmark</p>
          <h1>Scoreboard</h1>
          <p className="sb-lede">
            Redline&rsquo;s claim is that it is the standard AI reviewers are measured
            against, not another reviewer. That claim is only worth anything if the
            measurement is in the open. {seeded} deliberate defects with known answers,{" "}
            {cleanFiles} files of correct code that must attract no comment at all, and one
            script that turns a reviewer&rsquo;s output into four numbers. This page is
            where those numbers go.
          </p>
          <dl className="sb-facts">
            <div>
              <dt>Seeded defects</dt>
              <dd>{seeded}</dd>
            </div>
            <div>
              <dt>Of them BLOCKER</dt>
              <dd>{blockers}</dd>
            </div>
            <div>
              <dt>Stacks covered</dt>
              <dd>{stacks.length}</dd>
            </div>
            <div>
              <dt>Standards version</dt>
              <dd>v{version}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="sb-wrap">
        {data.status === "scored" ? (
          <Scored data={data} />
        ) : (
          <NeverRun reason={data.reason} checked={data.checked} skipped={data.skipped} />
        )}

        {/* ---- what is being measured, in both states ---- */}
        <section className="sb-sec" id="metrics">
          <h2>The four numbers</h2>
          <p className="sb-sec-lede">
            A review system fails in more than one direction, and only one of those
            directions is loud. These are counted by{" "}
            <Link href={SCORER_HREF}>scripts/score-seeds.mjs</Link> from the reviewer&rsquo;s
            own comments; a comment is matched to at most one marker, within four lines of
            it, and only when it carries the marked severity or higher.
          </p>
          <div className="sb-defs">
            <Definition
              term="BLOCKER recall"
              pass="Pass condition: 100%"
              body={`Of the ${blockers} markers labelled [BLOCKER], the share the reviewer flagged at BLOCKER or higher. This is the number that matters: a reviewer below 100% here is missing defects the standard says must not merge, and the canary fails the run.`}
            />
            <Definition
              term="Overall recall"
              pass={`Out of ${seeded}`}
              body="The same count across every marker at every severity. Lower than BLOCKER recall is expected and tolerable — a missed SUGGESTION is a missed opinion, a missed BLOCKER is a shipped vulnerability."
            />
            <Definition
              term="Rule attribution"
              pass="Of the defects it caught"
              body="The share of caught defects whose comment cited the exact rule id the marker names. A reviewer that finds the bug and cites the wrong rule is counted as having caught it, and separately as having misattributed it — the two are different problems with different fixes."
            />
            <Definition
              term="False positives on clean"
              pass="Pass condition: zero"
              body={`Comments posted on seeded/clean/** — ${cleanFiles} files with nothing wrong with them. Recall alone is trivially gamed: a reviewer that flags every line scores 100% and is useless. This is the half that stops that.`}
            />
          </div>
        </section>

        {/* ---- the corpus itself ---- */}
        <section className="sb-sec" id="corpus">
          <h2>What it is scored against</h2>
          <p className="sb-sec-lede">
            Every defect carries a machine-readable marker on or just above its line, naming
            the severity it must be flagged at and the rule id that must be cited. The
            scorer parses those markers straight out of the files, so there is no separate
            expectations file to drift out of sync — and nothing about the answers is
            private.
          </p>
          <CorpusMarkers />
          <p className="sb-note">
            {seeded} markers across {stacks.length} stacks —{" "}
            {stacks.map((c) => c.slug).join(", ")} — plus{" "}
            <code>seeded/clean/</code>, whose pass condition is silence. The corpus is
            published in full: <Link href={SEEDS_HREF}>browse every seeded file</Link>, or
            read them{" "}
            <a href={`${GITHUB_URL}/tree/main/seeded`} rel="noreferrer" target="_blank">
              in the repository
            </a>
            . None of it is ever merged anywhere — it contains live-looking credentials and
            deliberately broken code.
          </p>
        </section>

        <p className="sb-foot">
          Corpus and metric definitions read from the repository at build time, against
          standards v{version}.{" "}
          {release.status === "released"
            ? `Latest release ${release.version}, ${release.date}.`
            : release.status === "unreleased"
              ? "No version has been released yet — the changelog carries no released version heading."
              : `Release state could not be determined: ${release.reason}`}
        </p>
      </div>
    </main>
  );
}

function Definition({ term, pass, body }: { term: string; pass: string; body: string }) {
  return (
    <div className="sb-def">
      <h3>
        {term} <span>{pass}</span>
      </h3>
      <p>{body}</p>
    </div>
  );
}

// --- state A: nothing has been scored yet -----------------------------------
//
// The honest version of this page, and the one that ships today. It shows no
// table, no dashes and no zeroes: an unmeasured metric is absent with its
// reason. What it owes the reader instead is the whole method — what would have
// to exist, what runs, and what it writes — so that "no number yet" is a
// checkable statement about a real pipeline rather than a coming-soon sign.

function NeverRun({
  reason,
  checked,
  skipped,
}: {
  reason: string;
  checked: string[];
  skipped: { line: number; reason: string }[];
}) {
  return (
    <section className="sb-sec" id="status">
      <div className="sb-status">
        <p className="sb-status-h">No run has been published yet</p>
        <p>{reason}</p>
        <p className="sb-status-why">
          This is not a page waiting on a design. The measurement needs a live reviewer
          commenting on a live pull request, and until one has been scored there is no
          honest number to print. Redline reports <code>??</code> for a check that could not
          run and never <code>ok</code>; a scoreboard of zeroes would be the same lie with
          better typography.
        </p>
        <p className="sb-status-paths">
          History file looked for at{" "}
          {checked.map((path, i) => (
            <span key={path}>
              {i > 0 ? ", " : ""}
              <code>{path}</code>
            </span>
          ))}
          .
        </p>
        {skipped.length > 0 && (
          <p className="sb-status-paths">
            {skipped.length} line{skipped.length === 1 ? "" : "s"} present but unusable:{" "}
            {skipped.map((s) => `line ${s.line} — ${s.reason}`).join("; ")}.
          </p>
        )}
      </div>

      <h2 className="sb-h2-tight">How a number gets here</h2>
      <p className="sb-sec-lede">
        The scorer reads a review that has already happened. It takes a repository and a
        pull request number, fetches the comments an automated reviewer posted there, and
        grades them against the markers in the corpus. There is no local mode and nothing to
        run against the files on disk — a benchmark whose subject is a reviewer needs a
        reviewer to have reviewed something.
      </p>

      <ol className="sb-steps">
        <li>
          <b>A canary repository, with an automated reviewer actually enabled on it.</b> That
          reviewer — Copilot code review, Claude, Codex or another — is the thing being
          measured. A repository that has quietly lost its review entitlement looks exactly
          like a repository with nothing to find, which is the confusion this whole exercise
          exists to remove.
        </li>
        <li>
          <b>
            The <code>redline-metrics</code> repository, carrying{" "}
            <Link href={CANARY_HREF}>seed-canary.yml</Link>.
          </b>{" "}
          The workflow does not live in this repository, and neither does the history it
          writes. It needs <code>vars.CANARY_TARGETS</code> (a JSON array of{" "}
          <code>{`{repo, stack}`}</code>), <code>secrets.REDLINE_CANARY_TOKEN</code> scoped
          to the canary repos only — it opens and closes pull requests — and{" "}
          <code>secrets.REDLINE_ORG_READ_TOKEN</code> to check out the corpus from here.
        </li>
        <li>
          <b>The cycle, weekly on a Monday or on demand.</b> It opens a branch on each target
          carrying <code>seeded/&lt;stack&gt;</code> and <code>seeded/clean</code>, labelled{" "}
          <code>redline-exempt</code> so the readiness gate does not block a pull request
          nobody will merge; waits for review comments to stop arriving (two stable polls, up
          to forty minutes); scores what was posted; then closes and deletes the pull request
          and branch, including when the run fails.
        </li>
        <li>
          <b>The record.</b> Each score is appended as one JSON line to a history file, and
          the run fails if any target&rsquo;s BLOCKER recall is below 1.0 or the clean corpus
          attracted a false positive. That file is what this page reads.
        </li>
      </ol>

      <figure className="sb-code">
        <pre>
          <code>
            <span className="sb-code-l sb-dim">
              # inside the canary run — scores a pull request the reviewer has already
              commented on
            </span>
            <span className="sb-code-l">GH_TOKEN=… npx redlinegate metrics score-seeds \</span>
            <span className="sb-code-l"> --repo &lt;org&gt;/&lt;canary-repo&gt; --pr &lt;n&gt; \</span>
            <span className="sb-code-l">
              {` --history ${DEFAULT_SCORE_HISTORY_PATH} --baseline`}
            </span>
          </code>
        </pre>
        <figcaption>
          <code>--history</code> appends the report; <code>--baseline</code> compares it to
          the previous run for the same repository and fails on a drop. The path is the
          caller&rsquo;s choice, which is why this page looks for the conventional one and
          honours <code>REDLINE_SEED_SCORES</code> at build time rather than assuming a
          single location.
        </figcaption>
      </figure>

      <p className="sb-note">
        Everything above is in the open: the{" "}
        <Link href={SCORER_HREF}>scorer</Link>, the{" "}
        <Link href={CANARY_HREF}>workflow that drives it</Link>, and the{" "}
        <Link href={SEEDS_HREF}>corpus with its answers</Link>. Run it against your own
        reviewer on your own repository and you will get a number computed exactly the way
        the one published here will be.
      </p>
    </section>
  );
}

// --- state B: at least one run exists ---------------------------------------

function Scored({ data }: { data: Extract<ReturnType<typeof scoreboard>, { status: "scored" }> }) {
  const latest = data.runs[data.runs.length - 1];

  return (
    <section className="sb-sec" id="results">
      <h2>Results</h2>
      <p className="sb-sec-lede">
        {data.runs.length} scored run{data.runs.length === 1 ? "" : "s"}, read from{" "}
        <code>{data.path}</code>. Sorted by BLOCKER recall, highest first
        {latest ? `; most recent run ${scoredOn(latest.scoredAt)}` : ""}. Each row is one
        reviewer&rsquo;s most recent run against the corpus.
      </p>

      <div className="sb-table-wrap">
        <table className="sb-table">
          <thead>
            <tr>
              <th scope="col">Reviewer</th>
              <th scope="col">BLOCKER recall</th>
              <th scope="col">Overall recall</th>
              <th scope="col">Rule attribution</th>
              <th scope="col">False positives</th>
              <th scope="col">Scored</th>
            </tr>
          </thead>
          <tbody>
            {data.scored.map((entry) => (
              <Row entry={entry} key={entry.reviewer.key} />
            ))}
            {data.unscored.map((reviewer) => (
              <tr className="sb-row-none" key={reviewer.key}>
                <th scope="row">{reviewer.label}</th>
                <td colSpan={5}>
                  Not yet scored — the history carries no run this reviewer commented on.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.scored.some((e) => e.history.length > 1) && (
        <div className="sb-trends">
          <h3>BLOCKER recall over time</h3>
          {data.scored
            .filter((e) => e.history.length > 1)
            .map((entry) => (
              <div className="sb-trend-row" key={entry.reviewer.key}>
                <span className="sb-trend-label">
                  {entry.reviewer.label}
                  <em>
                    {entry.history.length} runs, {scoredOn(entry.history[0]?.scoredAt ?? "")} to{" "}
                    {scoredOn(entry.latest.scoredAt)}
                  </em>
                </span>
                <span className="sb-trend-plot">
                  <RecallTrend label={entry.reviewer.label} runs={entry.history} />
                  <span aria-hidden="true" className="sb-trend-axis">
                    <b>100%</b>
                    <b>0%</b>
                  </span>
                </span>
              </div>
            ))}
        </div>
      )}

      {data.unattributed.length > 0 && (
        <p className="sb-note">
          {data.unattributed.length} run{data.unattributed.length === 1 ? "" : "s"} could not
          be attributed to a reviewer, because no comment from a known review bot was found
          on the pull request:{" "}
          {data.unattributed
            .map((run) => `${run.repo}${run.pr === null ? "" : `#${run.pr}`} (${scoredOn(run.scoredAt)})`)
            .join(", ")}
          . A run with no comments at all is a result, not a gap, so it is reported rather
          than dropped.
        </p>
      )}

      {data.skipped.length > 0 && (
        <p className="sb-note">
          {data.skipped.length} line{data.skipped.length === 1 ? "" : "s"} of{" "}
          <code>{data.path}</code>{" "}
          {data.skipped.length === 1 ? "could not be parsed and is" : "could not be parsed and are"}{" "}
          excluded from every number above:{" "}
          {data.skipped.map((s) => `line ${s.line} — ${s.reason}`).join("; ")}.
        </p>
      )}
    </section>
  );
}

function Row({ entry }: { entry: ReviewerScore }) {
  const run = entry.latest;
  const t = run.totals;
  return (
    <>
      <tr>
        <th scope="row">
          {entry.reviewer.label}
          <em>
            {run.repo}
            {run.pr === null ? "" : `#${run.pr}`}
          </em>
        </th>
        <td className={t.blockerRecall >= 1 ? "sb-num sb-pass" : "sb-num sb-fail"}>
          {percent(t.blockerRecall)}
          <em>
            {t.blockerCaught}/{t.blockerSeeded}
          </em>
        </td>
        <td className="sb-num">
          {percent(t.recall)}
          <em>
            {t.caught}/{t.seeded}
          </em>
        </td>
        <td className="sb-num">
          {percent(t.ruleAttribution)}
          <em>of {t.caught} caught</em>
        </td>
        <td className={t.falsePositivesOnClean === 0 ? "sb-num sb-pass" : "sb-num sb-fail"}>
          {t.falsePositivesOnClean}
          <em>on clean</em>
        </td>
        <td className="sb-when">
          {scoredOn(run.scoredAt)}
          <em>
            {run.standardsVersion === null
              ? "standards version not recorded"
              : `standards v${run.standardsVersion}`}
          </em>
        </td>
      </tr>
      <RunDetail run={run} />
    </>
  );
}

function RunDetail({ run }: { run: ScoreRun }) {
  const t = run.totals;
  return (
    <tr className="sb-detail">
      <td colSpan={6}>
        {t.commentsPosted} comment{t.commentsPosted === 1 ? "" : "s"} posted,{" "}
        {t.findingsWithRuleId} carrying a rule id, {t.untaggedFindings} missing the{" "}
        <code>Redline/&lt;SEVERITY&gt;</code> prefix, {t.invalidRuleIds} citing a rule id
        that is not in the catalogue. {t.unmatchedFindings} landed on a seeded file but not
        near a marker; {run.missedCount} marker{run.missedCount === 1 ? "" : "s"} went
        unflagged.
        {run.falsePositives.length > 0 && (
          <>
            {" "}
            On the clean corpus:{" "}
            {run.falsePositives
              .map((fp) => `${fp.path}:${fp.line} [${fp.severity}]`)
              .join(", ")}
            .
          </>
        )}
      </td>
    </tr>
  );
}
