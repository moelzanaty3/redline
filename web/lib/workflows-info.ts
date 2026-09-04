// Maintainer-facing detail for each reusable/org workflow in workflows/. None of these
// are installed into a product repo directly — a product repo gets a thin caller
// (templates/redline.yml) that references redline-gate.yml by org path. The rest are
// org infrastructure: they need a host repo, secrets and (for the two disabled ones)
// code that doesn't exist yet in Phase 1.
export type WorkflowInfo = {
  what: string;
  disabled: boolean;
  livesIn: string;
  trigger: string;
  // How this workflow gets into the repository that runs it. Redline installs
  // some of these and a human copies others by hand — omitting the difference
  // is how a workflow ends up assumed present and never installed.
  onboard: string;
  steps: string[];
  phase1: string;
  // What a run leaves behind: a status check, a commit, a deployed page, an
  // issue. Where a workflow is disabled this says what you get instead, which
  // is usually nothing at all.
  output: string;
  action: string;
};

export const WORKFLOWS_INFO: Record<string, WorkflowInfo> = {
  "redline-gate": {
    what: "The reusable merge-readiness gate every onboarded GitHub repo requires to merge. Four checks aggregated into one required status.",
    disabled: false,
    livesIn: "The org .github repo, at .github/workflows/redline-gate.yml — copied there once by hand (see Installation). Every onboarded repo's caller workflow (templates/redline.yml) references it by org path as <org>/.github/.github/workflows/redline-gate.yml@main.",
    trigger: "workflow_call, invoked by the calling repo's Redline workflow on every pull request.",
    onboard:
      "Installed in two places, once each. The reusable workflow is copied by hand into the org's .github repository as .github/workflows/redline-gate.yml — see Installation. The per-repo caller is written by redline init on every onboarded GitHub repo, so after the one-time org step no repository needs manual work.",
    steps: [
      "checklist (\"PR checklist\") — passes only if the PR body has a ## Launch readiness section with every box ticked. Fails loudly, not silently, if the heading is missing entirely.",
      "adr (\"ADR required for significant changes\") — passes if changed lines are at or below adr-diff-threshold (default 300), or the PR body links docs/adr/, or the no-adr label is applied.",
      "dependency-review — actions/dependency-review-action@v4; fails at or above fail-on-dependency-severity (default high).",
      "secrets (\"Secret scan (diff)\") — trufflehog, pinned to a commit SHA, scanning only the PR's diff range with --results=verified --fail; fails on any verified secret.",
      "gate (aggregate, name: gate) — needs all four. dependency-review and secrets are hard-fail and never label-exemptible. checklist and adr are soft-fail: the redline-exempt or redline-sync label downgrades a failure there to a warning. The branch ruleset requires the check context redline-gate / gate — the caller job id plus this aggregate job's id.",
    ],
    phase1: "Active — this is what redline init wires up on GitHub today.",
    output:
      "One required status check, redline-gate / gate, on every pull request. The four sub-checks report individually beside it. dependency-review comments its findings on the PR; the secret scan fails the check without echoing what it found. A soft-fail check downgraded by the redline-exempt or redline-sync label reports as a warning rather than a failure, and the aggregate still passes.",
    action: "Nothing directly — it's called by the caller workflow your repo already has. If it fails, see The merge gate for what each check expects and how to satisfy or exempt it.",
  },
  "redline-sync": {
    what: "Distributes the rendered standards to onboarded repos as pull requests — never as pushes, never as merges. Targets come from registry.json, derived nightly from the .redline.json each onboarded repo carries rather than a list anyone maintains.",
    disabled: false,
    livesIn: "This (source) repo.",
    trigger: "push to main touching standards/**, cli/render/**, templates/** or the PR template, plus workflow_dispatch with dry-run and only <owner/name> inputs.",
    onboard:
      "Nothing to install: it lives in this repository and would run here. It has never distributed anything, because its job carries if: false.",
    steps: [
      "Verifies this repo's own rendered artifacts are current (scripts/render-self.mjs --check) before distributing anything — a sync of stale artifacts would propagate the staleness to every onboarded repo at once, as a pull request each team is asked to trust.",
      "Builds the CLI and runs `redline sync`, which reads registry.json, renders each target's artifacts against its own recorded profile and vendors, and opens or updates one pull request per repo that is behind.",
    ],
    phase1: "Active. GitHub only — Azure DevOps sync is outstanding, and a registered Azure repository is reported as unsupported rather than skipped silently.",
    output:
      "One pull request per registered repository that is behind, titled with the standards version and listing the generated files it changes. A repository already carrying the current render gets nothing rather than an empty pull request, and one whose previous sync pull request is still open has that one updated rather than a second opened. Content above each REDLINE:BEGIN marker is never touched.",
    action: "Nothing, normally — a push to standards/ triggers it. Run it by hand with the dry-run input first when changing the renderer itself, and use only <owner/name> to rehearse against a single repository before the estate.",
  },
  "redline-collect": {
    what: "Pulls review outcomes for merged PRs across the org and commits them as monthly JSONL, via scripts/collect-telemetry.mjs.",
    disabled: false,
    livesIn: "The redline-metrics repo — not this one.",
    trigger: "Daily at 05:00 UTC, plus workflow_dispatch with a days input (default 8).",
    onboard:
      "Copy this file into the redline-metrics repository as .github/workflows/redline-collect.yml and set REDLINE_ORG_READ_TOKEN there. It is org infrastructure, not something a product repo installs.",
    steps: [
      "Runs scripts/collect-telemetry.mjs with GH_TOKEN, ORG and DAYS from the environment.",
      "Commits any changed files under data/ as \"data: telemetry through <date>\", rebasing against the branch before pushing so a concurrent digest commit doesn't collide.",
    ],
    phase1: "Works, but only where installed: needs REDLINE_ORG_READ_TOKEN configured on the redline-metrics repo. It is org infrastructure for telemetry, not something a product repo runs.",
    output:
      "Monthly JSONL files under data/, committed as \"data: telemetry through <date>\". One record per reviewed pull request, carrying the rule ids cited and whether each finding was acted on. Nothing is published — the dashboard and digest read these files.",
    action: "Nothing, normally — it runs itself nightly. Trigger it by hand with workflow_dispatch to backfill a gap after an outage.",
  },
  "weekly-digest": {
    what: "Posts a Monday-morning stakeholder digest (open/stale PR counts, seed recall, dashboard link) to Teams as an Adaptive Card, via scripts/build-digest.mjs.",
    disabled: false,
    livesIn: "The redline-metrics repo — not this one.",
    trigger: "Every Monday at 07:00 UTC, plus workflow_dispatch.",
    onboard:
      "Copy this file into the redline-metrics repository and set REDLINE_ORG_READ_TOKEN and TEAMS_WEBHOOK_URL there. The webhook must be a Power Automate \"When a Teams webhook request is received\" flow; the retired Office 365 connector shape no longer delivers.",
    steps: [
      "Counts open and stale (>7 days untouched) org PRs via the GitHub search API.",
      "Builds the Adaptive Card with scripts/build-digest.mjs --out digest.json.",
      "POSTs it to TEAMS_WEBHOOK_URL — a Power Automate \"When a Teams webhook request is received\" flow; the old Office 365 connector shape no longer delivers. Fails the step outright if the webhook secret isn't set.",
    ],
    phase1: "Works, but only where installed: needs REDLINE_ORG_READ_TOKEN and TEAMS_WEBHOOK_URL. Delivers an empty-looking digest on a repo with no collected telemetry yet.",
    output:
      "An Adaptive Card posted to Teams each Monday: open and stale PR counts, seed recall, and a dashboard link. With no collected telemetry yet the card still posts and reads empty. A missing webhook secret fails the step outright rather than posting nothing quietly.",
    action: "Nothing, normally — it runs itself every Monday. Run scripts/build-digest.mjs locally to preview digest.json before changing what the card reports.",
  },
  inbox: {
    what: "Rebuilds the org-wide prioritised PR inbox and publishes it to GitHub Pages, via scripts/build-inbox.mjs.",
    disabled: false,
    livesIn: "This (source) repo.",
    trigger: "Every 30 minutes, 06:00-19:00 UTC, Monday-Friday, plus workflow_dispatch.",
    onboard:
      "It lives in this repository and is already installed here. Before it will build, set the repository variable PAGES_VISIBILITY_ACKNOWLEDGED to private or internal and provide REDLINE_ORG_READ_TOKEN.",
    steps: [
      "Refuses to build unless the repository variable PAGES_VISIBILITY_ACKNOWLEDGED is set to private or internal — the page lists PR titles, authors and repo names, and a public Pages site would leak them.",
      "Builds dist/index.html with scripts/build-inbox.mjs.",
      "Deploys to GitHub Pages, then opens or updates a tracking issue if the build or deploy failed.",
    ],
    phase1: "Works, once Pages visibility is acknowledged and REDLINE_ORG_READ_TOKEN is set.",
    output:
      "A static page on GitHub Pages listing open org pull requests in priority order. On a build or deploy failure it opens or updates a single tracking issue rather than failing silently. Without the visibility acknowledgement it refuses to build at all — the page carries PR titles, authors and repo names, and a public Pages site would leak them.",
    action: "Nothing, normally — it runs itself. Run scripts/build-inbox.mjs locally with a scoped GH_TOKEN to preview a layout change before it ships.",
  },
  dashboard: {
    what: "Rebuilds the telemetry dashboard and publishes it to GitHub Pages, via scripts/build-dashboard.mjs.",
    disabled: false,
    livesIn: "The redline-metrics repo — not this one.",
    trigger: "Daily at 05:30 UTC, plus workflow_dispatch, plus automatically once Redline Collect or Redline Seed Canary finishes.",
    onboard:
      "Copy this file into the redline-metrics repository, set REDLINE_ORG_READ_TOKEN and acknowledge Pages visibility there. Coverage additionally needs registry.json readable from the source repo — which the Redline Registry workflow now publishes nightly.",
    steps: [
      "Same Pages-visibility gate as the inbox.",
      "Counts onboarded repos by reading registry.json from the source repo, for a coverage figure. A failed read omits the figure rather than reporting zero.",
      "Builds dist/index.html with scripts/build-dashboard.mjs, then deploys, then opens or updates a tracking issue on failure.",
    ],
    phase1: "Works, but only where installed: same Pages-visibility gate as the inbox, plus REDLINE_ORG_READ_TOKEN and collected telemetry to summarise. The coverage figure works again now that registry.json exists — but this workflow file lives in the metrics repo, so the fix reaches the live dashboard only once someone copies it across; redline sync, which would do that, is still unbuilt.",
    output:
      "A static dashboard on GitHub Pages: acted-on rate, weekly trend, seed recall history, and the rules most worth tuning. Coverage is reported as instrumented-against-onboarded, read from registry.json; if that read fails the figure is omitted rather than shown as zero, because zero would look like a finding.",
    action: "Nothing, normally — it runs itself daily. Run scripts/build-dashboard.mjs locally against a copy of data/ to preview a metric or chart change.",
  },
  "seed-canary": {
    what: "The regression test for the review layer itself: opens a throwaway PR of known-bad code against a canary repo, waits for the automated reviewer, scores it, records the result, and closes the PR. Distinguishes \"nothing to find\" from \"stopped finding things\", which ordinary telemetry can't.",
    disabled: false,
    livesIn: "The redline-metrics repo — not this one.",
    trigger: "Weekly, Monday 03:00 UTC, plus workflow_dispatch with a targets override.",
    onboard:
      "Copy this file into the redline-metrics repository and set CANARY_TARGETS, REDLINE_CANARY_TOKEN (scoped to the canary repos only) and REDLINE_ORG_READ_TOKEN. It opens and closes pull requests on the targets, so scope that token narrowly.",
    steps: [
      "plan — reads the CANARY_TARGETS repo variable (or a dispatch override), a JSON array of {repo, stack}.",
      "score (matrix, one run per target) — opens a branch on the target repo carrying seeded/<stack> and seeded/clean, labelled redline-exempt so the readiness gate doesn't block a PR nobody will merge; waits for review comments to stop arriving (two stable polls, up to 40 minutes); scores with scripts/score-seeds.mjs --json; always closes and deletes the PR/branch afterward, even on failure.",
      "record — appends every score to data/seed-scores.jsonl and fails the run if any target's BLOCKER recall is below 1.0 or produced a false positive on the clean corpus.",
    ],
    phase1: "Works, but only where installed: needs CANARY_TARGETS, REDLINE_CANARY_TOKEN scoped to the canary repos only, and REDLINE_ORG_READ_TOKEN to check out this repo's seeded corpus.",
    output:
      "One score per target appended to data/seed-scores.jsonl, and a failed run if any target's BLOCKER recall drops below 1.0 or the clean corpus attracts a false positive. Every throwaway PR and branch it opens is closed and deleted afterwards, including when the run fails.",
    action: "Nothing, normally — it runs itself weekly. Trigger it by hand with workflow_dispatch and a targets override when validating a new AI reviewer vendor or a standards change.",
  },
  "verify-onboarding": {
    what: "Re-verifies every onboarded repo weekly and opens one tracking issue on drift — a ruleset edited by hand, a renamed caller job, push protection turned off, artifacts left stale by an ignored sync pull request.",
    disabled: false,
    livesIn: "This (source) repo.",
    trigger: "Weekly, Tuesday 06:00 UTC, plus workflow_dispatch with an only <owner/name> override.",
    onboard:
      "It lives in this repository and is already here. It has never verified anything: its job carries if: false, and the script it called was deleted.",
    steps: [
      "Loops over registry.json (or one only <owner/name> override) calling `redline verify --repo` for each. The loop deliberately does not abort on a failure: a drifted repository exits non-zero by design, and stopping at the first one would leave the rest of the estate unverified every week.",
      "Opens or updates a single tracking issue naming every repo that drifted, with the failing checks quoted. One issue updated in place, never one per run — a new issue per run turns a standing problem into a backlog nobody reads.",
    ],
    phase1: "Active. GitHub only — Azure DevOps remote verification is outstanding, and an Azure entry in the register is reported as unsupported rather than skipped silently.",
    output:
      "A single tracking issue naming every repository that drifted, with its failing checks quoted — opened once and updated in place. A check that could not run appears as ?? and never fails a repository on its own: failing on the absence of evidence trains an operator to ignore the weekly issue, which costs more than the check is worth. No drift means no issue and no comment.",
    action: "Nothing, normally — it runs itself weekly. Use the only <owner/name> input to check one repository on demand, or run `redline verify --repo owner/name` yourself; neither needs a checkout of the target.",
  },
};
