// What `redline init` asks you — the same questions, in the same order, as the
// menu the CLI now walks when it is run with no flags at a terminal.
//
// The transcript above shows one run with its defaults. That is the honest
// demonstration, and it is also the thing most likely to be mistaken for the
// only shape onboarding takes — a reader whose repository already has a
// pipeline, or who is on Azure DevOps, sees a GitHub run with everything
// enabled and reasonably concludes Redline is not for them.
//
// So this states the choices next to the run. Every flag here is a real one:
// the source of truth is the USAGE block in cli/bin/redline.ts and the option
// parser beside it, and cli/config/redline-json.ts for what each default is.
// A flag that stopped existing would still render, which is why the CLI page
// and this list share their wording with commands-info.ts rather than inventing
// a second description of the same switch.

type Choice = {
  readonly label: string;
  readonly flag: string;
  readonly fallback: string;
  readonly detail: string;
};

type Group = {
  readonly title: string;
  readonly lead: string;
  readonly choices: readonly Choice[];
};

const GROUPS: readonly Group[] = [
  {
    title: "Where it runs",
    lead: "Detected from your git remote, and asked anyway — detection can be wrong, and it is one keystroke to overrule.",
    choices: [
      {
        label: "GitHub",
        flag: "detected",
        fallback: "github.com or Enterprise Server",
        detail:
          "A branch ruleset requires the gate check, and a thin caller workflow references the org's reusable gate.",
      },
      {
        label: "Azure DevOps",
        flag: "detected",
        fallback: "dev.azure.com or a legacy visualstudio.com remote",
        detail:
          "A registered pipeline definition plus a Build Validation policy. Azure Repos ignores YAML pr: triggers, so the policy is what queues the build.",
      },
    ],
  },
  {
    title: "What runs your checks",
    lead: "Asked separately from the host, because the two come apart.",
    choices: [
      {
        label: "GitHub Actions",
        flag: "--pipeline github-actions",
        fallback: "the default on GitHub",
        detail:
          "A thin caller workflow referencing the organisation's reusable gate. Redline resolves that workflow before writing the caller, and refuses rather than commit one that cannot start.",
      },
      {
        label: "Azure Pipelines",
        flag: "--pipeline azure-pipelines",
        fallback: "detected from an existing pull request pipeline",
        detail:
          "For a repository hosted on GitHub whose checks are Azure Pipelines. Writes a pipeline definition with a pr: trigger; the build result is the check GitHub reads.",
      },
    ],
  },
  {
    title: "What the AI is told",
    lead: "Context sections rendered into the same artifacts as the rules.",
    choices: [
      {
        label: "Spec-driven development",
        flag: "--no-speckit",
        fallback: "on by default",
        detail:
          "Dropped automatically where the repository already runs Spec Kit — a separate tool with its own installer that Redline neither creates nor edits.",
      },
      {
        label: "TM Forum",
        flag: "--tmf",
        fallback: "off by default",
        detail:
          "Resource naming, @type and @baseType, offset/limit paging, the TMF error body. For repositories that actually implement TMF interfaces.",
      },
    ],
  },
  {
    title: "What it installs",
    lead: "Anything your repository already answers for itself can be deselected, and re-selected later.",
    choices: [
      {
        label: "The merge gate",
        flag: "--skip gate",
        fallback: "on by default",
        detail:
          "Skip it where the repository already has its own pipeline. Redline still renders the standards and still verifies them.",
      },
      {
        label: "Code ownership",
        flag: "--with review-ownership",
        fallback: "off by default",
        detail:
          "Seeds CODEOWNERS. Off unless asked for, because requiring review from an owner that cannot be resolved blocks every pull request in the repository.",
      },
      {
        label: "How hard it bites",
        flag: "--rung observe",
        fallback: "observe on a new repository",
        detail:
          "observe, warn, block-blocker, block-high. Promotion needs recorded evidence; stepping back down needs nothing at all.",
      },
    ],
  },
];

export function Choices() {
  return (
    <section className="hm-choices" id="choices">
      <div className="container">
        <h2>It asks before it writes</h2>
        <p className="hm-choices-lead">
          <code>redline init</code> with no flags, at a terminal, walks these
          one at a time — detected answer preselected, every term explained
          beside the choice that uses it, and <b>Dry run</b> before Apply. In CI,
          in a pipe, or with any flag at all, it prompts for nothing.{" "}
          The run above is one repository&apos;s answers. Yours are recorded in{" "}
          <code>.redline.json</code>, explained inline in that file, and every one
          of them is reversible — re-run <code>redline init</code> with the
          opposite flag, or <code>redline remove</code> to take the whole thing
          back out.
        </p>

        <div className="hm-choices-grid">
          {GROUPS.map((group) => (
            <div className="hm-choice-group" key={group.title}>
              <h3>{group.title}</h3>
              <p className="hm-choice-lead">{group.lead}</p>
              <ul>
                {group.choices.map((choice) => (
                  <li key={choice.label}>
                    <div className="hm-choice-head">
                      <b>{choice.label}</b>
                      <code>{choice.flag}</code>
                    </div>
                    <span className="hm-choice-default">{choice.fallback}</span>
                    <p>{choice.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="hm-choices-foot">
          Nothing here is guessed at silently. A capability Redline cannot apply
          is recorded as needing an administrator rather than reported as
          success, and a tool your repository already runs is named in the run&apos;s
          own output instead of being installed a second time.
        </p>
      </div>
    </section>
  );
}
