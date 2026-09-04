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
  // `applied`/`already`/`denied` are definite: the read (or write) gave a real
  // answer. `unsupported` is ALSO definite — the capability does not exist on
  // this repository at all (Advanced Security unlicensed on an Azure tenant) —
  // so nothing an administrator can do makes it appear. `unknown` is the odd
  // one out: the read gave NO answer (a 401/403 that this host cannot tell
  // apart from a genuine, well-formed refusal, or a token structurally unable
  // to see the setting). Conflating `unknown` with `denied` files false work
  // against an administrator; conflating it with `unsupported` reports a
  // licensed-but-unreadable repository as unlicensed. Both are wrong for the
  // same reason: an indeterminate read is not an answer.
  status: 'applied' | 'already' | 'denied' | 'unsupported' | 'unknown';
  detail: string;
}

// Exactly `denied`. `unknown` must behave like `unsupported` here — neither
// ever reaches pendingAdmin, and neither ever clears an entry already
// recorded there (cli/commands/init.ts's refreshPendingAdmin keys off this
// same function) — because an indeterminate read has told nobody anything
// they can act on.
export function isPending(outcome: CapabilityOutcome): boolean {
  return outcome.status === 'denied';
}

export interface GateOptions {
  adrDiffThreshold: number;
  failOnDependencySeverity: 'low' | 'moderate' | 'high' | 'critical';
  softFailLabels: string[];
  // `redline init --adopt-caller`. The gate machinery file is YAML, so it can
  // never take the marker-block merge the shared markdown artifacts take, and a
  // file at that path Redline cannot attribute to itself stops the run rather
  // than being overwritten. This is the human decision that unblocks it — a 2.1
  // caller carries nothing that attributes it, and guessing from the word
  // "redline" is what destroyed a repository's own workflow.
  adoptCaller?: boolean;
  // `false` when the repository deselected Redline's labels at install time.
  // GitHub pre-declares the gate's soft-fail labels here; Azure creates pull
  // request labels on use and so has nothing to skip. Absent means selected,
  // which is what every caller before the selection existed meant.
  manageLabels?: boolean;
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
  // Read side only, and set only when the host says the policy exists but is
  // not in force — a GitHub ruleset switched out of `active` enforcement keeps
  // every field above readable while none of its rules apply. `redline verify`
  // treats it as drift: without it, the cheapest loosening on GitHub is
  // invisible to every comparison this policy supports.
  notEnforcedReason?: string;
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
  | 'dismissStaleReviews'
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

// What makes the gate run on this host, read from the local checkout. The
// distinction it exists to draw: a required check missing from a pull request
// is meaningless on its own — the gate may simply not have run yet — but it is
// an outage when nothing in the repository can ever publish that check.
export interface GateMachinery {
  // Repository-relative path of the file that runs the gate, whether or not it
  // is there.
  path: string;
  present: boolean;
  // The check name this file would publish, read out of the file itself. null
  // when the file is absent, when it no longer carries the contract that
  // produces a name — a renamed caller job, an edited status step, a trigger
  // removed — or when the file is there but could not be attributed at all.
  publishes: string | null;
  // The name a correctly installed gate publishes on this host. `publishes`
  // differing from it is a rename; `publishes` matching it while the policy
  // requires something else is the policy having moved, which is a different
  // sentence to say to an operator.
  expected: string;
}

export interface PlatformVerify {
  readPolicy(ref: RepoRef): Promise<MergePolicy | null>;
  // Local only: no host call, no credential, same as Platform.localRef. It
  // reads the file `installGate` wrote, so it is sync and cannot fail the run
  // the way a host read can.
  readGateMachinery(cwd: string): GateMachinery;
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
