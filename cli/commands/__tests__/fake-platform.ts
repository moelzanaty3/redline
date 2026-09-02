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
}

export interface FakePlatform extends Platform {
  applied: string[];
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

export function fakePlatform(opts: FakePlatformOptions = {}): FakePlatform {
  const applied: string[] = [];
  const ref: RepoRef = opts.ref ?? {
    host: 'github',
    org: 'acme',
    repo: 'web',
    defaultBranch: 'main',
  };
  const platform: FakePlatform = {
    host: ref.host,
    applied,
    lastPolicy: ADVISORY,
    async repoRef(): Promise<RepoRef> {
      return ref;
    },
    async installGate(_ref: RepoRef, _cwd: string, _opts: GateOptions): Promise<InstallResult> {
      applied.push('installGate');
      return {
        files: opts.gateFiles ?? ['.github/workflows/redline.yml'],
        outcomes: opts.gate ?? [ok('labels')],
      };
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
      _cwd: string,
      _rules: OwnershipRule[]
    ): Promise<InstallResult> {
      applied.push('ensureReviewOwnership');
      return { files: ['.github/CODEOWNERS'], outcomes: opts.ownership ?? [ok('review-ownership')] };
    },
    async openPullRequest(_ref: RepoRef, _cwd: string, _change: Change): Promise<PullRequestRef> {
      applied.push('openPullRequest');
      if (opts.failPullRequest) throw new Error('nothing to commit');
      return { number: 1, url: 'https://example/pr/1' };
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
