import { capabilityName, readConfig } from '../config/redline-json.ts';
import { standardsVersion } from './sync.ts';
import { resolveProfile } from '../render/profile.ts';
import { loadManifest } from '../render/manifest.ts';
import { TOOL_PROBES } from '../detect/existing.ts';
import type { Rung } from '../enforce/ladder.ts';
import type { GatePipeline } from '../platforms/types.ts';

// Where this repository stands, on one screen and with no credential.
//
// Everything here was already knowable and none of it was answerable without
// reading `.redline.json` by hand or running `verify` and interpreting it. The
// question this exists for is the one asked before touching anything: what is
// installed, how hard does it bite, what is still waiting on somebody else, and
// is any of it out of date.

export interface StatusReport {
  readonly onboarded: boolean;
  readonly profile: string;
  readonly stacks: readonly string[];
  readonly host: string;
  /** What runs the pull request checks. Only meaningful when a gate is installed. */
  readonly pipeline: GatePipeline;
  readonly rung: Rung;
  readonly vendors: readonly string[];
  readonly capabilities: readonly string[];
  readonly integrations: readonly string[];
  /** Capabilities an administrator still has to grant. */
  readonly pendingAdmin: readonly string[];
  readonly standardsVersion: string;
  readonly currentStandards: string;
  /** True when the repository is rendered from an older standards version. */
  readonly drifted: boolean;
  readonly onboardedAt: string;
  readonly lastRunAt: string;
}

export function status(cwd: string, root: string): StatusReport {
  const config = readConfig(cwd);
  const current = standardsVersion(root);

  if (config === null) {
    return {
      onboarded: false,
      profile: '',
      stacks: [],
      host: '',
      pipeline: 'github-actions',
      rung: 'observe',
      vendors: [],
      capabilities: [],
      integrations: [],
      pendingAdmin: [],
      standardsVersion: '',
      currentStandards: current,
      drifted: false,
      onboardedAt: '',
      lastRunAt: '',
    };
  }

  // A profile the manifest no longer defines must not crash the one command
  // whose job is to report the state of a repository — that repository is
  // exactly the one somebody needs to look at.
  let stacks: string[] = [];
  try {
    stacks = resolveProfile(loadManifest(root), config.profile).stacks;
  } catch {
    stacks = [];
  }

  const selected = Object.entries(config.capabilities)
    .filter(([, on]) => on)
    .map(([key]) => capabilityName(key));

  return {
    onboarded: true,
    profile: config.profile,
    stacks,
    host: config.host,
    pipeline: config.pipeline,
    rung: config.rung,
    vendors: config.vendors,
    capabilities: selected,
    integrations: config.integrations,
    pendingAdmin: config.pendingAdmin,
    standardsVersion: config.standardsVersion,
    currentStandards: current,
    drifted: config.standardsVersion !== current,
    onboardedAt: config.onboardedAt,
    lastRunAt: config.lastRunAt,
  };
}

/** The report as lines, in the order they answer the question. */
export function formatStatus(report: StatusReport): string[] {
  if (!report.onboarded) {
    return [
      'not onboarded — no .redline.json here',
      `the standards in this CLI are at ${report.currentStandards}`,
      'start with: redline init --dry-run',
    ];
  }

  // `rung` and `pipeline` are recorded whether or not a gate was installed, but
  // both only ever describe a gate: the rung is substituted into the gate file,
  // and the pipeline decides which file that is. On a repository that opted out
  // of a gate, printing them describes a check that will never run — and "the
  // check is always green" reads as reassurance about machinery that is absent.
  const gated = report.capabilities.includes(capabilityName('gate'));

  const lines = [
    `profile      ${report.profile}${report.stacks.length > 0 ? ` (${report.stacks.join(', ')})` : ''}`,
    `host         ${report.host}`,
    ...(gated
      ? [
          `checks       ${PIPELINE_LABEL[report.pipeline]}`,
          `rung         ${report.rung} — ${
            report.pipeline === 'local-agent'
              ? LOCAL_RUNG_MEANING[report.rung]
              : RUNG_MEANING[report.rung]
          }`,
        ]
      : []),
    `assistants   ${report.vendors.join(', ')}`,
    `installed    ${report.capabilities.length > 0 ? report.capabilities.join(', ') : 'nothing'}`,
  ];

  if (!gated) {
    lines.push('checks       none — the standards are rendered for assistants to read');
  }

  if (report.integrations.length > 0) {
    const labels = report.integrations.map(
      (id) => TOOL_PROBES.find((probe) => probe.id === id)?.label ?? id
    );
    lines.push(`alongside    ${labels.join(', ')}`);
  }

  lines.push(
    `standards    ${report.standardsVersion}${
      report.drifted ? ` — behind ${report.currentStandards}, a sync will raise it` : ' — current'
    }`
  );

  if (report.pendingAdmin.length > 0) {
    // Named as waiting on a person rather than as a failure: nobody here can
    // clear it, and reporting it as broken sends them looking for a bug.
    lines.push(`waiting on   an administrator, for: ${report.pendingAdmin.join(', ')}`);
  }

  lines.push(`onboarded    ${report.onboardedAt.slice(0, 10)}, last run ${report.lastRunAt.slice(0, 10)}`);
  return lines;
}

// Record<Rung, …> rather than a lookup with a fallback: a rung added to the
// ladder has to be given a meaning here, and the build says so.
// Record<GatePipeline, …> rather than a lookup with a fallback: a pipeline added
// to the type without a label here is a compile error, not a blank line.
const PIPELINE_LABEL: Record<GatePipeline, string> = {
  'github-actions': 'GitHub Actions',
  'azure-pipelines': 'Azure Pipelines',
  'local-agent': 'an agent on this machine — a pre-push hook, nothing on the host',
};

const RUNG_MEANING: Record<Rung, string> = {
  observe: 'comments only, the check is always green',
  warn: 'comments and labels, still never blocks a merge',
  'block-blocker': 'a BLOCKER finding stops the merge',
  'block-high': 'BLOCKER and HIGH both stop the merge',
};

// The ladder is the same on a gate that runs here, but there is no check to be
// green and no merge to stop: it refuses the push instead. Reusing the CI
// wording sent the reader looking for a check that does not exist.
const LOCAL_RUNG_MEANING: Record<Rung, string> = {
  observe: 'findings are printed, the push is never blocked',
  warn: 'findings are printed, the push is still never blocked',
  'block-blocker': 'a BLOCKER finding refuses the push',
  'block-high': 'BLOCKER and HIGH both refuse the push',
};
