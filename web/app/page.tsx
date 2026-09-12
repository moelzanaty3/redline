import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { FindingPanel } from "@/components/finding";
import { HeroFinding } from "@/components/hero-finding";
import { Journey } from "@/components/journey";
import { Choices } from "@/components/choices";
import { Reveal } from "@/components/reveal";
import { SEED_FILE, SEED_RULE_ID, seedDiff, seedMarkerExcerpt } from "@/components/seed-excerpt";
import { ValueCase } from "@/components/value-case";
import { SeverityFloor } from "@/components/value-viz";
import { loadManifest } from "@/lib/manifest";
import { PACKAGE_NAME, installCommand, packageState } from "@/lib/package-version";
import { findRule, getRules } from "@/lib/rules";
import { seededFindingCount } from "@/lib/seeds";
import { GITHUB_REPO, GITHUB_URL } from "@/lib/site";
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

// A second rule, for the one panel whose claim is that ids are many and each is
// countable on its own. Illustrating that with the same id the hero and the
// finding already carry made the page look like it owns one example.
const COUNT_RULE_ID = "core/hardcoded-secrets";

export default async function Home() {
  const rules = getRules();
  const manifest = loadManifest();
  const ruleCount = rules.length;
  const stackCount = Object.keys(manifest.stacks).length;
  const vendorCount = Object.values(manifest.vendors).filter((v) => v.enabled).length;
  const seedCount = seededFindingCount();

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
  const state = await packageState();
  const initCmd =
    state.status === "published" ? `npx ${PACKAGE_NAME} init` : installCommand(state);

  const diff = seedDiff();
  const seedExcerpt = seedMarkerExcerpt();

  return (
    <main id="content" tabIndex={-1}>
      {/* ============ 1 — hero ============ */}
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-lines" aria-hidden="true" />
        <div className="container hero-split">
          <div className="hero-copy">
            {/* Two block spans rather than a hard <br/>: each sentence owns its
                own line at every width, so the headline cannot fold into four
                ragged rows on a narrow screen, and the two halves can be sized
                apart — the first sets up, the second is the claim. */}
            <h1 className="hm-hero-in" style={{ animationDelay: "40ms" }}>
              <span className="hero-h1-a">AI writes the code.</span>
              <span className="hero-h1-b">
                <span className="hero-mark">Redline</span> holds the line.
              </span>
            </h1>
            {/* The outcome, not the mechanism. This used to end on "so you can
                measure which rules are worth keeping" — a second-order benefit
                for someone who already trusts their review process. The reason
                anyone installs this is the first-order one: more code is
                merging than anyone is really reading. Measurement is a real
                claim and keeps its own panel further down the page. */}
            <p className="sub hm-hero-in" style={{ animationDelay: "140ms" }}>
              Your team is merging more code than it is reading. Redline puts{" "}
              <b>one versioned rule set</b> in front of every diff — checked by
              the AI that wrote it, the reviewer, and the gate, all against the
              same list.
            </p>
            <div className="hm-hero-cmd hm-hero-in" style={{ animationDelay: "220ms" }}>
              <code>
                <span className="tk-prompt">$ </span>
                {initCmd}
              </code>
              <CopyButton text={initCmd} label="Copy" ariaLabel={`Copy ${initCmd}`} />
            </div>
            {/* "See a finding ↓" is gone: the finding is in the hero now, and a
                link down to it was the hero apologising for not having one. */}
            <p className="hm-hero-alt hm-hero-in" style={{ animationDelay: "290ms" }}>
              <a href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
                {GITHUB_REPO} on GitHub
              </a>
            </p>
            {/* One quiet row, not a table. Six bordered cells outweighed the
                install command they sat under, and the catalogue counts belong
                to the section that is about the catalogue. */}
            <ul className="hero-proof hm-hero-in" style={{ animationDelay: "350ms" }}>
              <li>{ruleCount} rules with permanent ids</li>
              <li>{stackCount} stacks</li>
              <li>GitHub &amp; Azure DevOps</li>
              <li>MIT</li>
            </ul>
          </div>

          <div className="hero-art hm-hero-in" style={{ animationDelay: "430ms" }}>
            <HeroFinding
              file={SEED_FILE}
              ruleHref={RULE_HREF}
              ruleId={demoRule.id}
              severity={demoRule.severity}
            />
          </div>
        </div>
      </section>

      {/* ============ 2 — proof ============ */}
      <Journey initCmd={initCmd} />

      {/* ============ 3 — the problem ============ */}
      <ValueCase />

      {/* ============ 3b — the choices behind that run ============ */}
      <Choices />

      {/* ============ 4 — a finding ============ */}
      <section className="hm-sec hm-finding" id="finding">
        <div className="container">
          <Reveal>
          <div className="hm-sec-head">
            <h2 className="hm-h2">This is what Redline produces</h2>
            <p className="hm-lead">
              A rule is only worth anything at the moment it catches something.
              Here is one, on real code from the corpus Redline publishes to be
              scored against.
            </p>
          </div>
          <FindingPanel
            diff={diff}
            file={SEED_FILE}
            ruleId={demoRule.id}
            ruleHref={RULE_HREF}
            severity={demoRule.severity}
          />
          <SeverityFloor />
          </Reveal>
        </div>
      </section>

      {/* ============ 5 — where it sits ============ */}
      <section className="hm-sec hm-flow" id="workflow">
        <div className="container">
          <Reveal>
            <div className="hm-sec-head">
              <h2 className="hm-h2">Where it sits in your day</h2>
              <p className="hm-lead">
                Three places, and you already stand in all three.
              </p>
            </div>
            <ol className="hm-steps">
              <li>
                <span className="hm-step-n">01</span>
                <h3>Write</h3>
                <p>
                  Your AI reads the same rules you do. <code>redline init</code>{" "}
                  renders the standard into the {vendorCount} formats your tools
                  already read, composed for the stacks this repository uses.
                </p>
              </li>
              <li>
                <span className="hm-step-n">02</span>
                <h3>Review</h3>
                <p>
                  <code>redline review</code> checks the change on your machine
                  against <b>only the rules that apply to the files you touched</b>{" "}
                  — before you push. The same standard runs as the gate on the
                  pull request.
                </p>
                <div className="hm-step-cmd">
                  <span className="tk-prompt">$ </span>redline review --staged
                </div>
              </li>
              <li>
                <span className="hm-step-n">03</span>
                <h3>Merge</h3>
                <p>
                  The gate reports <code>redline-gate / gate</code> on every pull
                  request and is <b>advisory until you promote it</b>. One human
                  approval is required either way.
                </p>
              </li>
            </ol>
            <div className="hm-local">
              <p className="hm-local-h">
                Point it at a local model and no code leaves your machine.
              </p>
              <p>
                <code>redline review --engine api</code> speaks the
                OpenAI-compatible dialect, so Ollama, LM Studio and vLLM all
                work, and a local endpoint needs no key. The model returns JSON
                against a published schema — the CLI writes the{" "}
                <code>Redline/&lt;SEVERITY&gt; [rule-id]:</code> line itself, so a
                model can never invent a severity or an id.{" "}
                <Link href="/docs/local-review">
                  How local review works →
                </Link>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 6 — why this is different ============ */}
      <section className="hm-sec hm-claims" id="different">
        <div className="container">
          <Reveal>
            <div className="hm-sec-head">
              <h2 className="hm-h2">Why this is different</h2>
            </div>
            <div className="hm-claim">
              <div className="hm-claim-copy">
                <h3>Every finding is countable</h3>
                <p>
                  Rule ids are permanent, so a comment is an aggregate row:{" "}
                  <code>redline metrics</code> counts which rules were{" "}
                  <b>acted on</b>, which were dismissed, and which nobody has
                  ever fixed. A rule that only ever generates noise is named and
                  cut on that evidence, not on argument.{" "}
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
                  {seedCount} defects are seeded into a corpus in the open, each
                  marked with the severity and the rule id it must be caught at.
                  Anyone can run a reviewer over it and check the number, and
                  whatever has been scored against it so far is on{" "}
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
                <h3>We govern the diff. Nothing after it</h3>
                <p>
                  Redline governs a change while it is still a diff. It does not
                  build, deploy, promote or roll back anything, it has no opinion
                  on cloud spend, and <b>its data ends at merge</b> — those are a
                  delivery platform&apos;s job and are well served. It
                  increasingly does not even produce findings itself: it governs
                  the standard, normalises whoever found what, and measures
                  whether anyone acted.{" "}
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
                the plan, and offers <b>Dry run</b> before Apply. Choose Apply
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
                <CopyButton text={initCmd} label="Copy" ariaLabel={`Copy ${initCmd}`} />
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
      <section className="final-cta">
        <div className="glow" aria-hidden="true" />
        <div className="container">
          <h2>
            Ship at AI speed.
            <br />
            The line still holds.
          </h2>
          <div className="hm-hero-cmd hm-hero-cmd-cta">
            <code>
              <span className="tk-prompt">$ </span>
              {initCmd}
            </code>
            <CopyButton text={initCmd} label="Copy" ariaLabel={`Copy ${initCmd}`} />
          </div>
          <p className="hm-cta-links">
            <Link href="/docs/quickstart">Quickstart</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/docs/standards">The {ruleCount} rules</Link>
            <a href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
              Source on GitHub
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
