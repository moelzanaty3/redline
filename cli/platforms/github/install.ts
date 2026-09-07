import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RedlineError } from '../../core/errors.ts';
import type { Git } from '../../core/git.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  Change,
  GateOptions,
  InstallResult,
  MergePolicy,
  OwnershipRule,
  PlatformInstall,
  PolicyResult,
  PullRequestRef,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { GitHubClient } from './client.ts';
import { isNonNullObject, isSuccess } from '../shape.ts';
import { BEGIN_PREFIX, END, findBlock, wrapBlock } from '../../render/markers.ts';
import { TEMPLATE_DIRS as PULL_REQUEST_TEMPLATE_DIRS } from '../pull-request-templates.ts';

export const RULESET_NAME = 'Redline';
export const REQUIRED_CHECK = 'redline-gate / gate';

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const GATE_LABELS = [
  { name: 'no-adr', color: 'ededed', description: 'PR intentionally ships without an ADR' },
  {
    name: 'redline-exempt',
    color: 'fbca04',
    description: 'Gate process checks soft-failed with reviewer sign-off',
  },
  {
    name: 'redline-sync',
    color: '0e8a16',
    description: 'Automated standards sync from the Redline source repo',
  },
];

// GitHub response bodies are untrusted external input: the transport (http.ts)
// only guarantees valid JSON, never a particular shape. Bodies read here are
// typed `unknown` and narrowed by an explicit parse function, in the house
// style of cli/render/manifest.ts and cli/platforms/github/verify.ts.

interface RulesetSummary {
  id: number;
  name: string;
}

function parseRulesetSummaries(body: unknown): RulesetSummary[] | null {
  if (!Array.isArray(body)) return null;
  const summaries: RulesetSummary[] = [];
  for (const item of body) {
    if (!isNonNullObject(item) || typeof item['id'] !== 'number' || typeof item['name'] !== 'string') {
      return null;
    }
    summaries.push({ id: item['id'], name: item['name'] });
  }
  return summaries;
}

function parseCreatedPullRequest(body: unknown): PullRequestRef | null {
  if (!isNonNullObject(body) || typeof body['number'] !== 'number' || typeof body['html_url'] !== 'string') {
    return null;
  }
  return { number: body['number'], url: body['html_url'] };
}

function outcome(
  capability: AdminCapability,
  status: number,
  detail: string
): CapabilityOutcome {
  if (isSuccess(status)) return { capability, status: 'applied', detail };
  if (status === 401 || status === 403) {
    return { capability, status: 'denied', detail: `${detail} (needs repository admin)` };
  }
  if (status === 404 || status === 422) {
    return { capability, status: 'unsupported', detail: `${detail} (not available on this repository)` };
  }
  return { capability, status: 'denied', detail: `${detail} (HTTP ${status})` };
}

// GitHub answers 404, not 403, on these admin write endpoints when a
// fine-grained token lacks the administration scope on a repository it can
// otherwise read — so on a write, 404 is a permission denial that must reach
// pendingAdmin, not a missing feature. Read endpoints keep 404 = unsupported.
function writeOutcome(
  capability: AdminCapability,
  status: number,
  detail: string
): CapabilityOutcome {
  if (status === 404) {
    return { capability, status: 'denied', detail: `${detail} (needs repository admin)` };
  }
  return outcome(capability, status, detail);
}

// Combines several outcomes for one logical capability (e.g. GitHub reports
// dependency-alerts as two separate calls, and labels are created one at a
// time) into a single outcome. Ranked by how actionable/notable the status is
// so a real permission denial on one sub-call is never masked by a merely
// larger HTTP status number on another (a 404 "unsupported" must not hide a
// 403 "denied", and an "already exists" 422 must not hide a 403 "denied").
// `unknown` never appears here today — nothing installGate/applyPolicy/
// enableSecurityFloor writes degrades a status into it, only verify.ts's
// readSecurityState does — but the status union requires every member ranked.
// It sits between `denied` and `unsupported`: a genuine denial must never be
// masked by an indeterminate read, and an indeterminate read must never be
// masked by a definite "not available here" or a definite success either.
const OUTCOME_RANK: Record<CapabilityOutcome['status'], number> = {
  denied: 4,
  unknown: 3,
  unsupported: 2,
  already: 1,
  applied: 0,
};

