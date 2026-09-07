// Maintainer-facing detail for each per-repo template and ruleset. "Installed by" says
// whether redline init writes the file itself or a human has to act — several of these
// are reference shapes that nothing in this codebase applies automatically, and that is
// stated plainly rather than implied by omission.
export type TemplateInfo = {
  what: string;
  installedAs: string | null;
  installedBy: string;
  detail: string[];
  // What ends up in the repository, and what enforces it. Several of these are
  // reference shapes that produce nothing at all — saying so beats leaving the
  // reader to infer that editing one has an effect.
  output: string;
  // Where the real source lives. For a generated artifact that is code, not
  // this file, and editing the checked-in copy changes nothing.
  editWhere: string;
  action: string;
};

export const TEMPLATES_INFO: Record<string, TemplateInfo> = {
  "repo-context": {
    what: "Per-repo context template — product, architecture, conventions, deliberate deviations from Redline. Review quality is bounded by context: a reviewer that doesn't know FlashList is the standard can't flag FlatList.",
    installedAs: "The top of AGENTS.md, above the <!-- REDLINE:BEGIN --> marker.",
    installedBy: "A human, once, by hand. redline init never writes this file.",
    detail: [
      "redline init only ever writes below the <!-- REDLINE:BEGIN --> marker in AGENTS.md — everything above it belongs to the repo's own team and is never touched by a re-render.",
      "Copy this template's content to the top of the target repo's AGENTS.md and fill in the bracketed sections: app shell, state management, styling, the directory map, team conventions, and a running list of deliberate deviations from Redline with the reason for each.",
      "The marker text itself is frozen deliberately — cli/render/markers.ts still names a script (scripts/render.mjs) this release deleted, and that string cannot change: changing it would make every already-onboarded repo append a second block instead of replacing its first.",
    ],
    output:
      "Whatever a human writes into the top of AGENTS.md. Nothing validates it and nothing renders it — it is context the reviewer reads, and its only measurable effect is on review quality: a reviewer that does not know FlashList is the standard here cannot flag FlatList.",
    editWhere:
      "Edit the target repository's AGENTS.md directly, above the <!-- REDLINE:BEGIN --> marker. Everything above that marker belongs to the repo's team and survives every re-render; everything below it is regenerated.",
    action: "Keep the deviations list short. If it grows past a few entries, that's a signal the standard itself is wrong for this repo — raise it in the Redline source repo instead of accumulating exceptions here.",
  },
  codeowners: {
    what: "The CODEOWNERS pattern that protects the enforcement surface: the paths that control what the gate checks and how strictly.",
    installedAs: ".github/CODEOWNERS",
    installedBy: "redline init --with review-ownership, and only on a repo that has none yet — an existing CODEOWNERS, in any of the three locations GitHub recognises, is left untouched. It is off by default: the generated file names an owner Redline cannot prove exists, and a ruleset requiring code-owner review with an unresolvable owner blocks every pull request in the repository. Ask for it once you know the team or user in it is real.",
    detail: [
      "\"Protects the enforcement surface\" means: without a code-owner rule on the files that define the gate, the branch ruleset's require_code_owner_review is a silent no-op, and any contributor could edit .github/workflows/, CODEOWNERS itself, or the rendered standards files in a self-approved PR — quietly weakening their own review, undetected.",
      "The CLI does not read this checked-in template file at install time — it generates .github/CODEOWNERS content in code, from a hardcoded rule list in cli/commands/init.ts, always owned by @platform-engineering with no placeholder to fill in.",
      "This template file covers a broader set of paths than the generated version does (it also lists .github/copilot-instructions.md, AGENTS.md, CLAUDE.md, infra/, terraform/, Dockerfile) — treat it as a fuller reference pattern, not a preview of exactly what a fresh redline init writes.",
    ],
    output:
      ".github/CODEOWNERS in the onboarded repository, listing the paths that define the gate, owned by @platform-engineering. Combined with the ruleset's require_code_owner_review it is what stops a contributor from weakening their own gate in a self-approved pull request. Without it that ruleset setting is a silent no-op.",
    editWhere:
      "cli/commands/init.ts — the SENSITIVE_PATHS list. The CLI generates this content in code and never opens the checked-in template, so editing the file you see here changes nothing about what redline init writes.",
    action: "If you widen what redline init actually generates, edit the SENSITIVE_PATHS list in cli/commands/init.ts — editing this file changes nothing about the CLI's output.",
  },
  "redline-caller": {
    what: "The thin per-repo caller workflow — the only workflow file an onboarded repo owns for the gate. Everything else lives centrally in the org .github repo.",
    installedAs: ".github/workflows/redline.yml",
    installedBy: "redline init, verbatim — this exact file, with the org name and the gate's ADR threshold, dependency-severity floor and soft-fail labels filled in.",
    detail: [
      "Triggers on pull_request (opened, synchronize, reopened, edited, labeled, unlabeled, ready_for_review) and calls the reusable workflow by org path: <org>/.github/.github/workflows/redline-gate.yml@main.",
      "The job id is literally redline-gate. Do not rename it: the branch ruleset requires the check context redline-gate / gate, derived from this job id plus the aggregate gate job id inside the reusable workflow — renaming either half makes the required check unreportable and silently blocks every PR in the repo.",
    ],
    output:
      ".github/workflows/redline.yml in the onboarded repository, and through it the redline-gate / gate status check on every pull request. It produces no output of its own — it exists to call the org's reusable gate with this repository's thresholds.",
    editWhere:
      "This template file, which redline init installs verbatim. The job id redline-gate is load-bearing: the required check context derives from it, so renaming it makes the check unreportable and blocks every pull request in the repository.",
    action: "Leave it alone once installed. If the org's reusable gate location ever moves, every repo's copy of this file needs the org path updated — there's no sync mechanism for that yet (see redline-sync.yml).",
  },
  "pr-template": {
    what: "The GitHub pull request template: a Change type pick-list (ungated) and a Launch readiness checklist (gated).",
    installedAs: ".github/pull_request_template.md",
    installedBy: "redline init — written whole only when the repository has no template the host would serve.",
    detail: [
      "redline init searches .github/, the repository root, then docs/ (GitHub's own precedence order) for an existing pull_request_template.md before writing one. Where it finds none, it writes the packaged template whole, gated sections already inside REDLINE:BEGIN/END markers.",
      "Where a template already exists, it is kept byte for byte and only the gated sections (## Launch readiness, ## Architecture decision) are appended inside REDLINE:BEGIN/END markers — a section the template already provides on its own is left untouched rather than duplicated. On a re-run, only that marked span is regenerated.",
      "The redline-gate.yml checklist job parses the PR body specifically for a ## Launch readiness heading, then fails if any box under it is unticked.",
      "Deleting the heading — not just leaving boxes unticked — fails the gate outright and loudly, by design: a missing section can't be mistaken for a completed one.",
      "The Architecture decision and Automated review sections are informational; only Launch readiness is enforced by the gate.",
    ],
    output:
      ".github/pull_request_template.md, and through it the gate's checklist job: it parses the PR body for a ## Launch readiness heading and fails if any box under it is unticked. Deleting the heading fails the gate loudly rather than passing — a missing section cannot be mistaken for a completed one.",
    editWhere:
      "This template file. Only the span inside the REDLINE:BEGIN/END markers is regenerated on a re-run, so a repository's own additions outside it survive.",
    action: "Tick every box honestly, or delete a line that genuinely doesn't apply and say why in the Summary. If the gate is stuck on a process item you can't satisfy, apply the redline-exempt label and explain in a comment — that downgrades checklist and ADR to warnings, never dependency review or the secret scan.",
  },
  "azure-pr-template": {
    what: "The Azure DevOps equivalent pull request template — the same Launch readiness checklist, worded for Azure's exemption flow instead of GitHub's.",
    installedAs: ".azuredevops/pull_request_template.md",
    installedBy: "redline init — written whole only when the repository has no template the host would serve; merged into an existing one otherwise.",
    detail: [
      "redline init searches .azuredevops/, .vsts/, docs/, then the repository root (all four, matched case-insensitively) for an existing template, plus any branch-specific template under pull_request_template/branches/ — Azure serves those in preference to the default, so one added after onboarding is merged into as well.",
      "Same merge behaviour as GitHub: written whole with no template present, otherwise the gated sections are appended inside REDLINE:BEGIN/END markers and the rest of the file is kept untouched.",
      "Same gated Launch readiness section and the same seven checklist items as the GitHub template.",
      "Because Azure's entire gate is one step (redline verify --gate), there is no separate checklist job parsing this file the way GitHub's redline-gate.yml does — the checklist is process discipline for the team, not something the Azure pipeline itself enforces item by item.",
    ],
    output:
      ".azuredevops/pull_request_template.md. Unlike GitHub, nothing parses it: Azure's whole gate is one redline verify --gate step, so the checklist is process discipline for the reviewer rather than something the pipeline enforces item by item.",
    editWhere:
      "This template file, with the same marker-merge behaviour as the GitHub one.",
    action: "Tick every box honestly. Unlike GitHub, an unticked box here isn't independently gate-checked on Azure — the discipline is on the reviewer.",
  },
  "azure-gate-template": {
    what: "The Azure Pipelines gate. One step runs the CLI's own verify command; a second publishes the pull-request status the branch policy requires.",
    installedAs: ".azuredevops/redline-gate.yml",
    installedBy: "redline init, with the ADR threshold, dependency-severity floor and soft-fail labels filled in, on an Azure DevOps repository.",
    detail: [
      "This file alone runs nothing — Azure Repos ignores its pr: trigger. redline init also registers a redline-gate build definition pointing at it and a \"Redline: gate build\" Build Validation branch policy that queues that pipeline on every pull request; without Build Administrator rights that registration degrades to a pending gate capability and the redline/gate status policy is written advisory, since no pipeline could publish the status it would require.",
      "Step \"Redline gate\" runs npx --yes --package=redlinegate@latest redline verify --gate.",
      "Step \"Publish redline/gate status\" always runs (condition: always()) and publishes a PR status with genre redline and name gate — the branch policy requires exactly redline/gate. Renaming either value makes the policy unsatisfiable and every PR in the repo sits blocked.",
      "Materially weaker than the GitHub gate: redline verify --gate runs none of GitHub's four checks. An Azure repository gets no dependency-review job and no diff secret scan at the gate — the two checks that are hard-fail and never label-exemptible on GitHub. checklist and adr, the two that are soft-fail there, are the lesser loss.",
    ],
    output:
      ".azuredevops/redline-gate.yml, and a pull-request status published with genre redline and name gate — exactly what the branch policy requires. Renaming either value makes the policy unsatisfiable and leaves every pull request in the repository blocked. The status publishes on condition: always(), so a failed verify still reports rather than leaving the policy pending forever.",
    editWhere:
      "This template file. Note what it cannot produce: redline verify --gate runs none of GitHub's dependency review or diff secret scan, so those two hard-fail checks have no Azure equivalent here.",
    action: "Nothing directly — it runs on every PR once installed. If your org needs dependency and secret scanning parity with GitHub, that has to come from elsewhere in the Azure DevOps pipeline; this template does not provide it.",
  },
  "repo-ruleset": {
    what: "A reference document of the per-repo branch ruleset shape — one human approval, thread resolution, the required redline-gate / gate check.",
    installedAs: null,
    installedBy: "Nothing. No code in this repository reads or applies this JSON file.",
    detail: [
      "redline init's applyPolicy (cli/platforms/github/install.ts) builds the equivalent ruleset payload at runtime instead, from the repo's chosen merge-policy options — it never reads this file off disk.",
      "This file shows the shape when the gate is promoted to blocking: it always includes the required_status_checks rule. A freshly onboarded repo defaults to advisory, where applyPolicy omits that rule entirely — so the live ruleset and this file diverge on exactly that one rule until --blocking is passed.",
    ],
    output:
      "Nothing. No code in this repository reads or applies this file. The live ruleset is built at runtime by applyPolicy from the repository's chosen merge-policy options, and on a freshly onboarded repo it omits the required_status_checks rule entirely — advisory by default — which is exactly where it diverges from the shape shown here.",
    editWhere:
      "cli/platforms/github/install.ts, in applyPolicy. Editing this JSON changes no behaviour anywhere.",
    action: "Use it to see the target shape, not to hand-apply it — importing this file verbatim into a repo would make the gate blocking immediately, which contradicts the advisory-by-default onboarding path.",
  },
  "org-ruleset": {
    what: "A reference document of the same ruleset shape, scoped by the custom repository property redline=onboarded instead of applying it per repo.",
    installedAs: null,
    installedBy: "Nothing in this codebase automates this. Based on its condition, the intended actor is an org administrator, once, by hand.",
    detail: [
      "redline init does set the redline=onboarded custom property on every repo it onboards, via the same applyPolicy call that would otherwise write the per-repo ruleset — that property is exactly what this file's repository_property condition matches.",
      "No code imports or uploads this JSON to GitHub's organization rulesets API anywhere in this repository. The apparent mechanism — inferred from the property condition, not confirmed by any script — is a one-time manual import by an org administrator (organisation Settings → Rulesets → New ruleset → Import), so the policy need not be reapplied per repo as more repos onboard.",
    ],
    output:
      "Nothing automatic. redline init does set the custom repository property redline=onboarded that this file's condition matches, but no code here uploads this JSON to the organisation rulesets API — the import is a manual one-time step by an org administrator, inferred from the property condition rather than confirmed by any script in this repository.",
    editWhere:
      "cli/platforms/github/install.ts sets the property. The ruleset itself is imported by hand, so changing this file changes nothing until someone re-imports it.",
    action: "Verify with the platform team before relying on this as a working pipeline — it is a reference shape for a manual step, not automation this repo performs.",
  },
};
