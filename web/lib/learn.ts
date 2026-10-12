// The Learn path, in order. One entry per page under /docs/learn: the sidebar,
// the overview's step list, each page's stepper and the progress tracker all
// read this, so a step renamed here is renamed everywhere at once.

export const DEMO_URL = "https://github.com/moelzanaty3/redline-demo";

export type LearnStep = {
  slug: string;
  n: string;
  title: string;
  // One line: what the reader can do after this page that they could not before.
  summary: string;
  minutes: number;
  // The demo's git tag and pull request for this step, when it has them.
  tag?: string;
  pr?: number;
  // Steps 05 onwards need the pipeline, so they need GitHub.
  needsGitHub: boolean;
};

export const LEARN_STEPS: LearnStep[] = [
  {
    slug: "starting-point",
    n: "00",
    title: "The starting point",
    summary: "Get the starter files into your own repository, and see what it holds.",
    minutes: 5,
    tag: "step-00",
    needsGitHub: false,
  },
  {
    slug: "onboard",
    n: "01",
    title: "Onboard",
    summary: "One command adds the rules, the review commands and a merge gate.",
    minutes: 5,
    tag: "step-01",
    pr: 1,
    needsGitHub: false,
  },
  {
    slug: "first-finding",
    n: "02",
    title: "Your first finding",
    summary: "Four broken rules, caught on your machine, by your assistant and in the pipeline.",
    minutes: 8,
    tag: "step-02",
    pr: 2,
    needsGitHub: false,
  },
  {
    slug: "explain-and-fix",
    n: "03",
    title: "Explain and fix",
    summary: "Find out why a rule exists, then fix the code instead of silencing it.",
    minutes: 6,
    tag: "step-03",
    pr: 3,
    needsGitHub: false,
  },
  {
    slug: "team-rule",
    n: "04",
    title: "A team rule",
    summary: "Write your team's own rule once, and every assistant and review picks it up.",
    minutes: 6,
    tag: "step-04",
    pr: 4,
    needsGitHub: false,
  },
  {
    slug: "adr",
    n: "05",
    title: "A big change needs an ADR",
    summary: "Past 300 changed lines, the pull request links the decision behind it.",
    minutes: 6,
    tag: "step-05",
    pr: 5,
    needsGitHub: true,
  },
  {
    slug: "security-floor",
    n: "06",
    title: "The security floor",
    summary: "A vulnerable dependency fails the gate from day one, and nothing waives it.",
    minutes: 6,
    tag: "step-06",
    pr: 6,
    needsGitHub: true,
  },
  {
    slug: "required-gate",
    n: "07",
    title: "Make the gate required",
    summary: "A red gate disables the merge button, for everyone.",
    minutes: 5,
    tag: "step-07",
    pr: 12,
    needsGitHub: true,
  },
  {
    slug: "exemptions",
    n: "08",
    title: "Exemptions",
    summary: "Merge past a failing check on purpose, with the reason on the record.",
    minutes: 7,
    tag: "step-08",
    pr: 14,
    needsGitHub: true,
  },
  {
    slug: "earn-a-rung",
    n: "09",
    title: "Earn a stricter rung",
    summary: "Blocking on findings is earned with evidence, never switched on.",
    minutes: 6,
    tag: "step-09",
    pr: 15,
    needsGitHub: true,
  },
  {
    slug: "next-steps",
    n: "10",
    title: "Recap and next steps",
    summary: "What you built, how new rules reach you, and where to go from here.",
    minutes: 4,
    needsGitHub: false,
  },
];

export const LEARN_MINUTES = LEARN_STEPS.reduce((sum, s) => sum + s.minutes, 0);

export function learnHref(step: LearnStep): string {
  return `/docs/learn/${step.slug}`;
}

export function learnStep(slug: string): LearnStep {
  const step = LEARN_STEPS.find((s) => s.slug === slug);
  // A page asking for a step that is not listed is a build-time typo, and a
  // page rendered without its header would hide it.
  if (step === undefined) throw new Error(`lib/learn.ts has no step "${slug}"`);
  return step;
}