function worstOutcome(outcomes: CapabilityOutcome[]): CapabilityOutcome {
  const [first, ...rest] = outcomes;
  if (!first) throw new Error('worstOutcome requires at least one outcome');
  return rest.reduce(
    (worst, next) => (OUTCOME_RANK[next.status] > OUTCOME_RANK[worst.status] ? next : worst),
    first
  );
}

// Writes only when the bytes differ, and answers whether they did — the same
// contract as cli/render/standards.ts. `redline init` folds the returned file
// list into its already-onboarded decision, so a file reported as written when
// nothing changed leaves a modified tracked file behind with no pull request
// to carry it: exactly what a CLI-version bump used to do to the pinned gate
// template. `check` computes the answer and writes nothing.
function syncFile(cwd: string, relPath: string, contents: string, check: boolean): boolean {
  const target = join(cwd, relPath);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current === contents) return false;
  if (check) return true;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  return true;
}

// The two sections workflows/redline-gate.yml actually reads out of a pull
// request body, and the reason it is these two and not the others: the
// `checklist` job fails the pull request outright when `## Launch readiness`
// is missing, and the `adr` job fails a large diff whose body carries no
// `docs/adr/` link, which is what `## Architecture decision` prompts for.
// `## Change type` is gated by nothing (the workflow says so in a comment),
// `## Automated review` is gated by nothing, and `# Summary` would collide
// with the heading a repository's own template already has. Dropping the ADR
// section would leave a merged repository failing a gate job it has no
// affordance to satisfy.
//
// `satisfied` asks what the gate job asks, not what the section looks like.
// The checklist job's awk matches the heading by prefix, so
// `## Launch readiness checklist` already satisfies it and must not be given a
// second, competing section. The adr job greps the whole body for `docs/adr/`,
// so any existing ADR link satisfies it, heading or no heading.
const GATED_SECTIONS = [
  {
    heading: 'Launch readiness',
    satisfied: (template: string): boolean => /^##[ \t]+Launch readiness/m.test(template),
  },
  {
    heading: 'Architecture decision',
    satisfied: (template: string): boolean => template.includes('docs/adr/'),
  },
];

// The gate reads a `## Redline exemption` block, so a template without one
// leaves an author who needs a waiver with nowhere to write it. It rides along in
// any block Redline is writing anyway, but it is deliberately NOT in
// GATED_SECTIONS: no gate job fails for its absence, so it must never be the
// reason a marker block appears in a template a team wrote for themselves.
const EXEMPTION_HEADING = 'Redline exemption';

// The headings to put inside a block, given the gated ones that still need
// covering. Empty in, empty out: no block is created just to carry the optional
// section.
const blockSections = (headings: string[]): string[] =>
  headings.length === 0 ? [] : [...headings, EXEMPTION_HEADING];

function gatedSections(template: string, headings: string[]): string {
  const kept: string[] = [];
  let inside = false;
  for (const line of template.split('\n')) {
    // The packaged template carries the markers itself, so a greenfield file is
    // marked from the first run. The marker lines are the wrapper wrapBlock
    // adds back, never part of the body it wraps.
    if (line.startsWith(BEGIN_PREFIX) || line.startsWith(END)) continue;
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) inside = headings.includes(heading[1] ?? '');
    if (inside) kept.push(line);
  }
  return kept.join('\n').trim();
}

// GitHub's documentation names only `pull_request_template.md`. `.txt` and
// extension-less forms are not documented, and adopting an undocumented one as
// the merge target risks merging into a file the host never serves while
// creating no `.md` at all — so the served name is the only candidate.
const TEMPLATE_NAMES = ['pull_request_template.md'];

