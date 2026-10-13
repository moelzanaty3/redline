// Per-file facts for the pages under /docs/templates. "Installed by" says whether
// redline init writes the file or a human has to act — several of these are
// reference shapes nothing applies automatically, and that is stated plainly
// rather than implied by omission.
export type TemplateInfo = {
  what: string;
  installedAs: string | null;
  installedBy: string;
  detail: string[];
  // Where the real source lives. For a generated artifact that is code, not
  // this file, and editing the checked-in copy changes nothing.
  editWhere: string;
};

export const TEMPLATES_INFO: Record<string, TemplateInfo> = {
  "repo-context": {
    what: "The team-owned top half of AGENTS.md: product, architecture, conventions, and the deliberate deviations from Redline. Review quality is bounded by context — a reviewer that does not know FlashList is the standard here cannot flag FlatList.",
    installedAs: "The top of AGENTS.md, above the <!-- REDLINE:BEGIN --> marker.",
    installedBy: "A human, once. redline init never writes this file.",
    detail: [
      "redline init only writes between the REDLINE:BEGIN and REDLINE:END markers in AGENTS.md. Everything above belongs to the team and survives every re-render.",
      "Fill in the bracketed sections: app shell, state management, styling, the directory map, team conventions, and each deliberate deviation from Redline with its reason.",
      "Keep the deviations list short. If it keeps growing, the standard is wrong for this repository — raise it against standards/ instead.",
    ],
    editWhere: "The target repository's AGENTS.md, above the marker.",
  },
  codeowners: {
    what: "Code-owner rules for the files that decide what the gate checks and how strictly. Without them the ruleset's require_code_owner_review protects nothing, and a contributor can weaken their own gate — or the rules their pull request is reviewed against — in a self-approved pull request.",
    installedAs: ".github/CODEOWNERS",
    installedBy: "redline init --with review-ownership, and only where the repository has no CODEOWNERS in any of the three places GitHub looks. It is off by default because the owner it writes may not exist: GitHub ignores an owner it cannot resolve, so a wrong team name enforces nothing while reporting as installed. Pass --review-owners with the real team or user.",
    detail: [
      "The CLI does not read this file. It generates the content from SENSITIVE_PATHS in cli/commands/init.ts — .github/workflows/, CODEOWNERS itself, the rendered standards (copilot-instructions, instructions/, AGENTS.md, CLAUDE.md), dependabot.yml, infra/, terraform/ and Dockerfile — owned by @<org>/platform-engineering unless --review-owners says otherwise.",
      "The one line this template has that the generated file does not is the * default owner. The CLI cannot know a repository's owning team, and naming the platform team there would make it a required reviewer on every file.",
    ],
    editWhere: "SENSITIVE_PATHS in cli/commands/init.ts. Editing this template changes nothing redline init writes.",
  },
  "redline-caller": {
    what: "The only gate file an onboarded GitHub repository owns: a thin workflow that calls the reusable gate on every pull request with this repository's settings.",
    installedAs: ".github/workflows/redline.yml",
    installedBy: "redline init, from this file with <org>, the ADR threshold, the dependency-severity floor, the soft-fail labels, the rung and the stand-down list filled in. With --gate-source local it points at the vendored ./.github/workflows/redline-gate.yml instead of <org>/.github.",
    detail: [
      "Runs on pull_request: opened, synchronize, reopened, edited, labeled, unlabeled and ready_for_review — edited and the label events matter because the checklist and exemptions are read from the body and labels.",
      "The job id is redline-gate, and it is load-bearing: the required check redline-gate / gate is this job id plus the gate's aggregate job id. Renaming either makes the required check unreportable and blocks every pull request. scripts/validate.mjs fails CI if this template's job id changes.",
    ],
    editWhere: "This template. redline init re-renders it, so hand edits in an onboarded repository are overwritten on the next init or sync.",
  },
  "pr-template": {
    what: "The GitHub pull request template: a Change type pick-list, which nothing checks, and a Launch readiness checklist, which the gate's checklist job does.",
    installedAs: ".github/pull_request_template.md",
    installedBy: "redline init — written whole when the repository has no template GitHub would serve, merged into the existing one otherwise.",
    detail: [
      "redline init looks in .github/, the repository root, then docs/ — GitHub's own order. With none found it writes this file whole, gated sections already inside REDLINE:BEGIN/END markers.",
      "With one found, the existing template is kept byte for byte and only the gated sections it lacks (## Launch readiness, ## Architecture decision) are appended inside the markers. A re-run regenerates only that span.",
      "The gate's checklist job fails if any box under ## Launch readiness is unticked, and fails outright if the heading is missing, so a deleted section cannot pass as a completed one.",
      "A box that genuinely does not apply is waived with a ## Redline exemption block — reason, scope and expiry — plus the redline-exempt label, not with the label alone.",
    ],
    editWhere: "templates/github/pull_request_template.md. A repository's own text outside the markers survives re-runs.",
  },
  "azure-pr-template": {
    what: "The same Launch readiness checklist for Azure DevOps.",
    installedAs: ".azuredevops/pull_request_template.md",
    installedBy: "redline init — written whole when the repository has no template Azure would serve, merged into the existing one otherwise.",
    detail: [
      "redline init looks in .azuredevops/, .vsts/, docs/ and the repository root (case-insensitively), and in any branch-specific template under pull_request_template/branches/, which Azure serves in preference to the default.",
      "Merging works as on GitHub: the gated sections are appended inside REDLINE:BEGIN/END markers and the rest of the file is left alone.",
      "Nothing on Azure parses the checklist. The Azure gate has no checklist job, so ticking the boxes is the reviewer's discipline rather than something the pipeline enforces.",
    ],
    editWhere: "templates/azure/pull_request_template.md, with the same marker merge as the GitHub template.",
  },
  "azure-gate-template": {
    what: "The Azure Pipelines gate for an Azure Repos repository: a diff secret scan, redline verify --gate, and a final step that publishes the redline/gate pull-request status the branch policy requires.",
    installedAs: ".azuredevops/redline-gate.yml",
    installedBy: "redline init on an Azure DevOps repository, with the ADR threshold, dependency-severity floor, soft-fail labels and stand-down list filled in.",
    detail: [
      "The file alone runs nothing: Azure Repos ignores YAML pr: triggers. redline init also registers a redline-gate build definition and a \"Redline: gate build\" Build Validation policy that queues it on every pull request. Without Build Administrator rights that registration is recorded as pending and the status policy is written advisory, since nothing could publish the status it would require.",
      "Secret scan (diff) runs trufflehog, pinned by image digest, over the pull request's range with --results=verified. A failure there cannot be waived by any label.",
      "Redline gate installs redlinegate into a directory of its own with npm install --prefix and runs redline verify --gate from there — not npx, and not from the pull request's own node_modules. The template says redlinegate@latest; redline init replaces that with the version that wrote the file, so a CLI upgrade arrives as a reviewable sync pull request.",
      "Publish redline/gate status always runs and posts genre redline, name gate. Renaming either makes the branch policy unsatisfiable and blocks every pull request. A soft-fail label turns a non-secret failure into a succeeded status; unlike GitHub, no exemption block is checked.",
      "What it does not have, compared with GitHub's gate: no dependency-review job, no checklist job, no ADR job and no deterministic policy job.",
    ],
    editWhere: "platforms/azure/gate-template.yml. A GitHub-hosted repository built by Azure Pipelines gets platforms/azure/gate-template-github.yml instead.",
  },
  "repo-ruleset": {
    what: "The shape of the per-repository branch ruleset: one approval, resolved threads, and the required redline-gate / gate check.",
    installedAs: null,
    installedBy: "Nothing installs it. redline init builds the equivalent ruleset at runtime in applyPolicy (cli/platforms/github/install.ts) and never reads this file.",
    detail: [
      "It shows the blocking shape, which always includes required_status_checks. A newly onboarded repository starts advisory, where applyPolicy leaves that rule out — so the live ruleset differs from this file on exactly that rule until the repository is promoted.",
      "scripts/validate.mjs reads it only to check it still requires redline-gate / gate.",
      "Importing it by hand would make the gate blocking immediately, skipping the advisory start.",
    ],
    editWhere: "applyPolicy in cli/platforms/github/install.ts. Editing this JSON changes no behaviour.",
  },
  "org-ruleset": {
    what: "The same ruleset shape at organisation level, targeting every repository whose custom property redline equals onboarded.",
    installedAs: null,
    installedBy: "An organisation administrator, by hand, once — Settings → Rulesets → Import. No code in this repository uploads it.",
    detail: [
      "redline init sets redline=onboarded on every repository it onboards (the repo-property capability), which is exactly what this file's condition matches. Imported once, it covers each repository as it is onboarded.",
      "scripts/validate.mjs reads it only to check it still requires redline-gate / gate.",
    ],
    editWhere: "This file, then re-import it. The property is set in cli/platforms/github/install.ts.",
  },
};
