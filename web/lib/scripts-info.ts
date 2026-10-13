// Who runs each script in scripts/, read off package.json and the workflow files
// rather than the scripts' own header comments, which describe intent. Every
// script with a CLI front door is documented on that command's page; this module
// only says that the door exists.
export type ScriptGroup = "source" | "measurement" | "local";

export type ScriptInfo = {
  group: ScriptGroup;
  runBy: string;
  // The command a maintainer types, exactly as package.json or CI spells it.
  command?: string;
  when?: string;
  cli?: { command: string; href: string };
};

export const SCRIPTS_INFO: Record<string, ScriptInfo> = {
  validate: {
    group: "source",
    runBy: "CI on every pull request and push to main (ci.yml), and release.yml before a publish.",
    command: "node scripts/validate.mjs",
    when: "Before pushing any change to standards/, manifest.json, rulesets/, workflows/ or seeded/. It prints each failure as FAIL: and each warning as warn: on stderr, then a count, and exits 1 on any failure.",
  },
  "assign-rule-ids": {
    group: "source",
    runBy: "You, after adding a rule. CI and release.yml run it with --check, which fails instead of writing.",
    command: "node scripts/assign-rule-ids.mjs",
    when: "After adding a rule bullet to a file in standards/. It writes the new id into the markdown; commit it with the rule. Never write an id by hand, and never change one.",
  },
  "render-self": {
    group: "source",
    runBy: "You, after editing standards/. CI, release.yml and redline-sync.yml run it with --check, which fails if the checked-in output is stale.",
    command: "node scripts/render-self.mjs",
    when: "After any change to standards/ or cli/render/. It imports the CLI's TypeScript renderer directly, so it needs a Node that runs .ts files (CI uses Node 24) but no build.",
  },
  "check-pins": {
    group: "source",
    runBy: "CI's pins job on every pull request and push to main, allowed to fail because it needs the network.",
    command: "node scripts/check-pins.mjs",
    when: "After adding or bumping a pinned action, a Docker image digest or the gate's REDLINE_CLI_VERSION. The gate asks for redlinegate@latest on purpose, and the check accepts it. Set GH_TOKEN to avoid the GitHub API rate limit. Add --strict to fail on available updates as well as on mismatches.",
  },
  "score-seeds": {
    group: "measurement",
    runBy: "seed-canary.yml, weekly, in redline-metrics.",
    cli: { command: "redline metrics score-seeds", href: "/docs/cli/metrics" },
  },
  "collect-telemetry": {
    group: "measurement",
    runBy: "redline-collect.yml, daily, in redline-metrics.",
    cli: { command: "redline metrics collect", href: "/docs/cli/metrics" },
  },
  "build-digest": {
    group: "measurement",
    runBy: "weekly-digest.yml, Mondays, in redline-metrics.",
    cli: { command: "redline metrics digest", href: "/docs/cli/metrics" },
  },
  "build-inbox": {
    group: "measurement",
    runBy: "inbox.yml, every 30 minutes on weekdays, in this repository.",
    cli: { command: "redline metrics inbox", href: "/docs/cli/metrics" },
  },
  "build-dashboard": {
    group: "measurement",
    runBy: "dashboard.yml, daily and after each collect or canary run, in redline-metrics.",
    cli: { command: "redline metrics dashboard", href: "/docs/cli/metrics" },
  },
  "build-registry": {
    group: "measurement",
    runBy: ".github/workflows/registry.yml, nightly, in this repository.",
    cli: { command: "redline registry", href: "/docs/cli/registry" },
  },
  "build-correlation": {
    group: "measurement",
    runBy: "A human, by hand. No workflow runs it.",
    cli: { command: "redline metrics correlate", href: "/docs/cli/metrics" },
  },
  "build-roi": {
    group: "measurement",
    runBy: "A human, by hand, with the spend figure. No workflow runs it.",
    cli: { command: "redline metrics roi", href: "/docs/cli/metrics" },
  },
  "build-baseline": {
    group: "measurement",
    runBy: "The owner, once, with org credentials. No workflow runs it.",
    cli: { command: "redline metrics baseline", href: "/docs/cli/metrics" },
  },
  "fetch-stars": {
    group: "local",
    runBy: "A maintainer, by hand, with an authenticated gh. The site build never calls the network.",
    command: "npm run stars",
  },
  "publish-local": {
    group: "local",
    runBy: "A maintainer, by hand, to try the working tree as the installed redline.",
    command: "npm run publish:local",
  },
};
