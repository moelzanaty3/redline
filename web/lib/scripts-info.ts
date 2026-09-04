// Maintainer-facing detail for each script in scripts/. Nothing here runs against an
// onboarded repo — these are the Redline source repo's own CI, telemetry and validation
// tooling. Facts are sourced from .github/workflows/ci.yml and workflows/*.yml, not
// guessed: see each script's own header comment for the same claims.
export type ScriptInfo = {
  what: string;
  runsIn: string;
  trigger: string;
  command: string[];
  env: string[];
  produces: string;
  action: string;
};

export const SCRIPTS_INFO: Record<string, ScriptInfo> = {
  validate: {
    what: "Bundle self-check: manifest integrity, the severity output contract survives edits, every rule id is well-formed, ruleset JSON matches the advertised required check, workflow files exist, the seed corpus is well-formed.",
    runsIn: "This (source) repo.",
    trigger: "CI (.github/workflows/ci.yml), job validate, step \"Bundle invariants\" — every pull request and every push to main.",
    command: ["node scripts/validate.mjs"],
    env: [],
    produces: "Prints each failure as `FAIL: ...` and each warning as `warn: ...` to stdout, then a count line. Exits 1 if any check failed, 0 otherwise.",
    action: "Run it locally before pushing a change to standards/, rulesets/ or workflows/ — it's exactly what CI runs, so a local pass means the CI job passes too.",
  },
  "assign-rule-ids": {
    what: "Assigns a permanent `<stack>/<slug>` id to every rule bullet in standards/ that doesn't have one yet, and rewrites the source file in place. Ids are written into the markdown, not derived at render time, so a later reword of the rule text never orphans its historical telemetry.",
    runsIn: "This (source) repo.",
    trigger: "CI (.github/workflows/ci.yml), job validate, step \"Every rule carries an id\" — every pull request and push to main, always with --check.",
    command: [
      "node scripts/assign-rule-ids.mjs         # assign missing ids, rewrite standards/ in place",
      "node scripts/assign-rule-ids.mjs --check  # fail if any rule is missing an id — what CI runs",
    ],
    env: [],
    produces: "Without --check: rewrites the affected standards/*.md files and prints how many ids were assigned. With --check: lists any rule missing an id and exits 1; exits 0 and prints the total rule count otherwise.",
    action: "Run it (without --check) locally right after adding a new rule bullet to standards/ — it assigns the id for you rather than you inventing one by hand.",
  },
  "render-self": {
    what: "Renders this repository's own standards artifacts (AGENTS.md, CLAUDE.md, .github/copilot-instructions.md) using the same TypeScript renderer (cli/render/standards.ts) that product repos get via redline init, profile tooling.",
    runsIn: "This (source) repo.",
    trigger: "CI (.github/workflows/ci.yml), job validate, step \"Rendered artifacts are current\", always with --check. Also referenced by workflows/redline-sync.yml, which is disabled in Phase 1 — see the Workflows section.",
    command: [
      "node scripts/render-self.mjs         # re-render and write the artifacts",
      "node scripts/render-self.mjs --check  # fail if the checked-in artifacts are stale — what CI runs",
    ],
    env: [],
    produces: "Without --check: writes/prunes the rendered files and lists each with `write` or `prune`. With --check: exits 1 and names the stale files if the checked-in output doesn't match a fresh render; exits 0 otherwise.",
    action: "Run it (without --check) locally after editing standards/ so the checked-in AGENTS.md/CLAUDE.md/copilot-instructions.md stay in sync — otherwise CI's --check step fails your PR.",
  },
  "build-registry": {
    what: "Derives registry.json — the register of onboarded repositories — by walking every repo in the org for a .redline.json. The register is never hand-edited and redline init never writes it: an entry exists exactly as long as the repository's own file does, so a repo that removes Redline leaves the register on the next run.",
    runsIn: "This (source) repo.",
    trigger: ".github/workflows/registry.yml — nightly at 04:00 UTC, plus workflow_dispatch.",
    command: ["npm run build && GH_TOKEN=... ORG=... SOURCE=owner/repo node scripts/build-registry.mjs"],
    env: [
      "GH_TOKEN — read access to org repos.",
      "ORG — the owner whose repositories are walked.",
      "SOURCE — owner/name of this repo, recorded in the register so a consumer knows which estate it describes.",
      "OUT — output path, default registry.json.",
    ],
    produces: "registry.json, with entries ordered by org then repo so a nightly commit only diffs when the estate actually changed. Prints one line per problem — a repository whose .redline.json is malformed, one with no default branch — and exits 1 without writing anything if no onboarded repository was found at all: an empty register is indistinguishable from a token that lost access, and publishing it would erase the dashboard's coverage figure and every sync target in one commit.",
    action: "Nothing, normally — the nightly workflow runs it. Run it by hand after onboarding a batch of repositories if you do not want to wait for the next refresh.",
  },
  "measure-context": {
    what: "Measures what the skills render target saves, per profile: the composed AGENTS.md a Claude session loads every turn, against the core skill plus the one stack whose files are actually in play.",
    runsIn: "This (source) repo.",
    trigger: "Run by hand. The roadmap makes the skills target conditional on this number, so it is a script anyone can re-run rather than a claim asserted once.",
    command: ["npm run build && node scripts/measure-context.mjs", "OUT=context.json node scripts/measure-context.mjs"],
    env: ["ROOT — the repo to measure, default the working directory.", "OUT — also write the rows as JSON here."],
    produces: "A row per profile with the byte counts and the reduction, and the finding stated rather than left for the reader to spot: multi-stack profiles save 20-48%, and single-stack profiles LOSE about 5% because there is no second stack to avoid loading and the frontmatter is pure overhead.",
    action: "Run it before deciding whether to select the skills vendor for a repository. If the repository's profile has one stack, do not — the measurement says it makes things worse, and no amount of rollout enthusiasm changes that.",
  },
  "build-baseline": {
    what: "Computes the Phase 0 baseline the roadmap's acceptance criteria name: acted-on rate, coverage, findings per week, the merge rate on Redline's own pull requests, which SARIF producers the estate already runs, and AI spend. It is the set of numbers every later phase is judged against.",
    runsIn: "A maintainer's terminal, once, with org credentials — alongside a checkout of the metrics repo's data/.",
    trigger: "Run by hand. It is a measurement, not a loop.",
    command: [
      "DATA_DIR=data REGISTRY=registry.json DAYS=90 node scripts/build-baseline.mjs",
      "GH_TOKEN=... ORG=... SPEND_TOTAL=... node scripts/build-baseline.mjs   # the full picture",
    ],
    env: [
      "DATA_DIR — collected telemetry, default data.",
      "REGISTRY — the derived register, default registry.json.",
      "DAYS — window in days, default 90.",
      "GH_TOKEN + ORG — needed to survey Redline's own pull requests and scan for SARIF producers.",
      "SPEND_TOTAL, SPEND_CURRENCY, SPEND_GRAIN — AI spend from the vendor's own usage reporting, which no script here can read for you.",
    ],
    produces: "baseline.json plus a readable summary. Every figure it cannot source is reported as unavailable WITH ITS REASON rather than as zero — a zero that means \"nobody measured this\" reads as a finding, and would make every later comparison look like progress that did not happen. Cost per BLOCKER caught is computed only when both halves exist, and names the missing half when they do not.",
    action: "Run it before starting any roadmap phase past 0. The roadmap says plainly that the ordering of Phases 1-4 is a hypothesis until this exists, and that the baseline is allowed to reorder them.",
  },
  "check-pins": {
    what: "Re-resolves every SHA-pinned third-party GitHub Action (`uses: owner/repo@<sha> # <tag>`) against the tag its trailing comment claims, and separately checks whether a newer release exists. The only check in the bundle that needs network access.",
    runsIn: "This (source) repo.",
    trigger: "CI (.github/workflows/ci.yml), its own job pins, continue-on-error: true — every pull request, but a GitHub outage can't fail the rest of CI.",
    command: [
      "node scripts/check-pins.mjs            # verify pins, warn on available updates",
      "node scripts/check-pins.mjs --strict   # also fail when an update is available",
    ],
    env: ["GH_TOKEN or GITHUB_TOKEN — anonymous GitHub API calls hit rate limits fast; CI passes github.token."],
    produces: "Prints `ok` or `FAIL` per pin plus an update note where relevant, then a summary line. Exits 1 if any pin doesn't match its claimed tag (or, with --strict, if any update is available); exits 0 otherwise.",
    action: "Run it after bumping a pinned action's SHA, or periodically to see what updates are available — CI runs the non-strict form, so an available update alone won't fail your PR.",
  },
  "score-seeds": {
    what: "Scores an automated reviewer's comments on a pull request against the seeded corpus's known-answer key: BLOCKER recall, false positives on clean code, and whether caught defects cited the correct rule id. Vendor-neutral — findings are attributed by reviewer login, so the same command scores Copilot, Claude or Codex on identical input.",
    runsIn: "The redline-metrics repo, against a throwaway PR on a canary target repo — never this repo.",
    trigger: "workflows/seed-canary.yml, step \"Score against the corpus\" — weekly (Monday 03:00 UTC) plus workflow_dispatch, one run per configured canary target.",
    command: [
      "GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-web --pr 12",
      "GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-web --pr 12 --json",
      "GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-web --pr 12 --history data/seed-scores.jsonl --baseline",
    ],
    env: ["GH_TOKEN — read access to the target repo's PR comments."],
    produces: "Human-readable report to stdout by default; with --json, a machine-readable score object instead. Exits 1 if BLOCKER recall is below 1.0, any false positive landed on seeded/clean/**, or (with --history/--baseline) the run regressed against the last recorded score.",
    action: "Run it by hand against a real PR when investigating why the weekly canary flagged a regression, or when trialling a new AI reviewer vendor against the same seeded input.",
  },
  "collect-telemetry": {
    what: "Central nightly pull of review outcomes for merged PRs across the org, written as monthly JSONL. Replaced the old per-repo telemetry workflow so no cross-repo write token is ever stored in a product repo.",
    runsIn: "The redline-metrics repo — never this repo.",
    trigger: "workflows/redline-collect.yml — daily (05:00 UTC) plus workflow_dispatch with a days input.",
    command: ["GH_TOKEN=... ORG=acme node scripts/collect-telemetry.mjs"],
    env: [
      "GH_TOKEN — read access to org repos and pull requests (required).",
      "ORG (required), SINCE=YYYY-MM-DD, DAYS=8, OUT=data, DRY_RUN=1",
    ],
    produces: "Writes/updates monthly JSONL files under OUT (default data/) and prints a record count per file, then a total collected count.",
    action: "Nothing, normally — it runs itself nightly. Run it by hand with workflow_dispatch (or locally with a longer DAYS window) to backfill a gap after an outage.",
  },
  "build-digest": {
    what: "Builds the Monday stakeholder digest — open/stale PR counts, seed recall, dashboard link — as a Teams Adaptive Card from already-collected telemetry.",
    runsIn: "The redline-metrics repo — never this repo.",
    trigger: "workflows/weekly-digest.yml, step \"Build Adaptive Card\" — every Monday 07:00 UTC plus workflow_dispatch. A separate step then POSTs the card to a Power Automate Teams webhook.",
    command: ["node scripts/build-digest.mjs --out digest.json"],
    env: ["DATA_DIR=data, DAYS=7, ORG=org, OPEN_PRS, STALE_PRS, CAPPED, DASHBOARD_URL, SEED_SCORES=data/seed-scores.jsonl"],
    produces: "Writes the Adaptive Card JSON to the file named by --out (stdout otherwise). Produces nothing on its own — delivery to Teams is a separate workflow step and needs TEAMS_WEBHOOK_URL.",
    action: "Nothing, normally — it runs itself every Monday. Run it locally to preview digest.json before changing what the card reports.",
  },
  "build-inbox": {
    what: "Aggregates open PRs across the org into one prioritised static HTML page.",
    runsIn: "This (source) repo.",
    trigger: "workflows/inbox.yml — every 30 minutes, 06:00-19:00 UTC, Monday-Friday, plus workflow_dispatch. Refuses to build unless the GitHub Pages site's visibility has been explicitly acknowledged as private or internal.",
    command: ["GH_TOKEN=... ORG=acme node scripts/build-inbox.mjs"],
    env: ["GH_TOKEN — org read (required).", "ORG (required), OUT=dist, MAX_PAGES=10"],
    produces: "Writes OUT/index.html (default dist/index.html), then deployed to GitHub Pages by the same workflow.",
    action: "Nothing, normally — it runs itself every 30 minutes on weekdays. Run it locally with a scoped GH_TOKEN to preview a layout change before it ships.",
  },
  "build-dashboard": {
    what: "Builds the telemetry dashboard: acted-on rate, weekly trend lines, seed recall history, and the noisiest-rules tuning queue — one static page, no server.",
    runsIn: "The redline-metrics repo — never this repo.",
    trigger: "workflows/dashboard.yml — daily (05:30 UTC), plus workflow_dispatch, plus automatically after Redline Collect or Redline Seed Canary finishes. Refuses to build unless Pages visibility has been acknowledged as private or internal.",
    command: ["ORG=acme node scripts/build-dashboard.mjs"],
    env: ["DATA_DIR=data, ORG (required), DAYS=90, OUT=dist, SEED_SCORES=data/seed-scores.jsonl, ONBOARDED, STANDARDS_VERSION"],
    produces: "Writes OUT/index.html (default dist/index.html), then deployed to GitHub Pages by the same workflow.",
    action: "Nothing, normally — it runs itself daily. Run it locally against a copy of data/ to preview a metric or chart change before it ships.",
  },
};
