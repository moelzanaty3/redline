import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { HeroLine } from "@/components/hero-line";
import { Journey } from "@/components/journey";
import { Reveal } from "@/components/reveal";
import { SEED_FILE, SEED_RULE_ID, seedDiff, seedMarkerExcerpt } from "@/components/seed-excerpt";
import { LowEvidence } from "@/components/low-evidence";
import { ReviewGap } from "@/components/review-gap";
import { WhatItIs } from "@/components/what-it-is";
import { SeverityFloor } from "@/components/value-viz";
import { loadManifest } from "@/lib/manifest";
import { installCommand, packageState } from "@/lib/package-version";
import { findRule, getRules } from "@/lib/rules";
import { seededFindingCount } from "@/lib/seeds";
import { GITHUB_REPO, GITHUB_URL, LICENSE_NAME, NPM_PACKAGE, NPM_URL } from "@/lib/site";
import "./home-skills.css";

// Declared, not inherited from Next's default. The loaders behind this page —
// Journey's profile resolution, the seed reader, the rule lookup below — throw
// when the repository they read no longer says what the page claims, and those
// throws are a build gate only while this page is prerendered. Anything that
// made it dynamic would move them to request time and disarm them silently.
export const dynamic = "force-static";

// The standards page the demonstrated rule is documented on. `javascript` is a
// slug in lib/registry.ts; the rule lookup below is what fails the build if the
// rule itself is ever renamed or removed.
const RULE_HREF = "/docs/standards/javascript";

// Where "And more" under the hero's finding goes: the adaptor pages, which list
// every assistant the standard is rendered for.
const ADAPTORS_HREF = "/docs/adaptors";

// A second rule, for the one panel whose claim is that ids are many and each is
// countable on its own. Illustrating that with the same id the hero and the
// finding already carry made the page look like it owns one example.
const COUNT_RULE_ID = "core/hardcoded-secrets";

