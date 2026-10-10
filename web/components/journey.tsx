import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { repoRoot } from "@/lib/content";
import { loadManifest, type Manifest } from "@/lib/manifest";
import { JourneyTerminal, type Line, type Tok } from "@/components/journey-terminal";

// Everything printed in this transcript is a literal string from the CLI. Sources:
//   cli/bin/redline.ts:130     — the write line: `  ` + `write ` (padded to the
//                                width of `remove`) + `  ` + the path
//   cli/core/log.ts:34-35      — report(): `ok  ` / `FAIL` + `  ` +
//                                check.padEnd(22) + ` ` + detail
//   cli/bin/redline.ts:112,157 — `profile <name>`, `pull request: <url>`
//   cli/render/vendors.ts      — the rendered artifact paths
//   cli/render/commands.ts     — the slash-command paths
//   cli/platforms/github/install.ts — capability details, `.github/…` paths,
//                                REQUIRED_CHECK
//   cli/commands/init.ts       — ONBOARD_BRANCH, the PR title, the `redline-sync` label
//   cli/commands/verify.ts     — every `redline verify` finding detail
// Nothing here is invented: every command and every line of output is a literal
// CLI string. The single exception is the `# ...` line before `redline verify`,
// a shell comment narrating the gap between the two runs — the lead paragraph
// below names it rather than letting the page claim more than it delivers.
//
// The transcript is a selection of a longer real run, never a summary of one:
// the writes shown are four of the paths the run prints, and the count of the
// rest is stated in the caption outside the terminal rather than faked as a
// line the CLI never printed.

const PROFILE = "web-react";
const EXAMPLE_REPO = "acme/checkout-service";
const EXAMPLE_PR = 42;

// cli/platforms/github/install.ts — REQUIRED_CHECK.
const GATE_CHECK = "redline-gate / gate";
// cli/platforms/github/verify.ts — CALLER_WORKFLOW, the file readGateMachinery
// reads the published check name out of; also the path installGate syncs.
const CALLER_WORKFLOW = ".github/workflows/redline.yml";
// cli/platforms/github/install.ts — the default template path.
const PR_TEMPLATE = ".github/pull_request_template.md";
// cli/commands/init.ts — ONBOARD_BRANCH and the sync label applied to the onboarding PR.
const ONBOARD_BRANCH = "redline/onboard";
const SYNC_LABEL = "redline-sync";

// The questions `redline init` asks with no flags at a terminal, in the order
// cli/ui/wizard.ts asks them, with the answers this example repository gave.
// The last one is the reason the writes below happen at all: nothing is written
// until Apply is chosen, and the menu offers Dry run first.
const MENU: [string, string][] = [
  ["Which standards apply here?", "web-react"],
  ["Where does this repository live?", "GitHub"],
  ["What runs your pull request checks?", "GitHub Actions"],
  ["Which assistants should read the standards?", "copilot, agents, claude"],
  ["Extra context to render beside the rules", "Spec-driven development"],
  ["What should Redline set up alongside its own checks?", "none"],
  ["What should Redline install?", "gate, merge-policy, labels"],
  ["Where should the merge gate live?", "in the organisation"],
  ["How hard should the check bite?", "observe"],
  ["Ready?", "Write, commit and open a pull request"],
];

const dim = (t: string): Tok => ({ t, c: "tk-dim" });
const white = (t: string): Tok => ({ t, c: "tk-white" });
const green = (t: string): Tok => ({ t, c: "tk-green" });
const red = (t: string): Tok => ({ t, c: "tk-red" });
const amber = (t: string): Tok => ({ t, c: "tk-amber" });
// The CLI paints answers and URLs cyan; the site has one blue, and a terminal
// panel is not the place to introduce a second accent.
const cyan = (t: string): Tok => ({ t, c: "tk-blue" });
const bold = (t: string): Tok => ({ t, c: "tk-bold" });
const plain = (t: string): Tok => ({ t });

const cmd = (text: string): Line => ({
  cmd: true,
  toks: [{ t: "$ ", c: "tk-prompt" }, white(text)],
});

// Mirrors cli/render/profile.ts resolveProfile — stacks in declaration order,
// parents first — including both of its throws. The caption's file count is
// derived from what this returns, so a profile the manifest cannot resolve has
// to fail the build: a smaller number rendered against a green build is exactly
// the silent degradation this page exists to avoid.
function resolveStacks(manifest: Manifest, profile: string): string[] {
  const key = manifest.profileAliases[profile] ?? profile;
  const stacks = manifest.profiles[key];
  if (stacks === undefined) {
    throw new Error(
      `standards/manifest.json has no profile "${profile}"; the home page renders its resolved file list`
    );
  }
  const out: string[] = [];
  const visit = (id: string): void => {
    const stack = manifest.stacks[id];
    if (stack === undefined) {
      throw new Error(
        `standards/manifest.json profile "${key}" references unknown stack "${id}"`
      );
    }
    for (const parent of stack.extends ?? []) visit(parent);
    if (!out.includes(id)) out.push(id);
  };
  stacks.forEach(visit);
  return out;
}