// GitHub resolves the default template from `.github/`, the repository root
// and `docs/` — its documentation names the three folders but no precedence.
// The order itself lives in pull-request-templates.ts, the one source shared
// with `redline verify` — see the comment there.
const TEMPLATE_DIRS = PULL_REQUEST_TEMPLATE_DIRS.github;

interface Candidate {
  abs: string;
  rel: string;
}

// Resolved by listing rather than by `existsSync`, for two reasons the review
// found the hard way: both hosts treat the folder name as case-insensitive, and
// `existsSync` is case-insensitive on macOS but not on Linux, so a `.GitHub/`
// checkout was silently missed on CI and a second template written beside the
// served one. Listing also answers `isDirectory()`, which is what stops a plain
// file named `docs` from throwing ENOTDIR mid-run, after the gate workflow has
// already been written.
function candidateDirs(cwd: string): Candidate[] {
  const entries = readdirSync(cwd, { withFileTypes: true });
  const found: Candidate[] = [];
  for (const wanted of TEMPLATE_DIRS) {
    if (wanted === '') {
      found.push({ abs: cwd, rel: '' });
      continue;
    }
    const dir = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === wanted);
    if (dir) found.push({ abs: join(cwd, dir.name), rel: dir.name });
  }
  return found;
}

const under = (candidate: Candidate, name: string): string =>
  candidate.rel === '' ? name : `${candidate.rel}/${name}`;

function findPullRequestTemplate(cwd: string): string | null {
  for (const candidate of candidateDirs(cwd)) {
    const names = readdirSync(candidate.abs, { withFileTypes: true })
      .filter((entry) => entry.isFile() && TEMPLATE_NAMES.includes(entry.name.toLowerCase()))
      .map((entry) => entry.name);
    // Two case variants in one directory: the host picks one and does not say
    // which, so the tie-break is at least deterministic rather than whatever
    // order the filesystem happened to list. Canonical spelling first,
    // preferred extension next, byte order last.
    names.sort((a, b) => {
      const byName = TEMPLATE_NAMES.indexOf(a.toLowerCase()) - TEMPLATE_NAMES.indexOf(b.toLowerCase());
      if (byName !== 0) return byName;
      if (a === b.toLowerCase()) return -1;
      if (b === a.toLowerCase()) return 1;
      return a < b ? -1 : 1;
    });
    const hit = names[0];
    if (hit !== undefined) return under(candidate, hit);
  }
  return null;
}

// GitHub has no branch-specific templates: a `PULL_REQUEST_TEMPLATE/` directory
// holds alternates reachable only through a `?template=` link, never the
// default body. `isFile()` above is what skips it — Redline neither adopts one
// as the template nor rewrites anything inside it, and writes the default path
// instead, which is what a plain pull request there would otherwise open with
// an empty body and fail the gate for. (Azure's branch templates are not the
// same case and are handled in that adapter.)

interface TemplateMerge {
  path: string;
  changed: boolean;
  detail: string;
}

