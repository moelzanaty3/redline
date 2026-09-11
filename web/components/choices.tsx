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

import type { ReactElement } from "react";
import { Reveal } from "@/components/reveal";

type Choice = {
  readonly label: string;
  readonly flag: string;
  readonly fallback: string;
  readonly detail: string;
};

type Group = {
  readonly title: string;
  readonly lead: string;
  readonly icon: "host" | "checks" | "context" | "install";
  // Distinguishes the one category the CLI resolves for you from the three
  // it asks you to decide — a difference the copy already draws ("detected...
  // asked anyway" vs "on/off by default") but the layout didn't, until now.
  readonly mode: "detected" | "your call";
  readonly choices: readonly Choice[];
};

// One stroke icon per group, drawn inline rather than pulled from an icon
// library — four glyphs don't earn a dependency. Single colour, matched to
// the surrounding text rather than a new hue, so the accent stays spent on
// the three things the file header above already commits it to.
const ICONS: Record<Group["icon"], ReactElement> = {
  host: (
    <path d="M4 3h16v6H4V3Zm0 12h16v6H4v-6ZM7 6h.01M7 18h.01M12 6h5M12 18h5" />
  ),
  checks: (
    <path d="m9 12 2 2 4-4M12 3l8 4v5c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V7l8-4Z" />
  ),
  context: (
    <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
  ),
  install: (
    <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  ),
};

const GROUPS: readonly Group[] = [
  {
    title: "Where it runs",
    icon: "host",
    mode: "detected",
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
    icon: "checks",
    mode: "your call",
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
    icon: "context",
    mode: "your call",
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
    icon: "install",
    mode: "your call",
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

        <div className="hm-choices-steps">
          {GROUPS.map((group, i) => (
            <Reveal className="hm-step" key={group.title} delay={i * 90}>
              <div className="hm-step-marker">
                <div className="hm-step-node" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {ICONS[group.icon]}
                  </svg>
                </div>
              </div>
              <div className="hm-step-body">
                <div className="hm-step-head">
                  <h3>{group.title}</h3>
                  <span className={`hm-step-mode hm-step-mode-${group.mode === "detected" ? "detected" : "choice"}`}>
                    {group.mode}
                  </span>
                </div>
                <p className="hm-choice-lead">{group.lead}</p>
                <div className="hm-step-choices">
                  {group.choices.map((choice) => (
                    <div className="hm-step-choice" key={choice.label}>
                      <div className="hm-choice-head">
                        <b>{choice.label}</b>
                        <code>{choice.flag}</code>
                      </div>
                      <span className="hm-choice-default">
                        {choice.fallback}
                      </span>
                      <p>{choice.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
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