// Questions the wizard asks that a default run never sees, so a transcript of a
// default run must not show them. Each one needs a reason, because the list is
// the only way a genuinely new question can be kept off this page.
const CONDITIONAL = new Set([
  // Asked only when review-ownership was selected, which it is not by default.
  "Who owns the paths Redline protects?",
]);

/**
 * Fail the build when MENU and the wizard disagree.
 *
 * MENU is hand-written, and hand-written mirrors drift: this page showed six
 * questions for a wizard that had grown to ten, so the first thing a visitor
 * saw was a menu that no longer existed. Every other number on this page is
 * derived from the repository and throws rather than degrade, and the list of
 * questions is the part a reader actually reads.
 *
 * Parsed rather than imported because the CLI is TypeScript run by Node's own
 * type stripping and this is a Next build — reading the source is the cheap
 * boundary between the two, and it is checked at build time so a stale page
 * cannot reach a green deploy.
 */
function assertMenuMatchesWizard(): void {
  const source = readFileSync(join(repoRoot(), "cli/ui/wizard.ts"), "utf8");
  const asked: string[] = [];
  for (const match of source.matchAll(
    /\bp\.(?:multiselect|select|text)\s*(?:<[^>]*>)?\s*\(\s*(['"])(.*?)\1/g
  )) {
    const title = match[2];
    // The profile question is asked twice — once, then again when the first
    // answer was empty. It is one question to a reader.
    if (title !== undefined && asked.at(-1) !== title) asked.push(title);
  }
  if (asked.length === 0) {
    throw new Error(
      "could not read any question out of cli/ui/wizard.ts; the home page mirrors its menu"
    );
  }
  const expected = asked.filter((title) => !CONDITIONAL.has(title));
  const shown = MENU.map(([title]) => title);
  if (expected.join("\n") !== shown.join("\n")) {
    throw new Error(
      "components/journey.tsx MENU no longer matches the questions cli/ui/wizard.ts asks.\n" +
        `  wizard: ${JSON.stringify(expected)}\n` +
        `  page:   ${JSON.stringify(shown)}\n` +
        "Update MENU with the new question and its answer, or add it to CONDITIONAL with the " +
        "reason a default run never sees it."
    );
  }
}

// A terminal folds a line longer than its width onto the next row, with no
// indent. The CLI prints these long lines whole, so the panel does what a
// TERM_COLUMNS-wide terminal would, at a word boundary.
const TERM_COLUMNS = 100;
function softWrap(toks: Tok[]): Line[] {
  const lines: Line[] = [];
  let line: Tok[] = [];
  let width = 0;
  for (const tok of toks) {
    for (const word of tok.t.split(/(?<= )/)) {
      if (width + word.trimEnd().length > TERM_COLUMNS && width > 0) {
        lines.push({ toks: line });
        line = [];
        width = 0;
      }
      const last = line.at(-1);
      if (last !== undefined && last.c === tok.c) last.t += word;
      else line.push({ t: word, c: tok.c });
      width += word.length;
    }
  }
  if (line.length > 0) lines.push({ toks: line });
  return lines;
}

// The file and line the review below reports, in the diff the example change
// adds: a fetch whose JSON is double-asserted to the domain type.
const REVIEW_FILE = "src/billing/load.ts";
const REVIEW_LINE = 3;

// cli/ui/tty.ts FACE and WORDMARK, read from the source for the same reason the
// menu is: a block-letter logo copied into this file would go on printing after
// the CLI's own had changed.
function wordmark(): string[] {
  const source = readFileSync(join(repoRoot(), "cli/ui/tty.ts"), "utf8");
  const word = /const WORDMARK = '([A-Z]+)'/.exec(source)?.[1];
  const face = /const FACE[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source)?.[1];
  const glyphs = new Map<string, string[]>();
  for (const m of (face ?? "").matchAll(/([A-Z]):\s*\[([^\]]*)\]/g)) {
    glyphs.set(m[1]!, [...m[2]!.matchAll(/'([^']*)'/g)].map((r) => r[1]!));
  }
  const letters = [...(word ?? "")].map((ch) => glyphs.get(ch));
  if (word === undefined || letters.length === 0 || letters.some((l) => l?.length !== 5)) {
    throw new Error(
      "could not read the wordmark out of cli/ui/tty.ts; the home page draws it"
    );
  }
  return Array.from({ length: 5 }, (_, row) => letters.map((l) => l![row]).join(" "));
}

// cli/policy/checks.ts — the problem text the deterministic unsafe-assertion
// check prints, read from the source so the transcript cannot quote a message
// the checker no longer writes.
function demoReviewProblem(): string {
  const source = readFileSync(join(repoRoot(), "cli/policy/checks.ts"), "utf8");
  const chunk =
    /'a double assertion overrides the type checker[^']*'(?:\s*\+\s*'[^']*')*/.exec(source)?.[0] ?? "";
  const text = [...chunk.matchAll(/'([^']*)'/g)].map((m) => m[1]).join("");
  if (text === "") {
    throw new Error(
      "cli/policy/checks.ts no longer prints the double-assertion problem the home page quotes"
    );
  }
  return text;
}

// Mirrors cli/render/commands.ts loadCommands: one slash command per .md file in
// commands/, rendered once per vendor host. Read at build time so the page
// cannot count files that are not on disk — and throws rather than degrading.
function commandCount(): number {
  const dir = join(repoRoot(), "commands");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8");
    const front = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? "";
    const description = /description:\s*(.+)/.exec(front)?.[1]?.trim();
    if (description === undefined || description === "") {
      throw new Error(
        `commands/${file} has no frontmatter description; the CLI renders it verbatim`
      );
    }
  }
  if (files.length === 0) {
    throw new Error("commands/ holds no .md files; the home page counts what init writes");
  }
  return files.length;
}

export function Journey({ initCmd }: { initCmd: string }) {
  assertMenuMatchesWizard();
  const manifest = loadManifest();
  const version = manifest.version;
  const stacks = resolveStacks(manifest, PROFILE);
  const commands = commandCount();

  // cli/render/vendors.ts PREFIX — one instructions file per resolved stack.
  const instructionFiles = stacks.map(
    (s) => `.github/instructions/redline-${s}.instructions.md`
  );
  // The full write list of the run: the three merged standards files, the
  // per-stack instructions, the slash commands rendered once per vendor host,
  // and the four host files.
  const totalWrites =
    3 + instructionFiles.length + commands * 2 + 4;

  // Four of the paths the run prints — the three files an AI tool opens, and
  // the workflow that publishes the check.
  const shownWrites = [
    ".github/copilot-instructions.md",
    "AGENTS.md",
    "CLAUDE.md",
    CALLER_WORKFLOW,
  ];

  // cli/commands/init.ts — [...gate.outcomes, ...ownership.outcomes,
  // ...security.outcomes, ...policy.outcomes], in that order.
  const outcomes: [string, string][] = [
    ["labels", 'label "no-adr"'],
    ["gate", `wrote ${PR_TEMPLATE}`],
    // review-ownership is deliberately absent: it is opt-in behind
    // `--with review-ownership`, so a default run never seeds CODEOWNERS and a
    // transcript of a default run must not show it doing so.
    ["secret-scanning", "secret scanning"],
    ["push-protection", "secret scanning push protection"],
    ["dependency-alerts", "dependabot alerts (vulnerability alerts)"],
    ["merge-policy", "branch ruleset"],
    ["repo-property", 'repository property "redline=onboarded"'],
  ];
  // cli/ui/report.ts — the capability column is padded to the longest name.
  const nameWidth = Math.max(...outcomes.map(([name]) => name.length));

  // cli/commands/verify.ts, in the order it calls add() — four of the eight
  // checks that run. Details are the healthy branch of each, for a repository
  // onboarded by `redline init` with its default menu.
  const findings: [string, string][] = [
    ["onboarded", `profile ${PROFILE}, standards v${version}`],
    ["gate-machinery", `${CALLER_WORKFLOW} publishes ${GATE_CHECK}`],
    ["security-floor", "security floor enabled"],
    ["artifacts-current", `rendered artifacts match standards v${version}`],
  ];

  const reviewProblem = demoReviewProblem();

  // Every line below is laid out the way cli/ui/tty.ts and cli/ui/report.ts lay
  // it out — the glyphs, the two-space gutters, the padded status column — and
  // painted in the colours those functions use.
  const lines: Line[] = [
    cmd(initCmd),
    // tty.ts intro(): the wordmark, a blank row, the chip, then a bare bar.
    // One block rather than five lines: the transcript's line height would
    // open gaps between the rows of block glyphs that a terminal does not draw.
    { toks: [{ t: wordmark().join("\n"), c: "tk-wordmark" }] },
    { toks: [] },
    { toks: [red("┌"), plain("  "), { t: " Redline ", c: "tk-chip" }] },
    { toks: [dim("│")] },
    // wizard.ts ORIENTATION, through tty.ts note(): only the first line carries
    // the bar and the marker; the rest print as they are.
    { toks: [dim("│"), plain("  "), amber("▲"), plain(" Around ten questions, most already answered.")] },
    { toks: [plain("Whatever was detected is preselected, so enter accepts it.")] },
    { toks: [plain("The last question can still be a preview that writes nothing.")] },
    // tty.ts answered() — `◇  <title> · <answer>` — the line each question
    // leaves behind once it is confirmed. The expanded lists are further down
    // the page.
    ...MENU.map(([question, answer]) => ({
      toks: [dim("◇"), plain(`  ${question} `), dim("·"), plain(" "), cyan(answer)],
    })),
    // prompt.ts task() → tty.ts spinnerDone(), once the run finishes.
    { toks: [dim("│"), plain("  "), green("✓"), plain(" onboarding this repository")] },
    // report.ts renderReport().
    { toks: [plain("  profile "), cyan(PROFILE)] },
    { toks: [] },
    { toks: [bold("  Files"), dim(`  ${totalWrites} written`)] },
    ...shownWrites.map((f) => ({ toks: [plain("   "), green("+"), plain(` ${f}`)] })),
    { toks: [] },
    { toks: [bold("  Repository settings"), dim(`  ${outcomes.length} in place`)] },
    ...outcomes.map(([capability, detail]) => ({
      toks: [
        plain("   "),
        green(`✓ ${"applied".padEnd(11)}`),
        plain(" "),
        bold(capability.padEnd(nameWidth)),
        plain("  "),
        dim(detail),
      ],
    })),
    { toks: [] },
    { toks: [bold("  Pull request")] },
    { toks: [plain("   "), cyan(`https://github.com/${EXAMPLE_REPO}/pull/${EXAMPLE_PR}`)] },
    { toks: [] },
    // The second `#` line, like the first, is ours: the time between runs.
    { toks: [dim("# later, on a feature branch, before pushing")] },
    cmd("redline review"),
    { toks: [plain(`profile ${PROFILE} — rules in scope: core, typescript, react`)] },
    { toks: [bold(`${REVIEW_FILE}:${REVIEW_LINE}`)] },
    ...softWrap([
      plain("  Redline/"),
      red("BLOCKER"),
      plain(` [core/unsafe-assertion]: ${reviewProblem}`),
    ]),
    { toks: [plain("1 finding(s)")] },
    ...softWrap([
      dim(
        "that is every rule a checker can decide; the rest of the standard needs a model — " +
          "run /redline-review in your assistant, or `redline review --engine api`"
      ),
    ]),
    { toks: [] },
    { toks: [dim(`# the gate workflow has since run on PR #${EXAMPLE_PR}`)] },
    cmd("redline verify"),
    ...findings.map(([check, detail]) => ({
      toks: [green("ok  "), plain("  "), white(check.padEnd(22)), dim(` ${detail}`)],
    })),
  ];

  return (
    <section className="hm-sec hm-journey" id="proof">
      <div className="container">
        <div className="hm-sec-head">
          <h2 className="hm-h2">One repository, start to finish</h2>
          <p className="hm-lead">
            <b>Every line below is one the CLI prints</b>, laid out and coloured
            the way it draws them: onboarding, a review before you push, then
            the check that it all held. The <code>◇</code> rows are the
            questions after you answer them —{" "}
            <Link href="/docs/onboarding#menu">each one explained in the docs</Link>. The two{" "}
            <code>#</code> lines are ours, marking time between runs.
          </p>
        </div>

        <div className="hm-term-wrap">
          <JourneyTerminal lines={lines} title={`terminal — ${EXAMPLE_REPO}`} />
        </div>

        <p className="hm-term-cap">
          <b>One pull request on <code>{ONBOARD_BRANCH}</code>. Never a push.</b>{" "}
          Titled <code>chore(redline): onboard to standards v{version}</code> and
          labelled <code>{SYNC_LABEL}</code>, for the repository&apos;s own team to
          review and merge. Four of the {totalWrites} files it writes are shown;
          it merges into files you already have rather than overwriting them.{" "}
          <Link href="/docs/onboarding">Every file, and how the merge works →</Link>
        </p>
      </div>
    </section>
  );
}