// A repository's own pull request template is a human-owned file, and this was
// the last host-writing path in either adapter that simply overwrote one.
// Leaving it alone is not the fix either: the gate fails any pull request
// whose body has no `## Launch readiness` section, so an untouched brownfield
// template would block the repository's own pull requests. So: write the
// packaged template only where the host would resolve none, and otherwise
// merge only the gated sections the file does not already satisfy into a
// REDLINE marker block, leaving every other byte alone.
function mergeTemplate(cwd: string, relPath: string, packaged: string, check: boolean): TemplateMerge {
  const target = join(cwd, relPath);
  const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (existing === null) {
    return { path: relPath, changed: syncFile(cwd, relPath, packaged, check), detail: `wrote ${relPath}` };
  }

  // Throws on a half-edited marker pair, or on markers hidden below an unclosed
  // code fence, rather than guessing which span is Redline's — see
  // cli/render/markers.ts. Nothing is written on that path.
  const span = findBlock(existing, relPath);
  if (span !== null) {
    // Measured against what the template provides OUTSIDE the block, never the
    // whole file. Refreshing with every gated section unconditionally put
    // Redline's own `## Launch readiness` inside the block while the
    // repository's stayed outside it, and the gate's awk enforces both — so the
    // second run broke a repository the first run had merged correctly.
    const outside = existing.slice(0, span.start) + existing.slice(span.stop + END.length);
    const wanted = GATED_SECTIONS.filter((section) => !section.satisfied(outside)).map(
      (section) => section.heading
    );
    if (wanted.length === 0) {
      return {
        path: relPath,
        changed: false,
        detail: `${relPath} satisfies the gate outside the Redline block — left untouched`,
      };
    }
    const contents = wrapBlock(existing, gatedSections(packaged, blockSections(wanted)), relPath);
    const changed = syncFile(cwd, relPath, contents, check);
    return {
      path: relPath,
      changed,
      detail: changed
        ? `refreshed the Redline block in ${relPath}`
        : `${relPath} is already up to date`,
    };
  }

  const missing = GATED_SECTIONS.filter((section) => !section.satisfied(existing)).map(
    (section) => section.heading
  );
  if (missing.length === 0) {
    // Also where a repository onboarded before the packaged template carried
    // markers lands: its marker-less file already answers both gate jobs, so it
    // keeps what it has and Redline never rewrites it.
    return {
      path: relPath,
      changed: false,
      detail: `${relPath} already satisfies the gate on its own — left untouched`,
    };
  }
  // A template this repository wrote for itself is not Redline's to edit, even
  // to make its own gate pass. Redline creates one where the host resolves
  // none, and refreshes a block it put there itself; a file it has never
  // touched it leaves alone and says what that costs, because the checklist job
  // fails a pull request whose body has no `## Launch readiness` and the author
  // deserves to hear that from the install rather than from a red check.
  const absent = missing.map((heading) => `"## ${heading}"`).join(' and ');
  return {
    path: relPath,
    changed: false,
    detail:
      `kept this repository's ${relPath} — Redline did not edit it. It has no ${absent}, ` +
      `so the gate's checklist job will fail until someone adds ${missing.length === 1 ? 'that section' : 'those sections'} ` +
      `or the gate is deselected with: redline init --skip gate`,
  };
}

// The one file `redline init` writes that cannot take the marker-block merge
// the shared markdown artifacts take: appending to YAML gives the workflow a
// second `name:` and `on:` key, and a file that no longer parses runs nothing
// at all. So the only two honest answers here are "replace Redline's own file"
// and "stop" — never "overwrite whatever was there".
//
// Attribution is read from the bytes rather than from the path, because the
// path alone proves nothing and the 2.1 rollout wrote its own caller here,
// which `redline init` exists to migrate. Deliberately generous: the
// false-negative direction destroys a repository's file, and the
// false-positive direction only replaces something that already carries
// Redline's name at Redline's path.
const CALLER_PATH = '.github/workflows/redline.yml';
// Positive attribution, not a substring test. Almost every workflow a human
// writes at a path called `redline.yml` says "redline" somewhere — in `name:`,
// in a job id, in a `run:` line — so matching the word protected only the
// repository that never mentioned it, and clobbered the ones that did. Two
// things are Redline's own: the reusable-workflow reference every v3 caller
// carries (the same contract cli/commands/init.ts's V3_CALLER reads to tell a
// v3 repository from a 2.1 one), and the ownership line templates/redline.yml
// now opens with. A 2.1 caller carries neither, and no fixture of the real
// thing exists to pin, so it is refused rather than guessed at — `adoptCaller`
// is where that decision belongs.
const MANAGED_BY_REDLINE = /^#[ \t]*Managed by Redline\b/m;
const USES_REDLINE_GATE = /\.github\/workflows\/redline-gate\.yml@/;

