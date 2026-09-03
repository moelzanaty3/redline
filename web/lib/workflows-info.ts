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
  steps: string[];
  phase1: string;
  action: string;
};

export const WORKFLOWS_INFO: Record<string, WorkflowInfo> = {
  "redline-gate": {
    what: "The reusable merge-readiness gate every onboarded GitHub repo requires to merge. Four checks aggregated into one required status.",
    disabled: false,
    livesIn: "The org .github repo, at .github/workflows/redline-gate.yml — copied there once by hand (see Installation). Every onboarded repo's caller workflow (templates/redline.yml) references it by org path as <org>/.github/.github/workflows/redline-gate.yml@main.",
    trigger: "workflow_call, invoked by the calling repo's Redline workflow on every pull request.",
    steps: [
      "checklist (\"PR checklist\") — passes only if the PR body has a ## Launch readiness section with every box ticked. Fails loudly, not silently, if the heading is missing entirely.",
      "adr (\"ADR required for significant changes\") — passes if changed lines are at or below adr-diff-threshold (default 300), or the PR body links docs/adr/, or the no-adr label is applied.",
      "dependency-review — actions/dependency-review-action@v4; fails at or above fail-on-dependency-severity (default high).",
      "secrets (\"Secret scan (diff)\") — trufflehog, pinned to a commit SHA, scanning only the PR's diff range with --results=verified --fail; fails on any verified secret.",
      "gate (aggregate, name: gate) — needs all four. dependency-review and secrets are hard-fail and never label-exemptible. checklist and adr are soft-fail: the redline-exempt or redline-sync label downgrades a failure there to a warning. The branch ruleset requires the check context redline-gate / gate — the caller job id plus this aggregate job's id.",
    ],
    phase1: "Active — this is what redline init wires up on GitHub today.",
    action: "Nothing directly — it's called by the caller workflow your repo already has. If it fails, see The merge gate for what each check expects and how to satisfy or exempt it.",
  },
  "redline-sync": {
    what: "Would distribute standards, the gate caller and the PR template to already-onboarded repos as pull requests. The register it read its targets from, sync-targets.txt, is deleted — Phase 3 has to reintroduce one that redline init actually writes.",
    disabled: true,
    livesIn: "This (source) repo.",
    trigger: "push to main touching standards/**, templates/**, etc., or workflow_dispatch (dry-run, only <repo>) — but the sync job carries if: false, so neither trigger runs it.",
    steps: [
      "Would verify this repo's own rendered artifacts are current (scripts/render-self.mjs --check).",
      "Would open sync pull requests on every target repo by running bash scripts/sync.sh — but scripts/sync.sh was deleted this release with no replacement, so even removing if: false would not make this job run; the script it calls no longer exists.",
    ],
    phase1: "Disabled (if: false). redline sync is a control-plane command that ships in Phase 3, alongside telemetry. Until then, an already-onboarded repo picks up a standards change only by re-running redline init by hand.",
    action: "Nothing to run. If you're re-enabling this in Phase 3, scripts/sync.sh needs rewriting first — the workflow's shape is left in place for that, not the script.",
  },
  "redline-collect": {
    what: "Pulls review outcomes for merged PRs across the org and commits them as monthly JSONL, via scripts/collect-telemetry.mjs.",
    disabled: false,
    livesIn: "The redline-metrics repo — not this one.",
    trigger: "Daily at 05:00 UTC, plus workflow_dispatch with a days input (default 8).",
    steps: [
      "Runs scripts/collect-telemetry.mjs with GH_TOKEN, ORG and DAYS from the environment.",
      "Commits any changed files under data/ as \"data: telemetry through <date>\", rebasing against the branch before pushing so a concurrent digest commit doesn't collide.",
    ],
    phase1: "Works, but only where installed: needs REDLINE_ORG_READ_TOKEN configured on the redline-metrics repo. It is org infrastructure for telemetry, not something a product repo runs.",
    action: "Nothing, normally — it runs itself nightly. Trigger it by hand with workflow_dispatch to backfill a gap after an outage.",
  },
  "weekly-digest": {
    what: "Posts a Monday-morning stakeholder digest (open/stale PR counts, seed recall, dashboard link) to Teams as an Adaptive Card, via scripts/build-digest.mjs.",
    disabled: false,
    livesIn: "The redline-metrics repo — not this one.",
    trigger: "Every Monday at 07:00 UTC, plus workflow_dispatch.",
    steps: [
      "Counts open and stale (>7 days untouched) org PRs via the GitHub search API.",
      "Builds the Adaptive Card with scripts/build-digest.mjs --out digest.json.",
      "POSTs it to TEAMS_WEBHOOK_URL — a Power Automate \"When a Teams webhook request is received\" flow; the old Office 365 connector shape no longer delivers. Fails the step outright if the webhook secret isn't set.",
    ],
    phase1: "Works, but only where installed: needs REDLINE_ORG_READ_TOKEN and TEAMS_WEBHOOK_URL. Delivers an empty-looking digest on a repo with no collected telemetry yet.",
    action: "Nothing, normally — it runs itself every Monday. Run scripts/build-digest.mjs locally to preview digest.json before changing what the card reports.",
  },
  inbox: {
    what: "Rebuilds the org-wide prioritised PR inbox and publishes it to GitHub Pages, via scripts/build-inbox.mjs.",
    disabled: false,
    livesIn: "This (source) repo.",
    trigger: "Every 30 minutes, 06:00-19:00 UTC, Monday-Friday, plus workflow_dispatch.",
    steps: [
      "Refuses to build unless the repository variable PAGES_VISIBILITY_ACKNOWLEDGED is set to private or internal — the page lists PR titles, authors and repo names, and a public Pages site would leak them.",
      "Builds dist/index.html with scripts/build-inbox.mjs.",
      "Deploys to GitHub Pages, then opens or updates a tracking issue if the build or deploy failed.",
    ],
    phase1: "Works, once Pages visibility is acknowledged and REDLINE_ORG_READ_TOKEN is set.",
    action: "Nothing, normally — it runs itself. Run scripts/build-inbox.mjs locally with a scoped GH_TOKEN to preview a layout change before it ships.",
  },
  dashboard: {
    what: "Rebuilds the telemetry dashboard and publishes it to GitHub Pages, via scripts/build-dashboard.mjs.",
    disabled: false,
    livesIn: "The redline-metrics repo — not this one.",
    trigger: "Daily at 05:30 UTC, plus workflow_dispatch, plus automatically once Redline Collect or Redline Seed Canary finishes.",
    steps: [
      "Same Pages-visibility gate as the inbox.",
      "Would count onboarded repos by reading sync-targets.txt from the source repo, for a coverage figure — that file is deleted, so this read always fails.",
      "Builds dist/index.html with scripts/build-dashboard.mjs, then deploys, then opens or updates a tracking issue on failure.",
    ],
    phase1: "Works, but only where installed: same Pages-visibility gate as the inbox, plus REDLINE_ORG_READ_TOKEN and collected telemetry to summarise. The coverage figure is omitted entirely: sync-targets.txt was the register it counted, scripts/setup-repo.sh used to append to it on each onboarding, redline init never did, and the file is now deleted — so the guarded read fails and the dashboard warns instead of publishing a number.",
    action: "Nothing, normally — it runs itself daily. Run scripts/build-dashboard.mjs locally against a copy of data/ to preview a metric or chart change.",
  },
  "seed-canary": {
    what: "The regression test for the review layer itself: opens a throwaway PR of known-bad code against a canary repo, waits for the automated reviewer, scores it, records the result, and closes the PR. Distinguishes \"nothing to find\" from \"stopped finding things\", which ordinary telemetry can't.",
    disabled: false,
    livesIn: "The redline-metrics repo — not this one.",
    trigger: "Weekly, Monday 03:00 UTC, plus workflow_dispatch with a targets override.",
    steps: [
      "plan — reads the CANARY_TARGETS repo variable (or a dispatch override), a JSON array of {repo, stack}.",
      "score (matrix, one run per target) — opens a branch on the target repo carrying seeded/<stack> and seeded/clean, labelled redline-exempt so the readiness gate doesn't block a PR nobody will merge; waits for review comments to stop arriving (two stable polls, up to 40 minutes); scores with scripts/score-seeds.mjs --json; always closes and deletes the PR/branch afterward, even on failure.",
      "record — appends every score to data/seed-scores.jsonl and fails the run if any target's BLOCKER recall is below 1.0 or produced a false positive on the clean corpus.",
    ],
    phase1: "Works, but only where installed: needs CANARY_TARGETS, REDLINE_CANARY_TOKEN scoped to the canary repos only, and REDLINE_ORG_READ_TOKEN to check out this repo's seeded corpus.",
    action: "Nothing, normally — it runs itself weekly. Trigger it by hand with workflow_dispatch and a targets override when validating a new AI reviewer vendor or a standards change.",
  },
  "verify-onboarding": {
    what: "Would re-verify every onboarded repo on a schedule and open an issue on drift — a ruleset edited by hand, a renamed caller job, push protection turned off.",
    disabled: true,
    livesIn: "This (source) repo.",
    trigger: "Weekly, Tuesday 06:00 UTC, plus workflow_dispatch with a single-repo override — but the verify job carries if: false, so neither trigger runs it.",
    steps: [
      "Would loop over sync-targets.txt (or one --repo override) calling bash scripts/setup-repo.sh <repo> --verify — but both sync-targets.txt and scripts/setup-repo.sh are deleted, so even removing if: false would not make this job run.",
      "Would open or update a single tracking issue naming every repo that failed verification.",
    ],
    phase1: "Disabled (if: false). redline verify reads .redline.json from a local checkout of the target repo; it has no --repo owner/name mode that works over the API alone. A scheduled cross-repo verify needs a clone-then-verify loop, which is control-plane work alongside redline sync in Phase 3.",
    action: "Nothing to run. Verify a single repo yourself instead: npx redline-cli verify from a checkout of it.",
  },
};
