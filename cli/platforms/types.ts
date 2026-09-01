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
  openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef>;
}

export interface PlatformVerify {
  readPolicy(ref: RepoRef): Promise<MergePolicy | null>;
  readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]>;
  readSecurityState(ref: RepoRef): Promise<SecurityResult>;
  latestPullRequestNumber(ref: RepoRef): Promise<number | null>;
}

export type ThreadOutcome = 'acted_on' | 'dismissed' | 'ignored' | 'open';

export interface ReviewThread {
  id: string;
  outcome: ThreadOutcome;
  author: string;
  body: string;
}

export interface PullRequestSummary {
  number: number;
  repo: string;
  mergedAt: string;
}

export interface TriageItem {
  repo: string;
  number: number;
  title: string;
  reason: 'gate-failing' | 'changes-requested' | 'awaiting-review' | 'idle';
  url: string;
}

export interface PlatformMeasure {
  listMergedPullRequests(org: string, since: string): AsyncIterable<PullRequestSummary>;
  readReviewThreads(ref: RepoRef, pr: number): Promise<ReviewThread[]>;
  listNeedsAttention(org: string): Promise<TriageItem[]>;
}

export interface Platform extends PlatformInstall, PlatformVerify {
  readonly host: Host;
  repoRef(cwd: string): Promise<RepoRef>;
}
