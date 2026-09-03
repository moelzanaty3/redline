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
  // The machinery that runs the merge gate on the host. GitHub needs none (a
  // workflow file's pr trigger fires natively); Azure Repos ignores YAML
  // `pr:` triggers, so there it is a registered pipeline definition plus a
  // Build Validation branch policy.
  'gate',
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
  // Read side only, and set only when the host can say something the boolean
  // cannot: why a gate that looks configured to block does not actually
  // block. `redline verify` prints it with the merge-policy finding, so an
  // operator debugging stuck pull requests is pointed at the real cause.
  advisoryReason?: string;
  // Read side only. Settings whose live value this host cannot attribute to
  // Redline — either the adapter never applies them (Azure has no
  // CODEOWNERS-driven required reviewers) or the policy carrying them is a
  // human's that `redline init` deliberately backed off from rather than
  // stacking a second copy of the same control. `redline verify` reports
  // these and does not compare them: an indeterminate read is not an answer,
  // and failing on one would block every pull request in a repository that is
  // in exactly the state init left it in.
  unownedSettings?: PolicySetting[];
}

export type PolicySetting =
  | 'requiredApprovals'
  | 'requireCodeOwnerReview'
  | 'requireThreadResolution';

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
  // Work that happens after the pull request exists and can be refused on its
  // own — applying the sync labels. It degrades into an outcome rather than
  // costing the pull request, and the caller folds it into its report. It
  // cannot reach `.redline.json`'s pendingAdmin: that file is part of the
  // pull request and is therefore written before the pull request is opened.
  outcomes?: CapabilityOutcome[];
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
  // `check` computes which files would change and does nothing else: no write,
  // no host call, no outcome for work that never happened. `redline init`
  // plans with it — both for `--dry-run` and to decide whether a re-run has
  // anything to do at all, which it must know BEFORE it touches a host
  // setting on a repository that is already settled.
  installGate(ref: RepoRef, cwd: string, opts: GateOptions, check?: boolean): Promise<InstallResult>;
  applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult>;
  enableSecurityFloor(ref: RepoRef): Promise<SecurityResult>;
  ensureReviewOwnership(
    ref: RepoRef,
    cwd: string,
    rules: OwnershipRule[],
    check?: boolean
  ): Promise<InstallResult>;
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
  // The identity that can be derived from the local clone alone — the remote
  // URL, plus whatever the clone knows about the default branch. No host call,
  // so `redline init --dry-run` prints a plan offline and with an unscoped
  // token. It is deliberately not enough to write with: Azure's repoId is a
  // host fact and is absent here.
  localRef(cwd: string): RepoRef;
}
