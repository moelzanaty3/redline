export const HOSTS = ['github', 'azure'] as const;
export type Host = (typeof HOSTS)[number];

export const ADMIN_CAPABILITIES = [
  'secret-scanning',
  'push-protection',
  'dependency-alerts',
  'merge-policy',
  'repo-property',
  'labels',
  'review-ownership',
] as const;
export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export interface RepoRef {
  host: Host;
  org: string;
  project?: string;
  repo: string;
  repoId?: string;
  defaultBranch: string;
}

export interface CapabilityOutcome {
  capability: AdminCapability;
  status: 'applied' | 'already' | 'denied' | 'unsupported';
  detail: string;
}

export function isPending(outcome: CapabilityOutcome): boolean {
  return outcome.status === 'denied';
}

export interface GateOptions {
  adrDiffThreshold: number;
  failOnDependencySeverity: 'low' | 'moderate' | 'high' | 'critical';
  softFailLabels: string[];
}

export interface MergePolicy {
  requiredApprovals: number;
  dismissStaleReviews: boolean;
  requireCodeOwnerReview: boolean;
  requireThreadResolution: boolean;
  // Read side only. On write each adapter supplies its own gate check name
  // (GitHub's REQUIRED_CHECK, Azure's AZURE_STATUS_NAME/GENRE) — a host's
  // check name is host knowledge and must not be assembled by a caller
  // outside cli/platforms/. On read it is whatever the host actually
  // reports, which is what verify compares against the reported checks.
  requiredChecks: string[];
  blocking: boolean;
}

export interface OwnershipRule {
  pattern: string;
  owners: string[];
}

export interface Change {
  branch: string;
  title: string;
  body: string;
  labels: string[];
  files: string[];
}

export interface PullRequestRef {
  number: number;
  url: string;
}

export interface InstallResult {
  files: string[];
  outcomes: CapabilityOutcome[];
}

export interface PolicyResult {
  outcomes: CapabilityOutcome[];
  policy: MergePolicy | null;
}

export interface SecurityResult {
  outcomes: CapabilityOutcome[];
}

export interface PlatformInstall {
  installGate(ref: RepoRef, cwd: string, opts: GateOptions): Promise<InstallResult>;
  applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult>;
  enableSecurityFloor(ref: RepoRef): Promise<SecurityResult>;
  ensureReviewOwnership(ref: RepoRef, cwd: string, rules: OwnershipRule[]): Promise<InstallResult>;
  // Resolves null when there is nothing to commit — the repository already
  // matches what Redline would push, so a no-op, not an error.
  openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef | null>;
}

export interface PlatformVerify {
  readPolicy(ref: RepoRef): Promise<MergePolicy | null>;
  readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]>;
  readSecurityState(ref: RepoRef): Promise<SecurityResult>;
  latestPullRequestNumber(ref: RepoRef): Promise<number | null>;
}

export interface Platform extends PlatformInstall, PlatformVerify {
  readonly host: Host;
  repoRef(cwd: string): Promise<RepoRef>;
}