function refuseForeignCaller(cwd: string, opts: GateOptions): void {
  if (opts.adoptCaller === true) return;
  const target = join(cwd, CALLER_PATH);
  if (!existsSync(target)) return;
  const existing = readFileSync(target, 'utf8');
  if (MANAGED_BY_REDLINE.test(existing) || USES_REDLINE_GATE.test(existing)) return;
  throw new RedlineError(
    'failed',
    `${CALLER_PATH} already exists in this repository and carries nothing that attributes it to ` +
      'Redline, so installing the merge gate there would destroy it. Nothing was written',
    'If that workflow is already this repository\'s merge gate, re-run with --skip gate and Redline ' +
      'will leave it in charge. Otherwise move or rename it and re-run redline init — or, if it is a ' +
      'Redline 2.1 caller this run should replace, re-run with --adopt-caller. Redline cannot merge ' +
      'into it the way it merges into a markdown file: a second `name:` and `on:` key would stop the ' +
      'workflow running at all.'
  );
}

function syncPullRequestTemplate(
  cwd: string,
  defaultPath: string,
  packaged: string,
  check: boolean
): { files: string[]; changed: boolean; detail: string } {
  const results = [mergeTemplate(cwd, findPullRequestTemplate(cwd) ?? defaultPath, packaged, check)];
  const details = [results[0]?.detail ?? ''];

  const files = results.filter((result) => result.changed).map((result) => result.path);
  return { files, changed: files.length > 0, detail: details.join('; ') };
}

function buildRules(policy: MergePolicy): unknown[] {
  const rules: unknown[] = [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: policy.requiredApprovals,
        dismiss_stale_reviews_on_push: policy.dismissStaleReviews,
        require_code_owner_review: policy.requireCodeOwnerReview,
        require_last_push_approval: true,
        required_review_thread_resolution: policy.requireThreadResolution,
        automatic_copilot_code_review_enabled: true,
        allowed_merge_methods: ['squash', 'merge'],
      },
    },
  ];
  if (policy.blocking) {
    // The check name is this adapter's own, exactly as Azure's status policy
    // uses AZURE_STATUS_NAME/GENRE. It previously came from
    // policy.requiredChecks, which cli/commands/init.ts passes empty — so
    // `redline init --blocking` published a blocking ruleset that required
    // nothing at all.
    rules.push({
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        do_not_enforce_on_create: false,
        required_status_checks: [{ context: REQUIRED_CHECK }],
      },
    });
  }
  return rules;
}

