import { capabilityName, readConfig } from '../config/redline-json.ts';
import { standardsVersion } from './sync.ts';
import { resolveProfile } from '../render/profile.ts';
import { loadManifest } from '../render/manifest.ts';
import { TOOL_PROBES } from '../detect/existing.ts';
import type { Rung } from '../enforce/ladder.ts';

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

  const lines = [
    `profile      ${report.profile}${report.stacks.length > 0 ? ` (${report.stacks.join(', ')})` : ''}`,
    `host         ${report.host}`,
    `rung         ${report.rung} — ${RUNG_MEANING[report.rung]}`,
    `assistants   ${report.vendors.join(', ')}`,
    `installed    ${report.capabilities.length > 0 ? report.capabilities.join(', ') : 'nothing'}`,
  ];

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
const RUNG_MEANING: Record<Rung, string> = {
  observe: 'comments only, the check is always green',
  warn: 'comments and labels, still never blocks a merge',
  'block-blocker': 'a BLOCKER finding stops the merge',
  'block-high': 'BLOCKER and HIGH both stop the merge',
};
