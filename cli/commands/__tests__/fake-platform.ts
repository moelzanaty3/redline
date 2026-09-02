import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  CapabilityOutcome,
  Change,
  GateOptions,
  InstallResult,
  MergePolicy,
  OwnershipRule,
  Platform,
  PolicyResult,
  PullRequestRef,
  RepoRef,
  SecurityResult,
} from '../../platforms/types.ts';

export interface FakePlatformOptions {
  ref?: RepoRef;
  gate?: CapabilityOutcome[];
  ownership?: CapabilityOutcome[];
  security?: CapabilityOutcome[];
  policy?: CapabilityOutcome[];
  gateFiles?: string[];
  failPullRequest?: boolean;
  // Work that only exists once the pull request does — Azure applies its sync
  // labels there. It is report-only: `.redline.json` is part of the pull
  // request and was written before it, so this can never reach pendingAdmin.
  pullRequestOutcomes?: CapabilityOutcome[];
}

export interface FakePlatform extends Platform {
  // Host settings this fake actually changed. A check-mode call is a plan, not
  // a mutation, and is recorded in `planned` instead — `redline init` must be
  // able to work out that a settled repository needs nothing without changing
  // a single host setting.
  applied: string[];
  planned: string[];
  lastPolicy: MergePolicy | null;
}

/**
 * The policy a repository has after a default `init`. `readPolicy` returns this
 * until `applyPolicy` overwrites it, so a fresh fake stands in for an already
 * onboarded repository — which is what the verify tests need.
 */
const ADVISORY: MergePolicy = {
  requiredApprovals: 1,
  dismissStaleReviews: true,
  requireCodeOwnerReview: true,
  requireThreadResolution: true,
  requiredChecks: [],
  blocking: false,
};

const ok = (capability: CapabilityOutcome['capability']): CapabilityOutcome => ({
  capability,
  status: 'applied',
  detail: capability,
});

// Mirrors the real adapters' syncFile: a file whose content already matches is
// not a change, so it never appears in the returned file list.
function seed(cwd: string, relPath: string, body: string, check: boolean): boolean {
  const target = join(cwd, relPath);
  if (existsSync(target) && readFileSync(target, 'utf8') === body) return false;
  if (check) return true;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
  return true;
}

export function fakePlatform(opts: FakePlatformOptions = {}): FakePlatform {
  const applied: string[] = [];
  const planned: string[] = [];
  const ref: RepoRef = opts.ref ?? {
    host: 'github',
    org: 'acme',
    repo: 'web',
    defaultBranch: 'main',
  };
  const platform: FakePlatform = {
    host: ref.host,
    applied,
    planned,
    lastPolicy: ADVISORY,
    async repoRef(): Promise<RepoRef> {
      return ref;
    },
    async installGate(
      _ref: RepoRef,
      cwd: string,
      _opts: GateOptions,
      check = false
    ): Promise<InstallResult> {
      (check ? planned : applied).push('installGate');
      const files = (opts.gateFiles ?? ['.github/workflows/redline.yml']).filter((rel) =>
        seed(cwd, rel, 'managed by redline\n', check)
      );
      return { files, outcomes: check ? [] : (opts.gate ?? [ok('labels')]) };
    },
    async applyPolicy(_ref: RepoRef, policy: MergePolicy): Promise<PolicyResult> {
      applied.push('applyPolicy');
      platform.lastPolicy = policy;
      return { outcomes: opts.policy ?? [ok('merge-policy'), ok('repo-property')], policy };
    },
    async enableSecurityFloor(): Promise<SecurityResult> {
      applied.push('enableSecurityFloor');
      return {
        outcomes: opts.security ?? [ok('secret-scanning'), ok('push-protection'), ok('dependency-alerts')],
      };
    },
    async ensureReviewOwnership(
      _ref: RepoRef,
      cwd: string,
      _rules: OwnershipRule[],
      check = false
    ): Promise<InstallResult> {
      (check ? planned : applied).push('ensureReviewOwnership');
      const seeded = seed(cwd, '.github/CODEOWNERS', '# Managed by Redline.\n', check);
      return {
        files: seeded ? ['.github/CODEOWNERS'] : [],
        outcomes: opts.ownership ?? [ok('review-ownership')],
      };
    },
    async openPullRequest(_ref: RepoRef, _cwd: string, _change: Change): Promise<PullRequestRef> {
      applied.push('openPullRequest');
      if (opts.failPullRequest) throw new Error('nothing to commit');
      return {
        number: 1,
        url: 'https://example/pr/1',
        ...(opts.pullRequestOutcomes ? { outcomes: opts.pullRequestOutcomes } : {}),
      };
    },
    async readPolicy(): Promise<MergePolicy | null> {
      return platform.lastPolicy;
    },
    async readReportedCheckNames(): Promise<string[]> {
      return ['redline-gate / gate'];
    },
    async readSecurityState(): Promise<SecurityResult> {
      return { outcomes: opts.security ?? [ok('secret-scanning'), ok('push-protection')] };
    },
    async latestPullRequestNumber(): Promise<number | null> {
      return 1;
    },
  };
  return platform;
}
