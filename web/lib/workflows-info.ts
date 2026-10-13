// Per-workflow facts for the pages under /docs/workflows, read off the YAML in
// workflows/. Only redline-gate.yml reaches a product repository; the rest run in
// this source repository or in a separate redline-metrics repository, with their
// own secrets. Behaviour documented elsewhere is linked through `docs` rather than
// restated here, so the two cannot drift apart.
export type WorkflowInfo = {
  what: string;
  livesIn: string;
  trigger: string;
  // How it gets into the repository that runs it, and what that repository has
  // to provide before it will run.
  install: string;
  steps: string[];
  // What a run leaves behind: a status check, a commit, a deployed page, an issue.
  output: string;
  docs: { href: string; label: string };
};

export const WORKFLOWS_INFO: Record<string, WorkflowInfo> = {
  "redline-gate": {
    what: "The merge gate every onboarded GitHub repository runs on its pull requests: five jobs — PR checklist, ADR for large diffs, deterministic policy, dependency review and a diff secret scan — aggregated by a sixth into the one status a branch ruleset can require, redline-gate / gate.",
    livesIn: "With --gate-source org, the org's .github repository, referenced by every caller as <org>/.github/.github/workflows/redline-gate.yml@main. With --gate-source local, a copy redline init writes into the repository itself.",
    trigger: "workflow_call, from the caller .github/workflows/redline.yml that redline init installs, on every pull request.",
    install: "redline init writes the caller, and the local copy when you choose one. What each job checks, which failures a valid exemption can downgrade, and how the rung decides what blocks are on The merge gate.",
    steps: [],
    output: "One required status check, redline-gate / gate, with each job reporting beside it.",
    docs: { href: "/docs/gate", label: "The merge gate" },
  },
  "redline-sync": {
    what: "Lands the current standards on every registered repository as a pull request — never a push, never a merge.",
    livesIn: "This (source) repository.",
    trigger: "A push to main touching standards/**, cli/render/**, templates/** or .github/pull_request_template.md, and workflow_dispatch with dry-run and only <owner/name> inputs.",
    install: "Already here. It needs the REDLINE_SYNC_TOKEN secret, and it only targets repositories listed in registry.json.",
    steps: [
      "Runs scripts/render-self.mjs --check first, so stale artifacts are never distributed.",
      "Builds the CLI and runs node dist/bin/redline.js sync under REDLINE_SYNC_TOKEN, passing --dry-run and --repo <owner/name> when the dispatch inputs set them.",
    ],
    output: "At most one open pull request per registered repository that is behind, updated in place on the next run.",
    docs: { href: "/docs/distribution", label: "Distribution and drift" },
  },
  "redline-collect": {
    what: "Pulls review outcomes for merged pull requests across the org and commits them as monthly JSONL.",
    livesIn: "The redline-metrics repository — not this one.",
    trigger: "Daily at 05:00 UTC, and workflow_dispatch with a days input (default 8).",
    install: "Copy the file into redline-metrics as .github/workflows/redline-collect.yml and set the REDLINE_ORG_READ_TOKEN secret there.",
    steps: [
      "Runs npx --yes redlinegate@0.0.3 metrics collect --org <owner> --days <days> --out data, with REDLINE_ORG_READ_TOKEN as GH_TOKEN.",
      "If anything under data/ changed, commits it as \"data: telemetry through <date>\", rebasing before the push so a concurrent commit does not collide.",
    ],
    output: "A commit under data/ in redline-metrics, or nothing when no telemetry changed.",
    docs: { href: "/docs/cli/metrics", label: "redline metrics" },
  },
  "weekly-digest": {
    what: "Posts a Monday stakeholder digest to Teams as an Adaptive Card: open and stale PR counts, seed recall, a dashboard link.",
    livesIn: "The redline-metrics repository — not this one.",
    trigger: "Mondays at 07:00 UTC, and workflow_dispatch.",
    install: "Copy the file into redline-metrics and set REDLINE_ORG_READ_TOKEN and TEAMS_WEBHOOK_URL there, plus the REDLINE_DASHBOARD_URL variable for the link. The webhook is a Power Automate \"When a Teams webhook request is received\" flow.",
    steps: [
      "Counts open and stale (not updated for 7 days) non-draft org PRs through the GitHub search API.",
      "Runs npx --yes redlinegate@0.0.3 metrics digest with those counts, data/seed-scores.jsonl and the dashboard URL, writing digest.json.",
      "POSTs digest.json to TEAMS_WEBHOOK_URL. If the secret is unset the step fails rather than skipping delivery quietly.",
    ],
    output: "One card in Teams, and the payload attached to the run summary either way.",
    docs: { href: "/docs/cli/metrics", label: "redline metrics" },
  },
  inbox: {
    what: "Rebuilds the org-wide prioritised pull-request inbox and publishes it to GitHub Pages.",
    livesIn: "This (source) repository.",
    trigger: "Every 30 minutes, 06:00–19:00 UTC, Monday to Friday, and workflow_dispatch.",
    install: "Already here. Set the repository variable PAGES_VISIBILITY_ACKNOWLEDGED to private or internal after confirming the Pages site is not public, and provide REDLINE_ORG_READ_TOKEN.",
    steps: [
      "Refuses to build unless PAGES_VISIBILITY_ACKNOWLEDGED is private or internal: the page lists PR titles, authors and repository names.",
      "Runs npm ci and npm run build, then node dist/bin/redline.js metrics inbox --org <owner> --out dist — the build it is about to ship, not the last published package.",
      "Deploys dist/ to Pages; on failure opens or updates a tracking issue.",
    ],
    output: "A static page on GitHub Pages, or one tracking issue when the build or deploy fails.",
    docs: { href: "/docs/cli/metrics", label: "redline metrics" },
  },
  dashboard: {
    what: "Rebuilds the telemetry dashboard from collected data and publishes it to GitHub Pages.",
    livesIn: "The redline-metrics repository — not this one.",
    trigger: "Daily at 05:30 UTC, workflow_dispatch, and whenever Redline Collect or Redline Seed Canary completes.",
    install: "Copy the file into redline-metrics, set REDLINE_ORG_READ_TOKEN and acknowledge Pages visibility there. REDLINE_SOURCE (default <owner>/redline) says where to read registry.json from.",
    steps: [
      "The same Pages-visibility refusal as the inbox.",
      "Reads registry.json from the source repository. If the read fails, coverage and the enforcement ladder are left off the page rather than shown as zero.",
      "Runs npx --yes redlinegate@0.0.3 metrics dashboard --data data --days 90 --out dist --registry registry.json, deploys dist/ to Pages, and opens or updates a tracking issue on failure.",
    ],
    output: "A static dashboard on GitHub Pages.",
    docs: { href: "/docs/telemetry", label: "Telemetry & validation" },
  },
  "seed-canary": {
    what: "The regression test for the reviewer itself: a throwaway pull request of known-bad code on a canary repository, scored once the reviewer goes quiet, then closed. It is what tells \"nothing to find\" apart from \"stopped finding things\".",
    livesIn: "The redline-metrics repository — not this one.",
    trigger: "Mondays at 03:00 UTC, and workflow_dispatch with a targets override.",
    install: "Copy the file into redline-metrics and set CANARY_TARGETS (a JSON array of {repo, stack}), REDLINE_CANARY_TOKEN scoped to the canary repositories only, and REDLINE_ORG_READ_TOKEN to check out the seeded corpus from the source repository.",
    steps: [
      "plan — reads the targets from CANARY_TARGETS or the dispatch override.",
      "score, once per target — pushes seeded/<stack> and seeded/clean to a new branch, opens a pull request labelled redline-exempt, waits until the review comments stop arriving (up to 40 minutes), runs npx --yes redlinegate@0.0.3 metrics score-seeds against it, then closes the pull request and deletes the branch, also when an earlier step failed.",
      "record — appends every score to data/seed-scores.jsonl, commits it, and fails the run if any target's BLOCKER recall is below 1.0 or the clean corpus drew a comment.",
    ],
    output: "A commit to data/seed-scores.jsonl, and a failed run on a regression.",
    docs: { href: "/docs/seeds", label: "Seeded corpus" },
  },
  "verify-onboarding": {
    what: "Re-verifies every registered repository each week and keeps one tracking issue listing the ones that drifted.",
    livesIn: "This (source) repository.",
    trigger: "Tuesdays at 06:00 UTC, and workflow_dispatch with an only <owner/name> input.",
    install: "Already here. It runs under REDLINE_ORG_READ_TOKEN and verifies the repositories in registry.json, so an empty register produces nothing.",
    steps: [
      "Builds the CLI and runs node dist/bin/redline.js verify --repo for each repository in the register, carrying on past a failure so one drifted repository does not hide the rest.",
      "Opens one tracking issue naming every repository that drifted, with its failing checks quoted — or, if that issue is already open, comments on it instead of opening another.",
    ],
    output: "One tracking issue, or nothing when no repository drifted.",
    docs: { href: "/docs/distribution", label: "Distribution and drift" },
  },
};