export default async function Home() {
  const rules = getRules();
  const manifest = loadManifest();
  const ruleCount = rules.length;
  const stackCount = Object.keys(manifest.stacks).length;
  const checkedCount = manifest.deterministic?.length ?? 0;
  const seedCount = seededFindingCount();

  // The evidence strip names two stacks as examples; it must not outlive them.
  for (const stack of ["react", "terraform"]) {
    if (manifest.stacks[stack] === undefined) {
      throw new Error(`standards/manifest.json no longer has stack "${stack}"; the home page names it`);
    }
  }

  // The finding in section 4 is a real rule at its real severity. A page that
  // typeset `Redline/BLOCKER [javascript/shell-injection]` after that id had
  // been renamed would be printing a contract it no longer honours.
  const demoRule = findRule(SEED_RULE_ID);
  if (demoRule === undefined) {
    throw new Error(
      `standards/ no longer defines "${SEED_RULE_ID}"; the home page renders a finding citing it`,
    );
  }

  const countRule = findRule(COUNT_RULE_ID);
  if (countRule === undefined) {
    throw new Error(
      `standards/ no longer defines "${COUNT_RULE_ID}"; the home page renders a finding citing it`,
    );
  }

  // One invocation, everywhere on the page. `npx` needs no prior install, so
  // there is nothing to say twice — and when the package is not installable the
  // command degrades to the one that does work rather than to a lie.
  //
  // This used to drop the version deliberately, to keep the hero short. A bare
  // `npx redlinegate` is the one form that can serve a stale cached CLI, so the
  // shortest line on the site was the one most likely to run last month's
  // binary. installCommand's `@latest` is the whole fix.
  const state = await packageState();
  const initCmd = installCommand(state);

  const diff = seedDiff();
  const seedExcerpt = seedMarkerExcerpt();

  return (
    <main id="content" tabIndex={-1}>
      {/* ============ 1 — hero ============ */}
      <section className="hero">
        <div className="hero-lines" aria-hidden="true" />
        <div className="container hero-grid">
          <div className="hero-copy">
            {/* One sentence per line at every width wide enough to hold it: the
                setup, then the claim. */}
            <h1 className="hm-hero-in" style={{ animationDelay: "40ms" }}>
              <span className="hero-h1-a">AI writes the code.</span>
              <span className="hero-h1-b">
                <span className="hero-mark">Redline</span> holds the line.
              </span>
            </h1>
            {/* The definition, cut to the three moments. Its last clause — that
                Redline counts which rules catch bugs — is the "countable"
                claim further down the page, not lost. */}
            <p className="sub hm-hero-in" style={{ animationDelay: "120ms" }}>
              <b>One written standard</b> your AI follows while it writes, your
              machine checks before you push, and the pull request gate checks
              before merge.
            </p>
            <div className="hero-actions hm-hero-in" style={{ animationDelay: "200ms" }}>
              {/* The reader who has never heard of Redline needs somewhere to
                  start that is not their own repository; the command is for
                  someone who already knows they want it. */}
              <Link className="hm-pill" href="/docs/learn">
                Learn Redline
              </Link>
              <div className="hm-hero-cmd">
                <code>
                  <span className="tk-prompt">$ </span>
                  {initCmd}
                </code>
                <CopyButton icon text={initCmd} label="Copy" ariaLabel={`Copy ${initCmd}`} />
              </div>
            </div>
            {/* Where the command comes from, and which release it resolves to
                today — read from the registry at build time. */}
            <p className="hero-pkg hm-hero-in" style={{ animationDelay: "260ms" }}>
              <a href={NPM_URL} rel="noopener noreferrer" target="_blank">
                <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
                  <path d="M0 0h16v16H0z" fill="#cb3837" />
                  <path d="M3 3h10v10h-2.5V5.5H8V13H3z" fill="#fff" />
                </svg>
                {state.status === "published" ? `${NPM_PACKAGE}@${state.version}` : NPM_PACKAGE}
                <span aria-hidden="true">↗</span>
              </a>
              <a href={GITHUB_URL} rel="noopener noreferrer" target="_blank" title={GITHUB_REPO}>
                {GITHUB_REPO}
                <span aria-hidden="true">↗</span>
              </a>
            </p>
          </div>

          <div className="hero-art hm-hero-in" style={{ animationDelay: "300ms" }}>
            <HeroLine
              diff={diff.slice(2)}
              file={SEED_FILE}
              ruleHref={RULE_HREF}
              ruleId={demoRule.id}
              severity={demoRule.severity}
              moreHref={ADAPTORS_HREF}
            />
          </div>
        </div>

        {/* The evidence, as one quiet strip along the bottom of the fold. Every
            figure is derived from standards/ at build time. */}
        <div className="container hero-strip-wrap hm-hero-in" style={{ animationDelay: "380ms" }}>
          {/* Plain words, for a reader who has never met the terms: an "id" is
              a rule's fixed name, a "model" is AI, a "stack" is a language or
              framework, a cloud tool or an architecture. */}
          <ul className="hero-strip">
            <li>
              <b>{ruleCount}</b> review rules, each with a name that never changes
            </li>
            <li>
              <b>{checkedCount}</b> checked automatically, no AI involved
            </li>
            <li>
              <b>{stackCount}</b> tech stacks covered, from React to Terraform
            </li>
            <li>
              <b>Free</b> open source ({LICENSE_NAME}), for GitHub &amp; Azure DevOps
            </li>
          </ul>
        </div>
      </section>

      {/* ============ 2 — the problem ============ */}
      <ReviewGap />

      {/* ============ 3 — what it is, and is not ============ */}
      <WhatItIs />

      {/* ============ 4 — proof ============ */}
      <Journey initCmd={initCmd} />

      {/* ============ 5 — the thinking behind the rules ============ */}
      <LowEvidence />

      {/* ============ 6 — what a finding means ============ */}
      {/* The hero already shows one finding on real code. This section is about
          the rule set behind it: what each severity obliges, and which rules a
          checker decides without a model. */}
      <section className="hm-sec hm-finding" id="finding">
        <div className="container">
          <Reveal>
            <div className="hm-sec-head">
              <h2 className="hm-h2">
                Every finding is <span className="rl-mark">graded</span>
              </h2>
              <p className="hm-lead">
                The finding at the top of this page names one rule at one
                severity. Here is the whole set behind it: what each severity
                obliges, and who decides a finding.
              </p>
            </div>
            <SeverityFloor />
            <ul className="hm-decide">
              <li>
                <b>{checkedCount}</b>
                <h3>Checked, with no model</h3>
                <p>
                  Decided in <code>redline review</code>, the pre-push hook and
                  the gate, where a false positive is a bug.
                </p>
              </li>
              <li>
                <b>{ruleCount - checkedCount}</b>
                <h3>Judged by your AI reviewer</h3>
                <p>
                  Copilot, Claude or a local model, against the same ids — so
                  every finding counts the same, whoever wrote it.
                </p>
              </li>
            </ul>
            <p className="hm-split">
              <Link href="/docs/deterministic">Which rules are checked, and why →</Link>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ 7 — why trust it ============ */}
      <section className="hm-sec hm-claims" id="different">
        <div className="container">
          <Reveal>
            <div className="hm-sec-head">
              <h2 className="hm-h2">
                Why you can <span className="rl-mark">trust</span> what it says
              </h2>
            </div>
            <div className="hm-claim">
              <div className="hm-claim-copy">
                <h3>Every finding is countable</h3>
                <p>
                  Every finding names a permanent rule id, so{" "}
                  <code>redline metrics</code> can count which rules were{" "}
                  <b>acted on</b> and which were dismissed. A rule that only
                  makes noise is cut on that evidence, not on argument.{" "}
                  <Link href="/docs/telemetry">What gets measured →</Link>
                </p>
              </div>
              <div className="hm-claim-art">
                <div className="hm-mini">
                  <span className="tk-red">Redline/{countRule.severity}</span>{" "}
                  <span className="tk-blue">[{countRule.id}]</span>
                  <span className="tk-dim">: …</span>
                  {"\n"}
                  <span className="tk-dim">
                    {"          ↳ one row, keyed on that id, in every count"}
                  </span>
                </div>
              </div>
            </div>

            <div className="hm-claim">
              <div className="hm-claim-copy">
                <h3>We publish what we&apos;re scored against</h3>
                <p>
                  {seedCount} defects are seeded into a public corpus, each marked
                  with the rule that must catch it. Anyone can run a reviewer
                  over it and check the number — results are on{" "}
                  <Link href="/scoreboard">the scoreboard</Link>.{" "}
                  <Link href="/docs/seeds">The corpus →</Link>
                </p>
              </div>
              <div className="hm-claim-art">
                <div className="hm-code-box">
                  <pre className="hm-seed">
                  {seedExcerpt.map((line, i) => (
                    <span
                      key={`${i}-${line}`}
                      className={/SEED \d+ \[/.test(line) ? "hm-seed-hit" : undefined}
                    >
                      {line === "" ? " " : line}
                      {"\n"}
                    </span>
                    ))}
                  </pre>
                </div>
              </div>
            </div>

            <div className="hm-claim">
              <div className="hm-claim-copy">
                <h3>It stops at the diff</h3>
                <p>
                  Redline acts on a change while it is still a diff. It does not
                  build, deploy or roll back anything, and <b>its data ends at
                  merge</b>. No servers, no SaaS, no per-seat fee beyond the AI licences you already pay for.{" "}
                  <Link href="/docs">Where the line is →</Link>
                </p>
              </div>
              <div className="hm-claim-art">
                <div className="hm-mini">
                  <span className="tk-white">{"commit → diff → merge → deploy"}</span>
                  {"\n"}
                  <span className="tk-red">{"       └───────────┘"}</span>
                  {"\n"}
                  <span className="tk-red">{"          redline"}</span>
                  {"\n"}
                  <span className="tk-dim">
                    {"build, deploy and rollback: not ours"}
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 7 — try it ============ */}
      <section className="hm-sec hm-try" id="try">
        <div className="container">
          <Reveal>
            <div className="hm-try-card">
              <h2 className="hm-h2">Try it on one repository</h2>
              <p className="hm-try-lead">
                <code>{initCmd}</code> asks what your repository is, shows you
                the plan, and offers a preview that changes nothing before the
                run that does. Choose <b>write, commit and open a pull request</b>
                and it opens a single pull request on{" "}
                <code>redline/onboard</code> — it never pushes to your default
                branch. The gate starts advisory: it comments, it doesn&apos;t
                block. Don&apos;t like it? Close the pull request. Nothing was
                changed. <Link href="/docs/removing">Backing it out →</Link>
              </p>
              <div className="hm-hero-cmd hm-try-cmd">
                <code>
                  <span className="tk-prompt">$ </span>
                  {initCmd}
                </code>
                <CopyButton icon text={initCmd} label="Copy" ariaLabel={`Copy ${initCmd}`} />
              </div>
              <ul className="hm-try-list">
                <li>
                  <b>No admin rights needed.</b> An engineer without them still
                  gets everything file-level. The capabilities the token cannot
                  reach come back <code>denied</code>, are recorded in{" "}
                  <code>.redline.json</code>, and <code>redline verify</code>{" "}
                  reports <b>partially onboarded</b> until an administrator
                  enables them — recorded, never silently skipped.{" "}
                  <Link href="/docs/onboarding">That path, step by step →</Link>
                </li>
                <li>
                  <b>Your code can stay on your machine.</b> Run the review
                  against a local model and no diff is sent anywhere.
                </li>
                <li>
                  <b>About ten minutes.</b> One command, one pull request, one
                  review by your own team.
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 8 — when not to use it ============ */}
      {/* Deliberately the quietest section on the page: no card fill, no accent
          rule, smaller heading. It follows "try it" because that is where a
          reader has just been told how cheap adoption is, and disqualifying
          them is worth more there than one more reason to say yes. */}
      <section className="hm-sec hm-not" id="not-for-you">
        <div className="container">
          <div className="hm-not-card">
            <h2 className="hm-not-h">When not to use Redline</h2>
            <p className="hm-not-lead">
              Cases where it will not pay for itself. Better found here than in
              month two.
            </p>
            <ul className="hm-not-list">
              <li>
                <b>One repository, and no AI writing code in it.</b> Redline
                renders the standard into the files AI tools read, and measures
                an estate. You would be using neither.
              </li>
              <li>
                <b>You are not on GitHub or Azure DevOps.</b>{" "}
                <code>redline init</code> reads your git remote and supports
                those two. GitLab and Bitbucket are refused.
              </li>
              <li>
                <b>A stack outside the {stackCount}.</b> You get the core rules,
                plus whatever you write into this repository&apos;s own{" "}
                <code>.redline/local.md</code> and then maintain.
              </li>
              <li>
                <b>You want a blocking gate on day one.</b> Redline installs
                advisory and makes blocking be earned on recorded evidence, which
                cannot be hurried.
              </li>
              <li>
                <b>You want governance past merge.</b> Build, deploy, incidents,
                cloud spend: Redline stops at the diff, on purpose.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ============ 9 — skills & agents ============ */}
      {/* Placed after the disqualifier on purpose: a reader who has just been
          told Redline is not for them still gets something they can use today,
          and it is the one section on the page that is not about our software. */}
      <section className="hm-sec hm-sk" id="skills">
        <div className="container">
          <Reveal>
            <div className="hm-sec-head">
              <h2 className="hm-h2">What to give the agent</h2>
              <p className="hm-lead">
                Redline reviews the diff. It has no opinion on how the diff gets
                written — but that is the next question everyone asks, and the
                answer is public. Skills and agents from{" "}
                <a href="https://www.skills.sh" rel="noopener noreferrer" target="_blank">
                  skills.sh
                </a>
                , sorted onto the eight stages of delivery. None of it is ours;
                each one installs from its publisher.
              </p>
            </div>
            <div className="hm-sk-grid">
              <Link className="hm-sk-card" href="/docs/skills">
                <h3>
                  Skills <span aria-hidden="true">→</span>
                </h3>
                <p>
                  Knowledge the model reads and applies to work already in
                  progress. Nearly free: it loads, it shifts the output, you
                  move on.
                </p>
                <code>npx skills add addyosmani/agent-skills</code>
              </Link>
              <Link className="hm-sk-card" href="/docs/agents">
                <h3>
                  Agents <span aria-hidden="true">→</span>
                </h3>
                <p>
                  The ones that take the wheel — spawn subagents, drive a
                  browser, write artifacts. Costs tokens and wall-clock time, so
                  it needs a job worth handing over.
                </p>
                <code>npx skills add obra/superpowers</code>
              </Link>
            </div>
            <p className="hm-sk-note">
              Skills raise the floor on what gets written. The gate catches what
              still gets through. Neither replaces the other.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ 10 — final cta ============ */}
      {/* The page closes on the same line it opened on. */}
      <section className="final-cta">
        <span className="final-cta-line" aria-hidden="true" />
        <div className="container">
          <Reveal>
            <h2>
              Ship at AI speed.
              <br />
              The line still <span className="rl-mark">holds</span>.
            </h2>
          </Reveal>
          <div className="final-cta-actions">
            <div className="hm-hero-cmd">
              <code>
                <span className="tk-prompt">$ </span>
                {initCmd}
              </code>
              <CopyButton icon text={initCmd} label="Copy" ariaLabel={`Copy ${initCmd}`} />
            </div>
            <p className="hm-cta-links">
              <Link href="/docs/learn">Learn Redline</Link>
              <Link href="/docs">Documentation</Link>
              <Link href="/docs/standards">The {ruleCount} rules</Link>
              <a href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
                Source on GitHub
              </a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