export function createGitHubInstall(
  client: GitHubClient,
  gitFor: (cwd: string) => Git
): PlatformInstall {
  const repoPath = (ref: RepoRef): string => `/repos/${ref.org}/${ref.repo}`;

  return {
    async enableSecurityFloor(ref: RepoRef): Promise<SecurityResult> {
      const scanning = await client.rest('PATCH', repoPath(ref), {
        security_and_analysis: {
          secret_scanning: { status: 'enabled' },
          secret_scanning_push_protection: { status: 'enabled' },
        },
      });
      const alerts = await client.rest('PUT', `${repoPath(ref)}/vulnerability-alerts`);
      const fixes = await client.rest('PUT', `${repoPath(ref)}/automated-security-fixes`);

      // Two independent host calls fold into one "dependency-alerts" capability.
      // Combine by outcome severity, not by comparing raw status numbers — see
      // worstOutcome.
      const dependencyAlerts = worstOutcome([
        writeOutcome('dependency-alerts', alerts.status, 'dependabot alerts (vulnerability alerts)'),
        writeOutcome('dependency-alerts', fixes.status, 'dependabot alerts (automated security fixes)'),
      ]);

      return {
        outcomes: [
          writeOutcome('secret-scanning', scanning.status, 'secret scanning'),
          writeOutcome('push-protection', scanning.status, 'secret scanning push protection'),
          dependencyAlerts,
        ],
      };
    },

    async applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult> {
      const existing = await client.rest<unknown>('GET', `${repoPath(ref)}/rulesets`);

      const payload = {
        name: RULESET_NAME,
        target: 'branch',
        enforcement: 'active',
        bypass_actors: [],
        conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
        rules: buildRules(policy),
      };

      let mergePolicy: CapabilityOutcome;
      let policyApplied = false;

      if (!isSuccess(existing.status)) {
        // Denied (401/403) or unsupported (404/422) — never guess whether a
        // Redline ruleset already exists, and never crash on it. Skip the
        // write entirely; onboarding still continues below.
        mergePolicy = outcome('merge-policy', existing.status, 'branch ruleset');
      } else {
        const summaries = parseRulesetSummaries(existing.body);
        if (summaries === null) {
          throw new RedlineError('host', 'GitHub returned an unexpected shape for the rulesets list');
        }
        const mine = summaries.find((r) => r.name === RULESET_NAME);
        const method = mine ? 'PUT' : 'POST';
        const path = mine
          ? `${repoPath(ref)}/rulesets/${mine.id}`
          : `${repoPath(ref)}/rulesets`;
        const applied = await client.rest(method, path, payload);
        if (applied.status === 422) {
          // A rejected ruleset payload is a Redline bug or a repo-settings
          // conflict — surfacing it as "unsupported" would leave the repo
          // silently policy-less with exit 0.
          throw new RedlineError(
            'host',
            `GitHub rejected the Redline ruleset payload (HTTP 422 on ${method} ${path})`
          );
        }
        mergePolicy = writeOutcome('merge-policy', applied.status, 'branch ruleset');
        policyApplied = isSuccess(applied.status);
      }

      const property = await client.rest('PATCH', `${repoPath(ref)}/properties/values`, {
        properties: [{ property_name: 'redline', value: 'onboarded' }],
      });

      return {
        outcomes: [
          mergePolicy,
          outcome('repo-property', property.status, 'repository property "redline=onboarded"'),
        ],
        policy: policyApplied ? policy : null,
      };
    },

    async installGate(
      ref: RepoRef,
      cwd: string,
      opts: GateOptions,
      check = false
    ): Promise<InstallResult> {
      const files: string[] = [];
      refuseForeignCaller(cwd, opts);
      const caller = readFileSync(join(PACKAGE_ROOT, 'templates/redline.yml'), 'utf8')
        .replaceAll('<org>', ref.org)
        .replace(/adr-diff-threshold: \d+/, `adr-diff-threshold: ${opts.adrDiffThreshold}`)
        .replace(
          /fail-on-dependency-severity: \w+/,
          `fail-on-dependency-severity: ${opts.failOnDependencySeverity}`
        )
        .replace(/soft-fail-labels: .+/, `soft-fail-labels: ${opts.softFailLabels.join(',')}`)
        .replace(/rung: \w[\w-]*/, `rung: ${opts.rung ?? 'observe'}`);
      if (syncFile(cwd, '.github/workflows/redline.yml', caller, check)) {
        files.push('.github/workflows/redline.yml');
      }

      // Read from templates/, never from this repository's own .github/:
      // .github/ is deliberately outside package.json "files" (shipping it
      // would push Redline's own CI workflows into every consumer), so a
      // template read from there is absent in the published tarball and the
      // throw lands after the workflow above has already been written.
      const template = readFileSync(
        join(PACKAGE_ROOT, 'templates/github/pull_request_template.md'),
        'utf8'
      );
      const prTemplate = syncPullRequestTemplate(
        cwd,
        '.github/pull_request_template.md',
        template,
        check
      );
      files.push(...prTemplate.files);

      if (check) return { files, outcomes: [] };

      // Deselected: not attempted, and no outcome either. An outcome for work
      // that never happened is how a deliberate choice gets read back as a
      // capability that failed.
      const labelOutcomes: CapabilityOutcome[] = [];
      for (const label of opts.manageLabels === false ? [] : GATE_LABELS) {
        const res = await client.rest('POST', `${repoPath(ref)}/labels`, label);
        labelOutcomes.push(
          res.status === 422
            ? { capability: 'labels', status: 'already', detail: `label "${label.name}" already exists` }
            : outcome('labels', res.status, `label "${label.name}"`)
        );
      }

      return {
        files,
        outcomes: [
          ...(labelOutcomes.length > 0 ? [worstOutcome(labelOutcomes)] : []),
          {
            capability: 'gate',
            status: prTemplate.changed ? 'applied' : 'already',
            detail: prTemplate.detail,
          },
        ],
      };
    },

    async ensureReviewOwnership(
      ref: RepoRef,
      cwd: string,
      rules: OwnershipRule[],
      check = false
    ): Promise<InstallResult> {
      const candidates = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
      if (candidates.some((p) => existsSync(join(cwd, p)))) {
        return {
          files: [],
          outcomes: [
            {
              capability: 'review-ownership',
              status: 'already',
              detail: 'this repository already has a CODEOWNERS file — left untouched',
            },
          ],
        };
      }
      const body = rules.map((r) => `${r.pattern} ${r.owners.join(' ')}`).join('\n');
      // No candidate exists (checked above), so this always writes — `check`
      // is what holds the write back on a dry run.
      syncFile(cwd, '.github/CODEOWNERS', `# Managed by Redline.\n\n${body}\n`, check);
      return {
        files: ['.github/CODEOWNERS'],
        outcomes: [
          { capability: 'review-ownership', status: 'applied', detail: 'seeded .github/CODEOWNERS' },
        ],
      };
    },

    async openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef | null> {
      const git = gitFor(cwd);
      // `git commit -m` commits the WHOLE index, so anything the user staged
      // before running redline would be swept into the onboarding PR.
      // Refusing beats `commit -- <paths>`: a partial-index commit surprises
      // in the opposite direction.
      if (git.hasStagedChanges()) {
        throw new RedlineError(
          'usage',
          'this repository already has staged changes',
          'commit or unstage them first, then re-run — redline will not sweep them into its onboarding pull request'
        );
      }
      const originalBranch = git.currentBranch();
      git.checkoutNewBranch(change.branch);
      let gitFailed = false;
      try {
        // Stage only what Redline itself wrote — never sweep in pre-existing
        // dirty or untracked state from the working tree (decision 6: no
        // customer secret is ever committed by this tool).
        git.stagePaths(change.files);
        if (!git.hasStagedChanges()) {
          // Already onboarded and nothing changed: a legitimate no-op, not
          // an error — the caller reports it instead of a pull request.
          return null;
        }
        git.commit(change.title);
        git.push(change.branch);
      } catch (error) {
        gitFailed = true;
        throw error;
      } finally {
        // Leave the operator on their own branch, never on redline/onboard.
        // When a git step failed its error already says where the work sits,
        // and a failed restore must not mask it.
        try {
          git.checkoutBranch(originalBranch);
        } catch (restoreError) {
          if (!gitFailed) throw restoreError;
        }
      }

      const created = await client.rest<unknown>(
        'POST',
        `${repoPath(ref)}/pulls`,
        { title: change.title, body: change.body, head: change.branch, base: ref.defaultBranch }
      );
      const pr = isSuccess(created.status) ? parseCreatedPullRequest(created.body) : null;
      if (!pr) {
        throw new RedlineError('host', `could not open a pull request (HTTP ${created.status})`);
      }
      if (change.labels.length > 0) {
        await client.rest('POST', `${repoPath(ref)}/issues/${pr.number}/labels`, {
          labels: change.labels,
        });
      }
      return pr;
    },
  };
}
