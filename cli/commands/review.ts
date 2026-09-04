import { readFileSync } from 'node:fs';
import { RedlineError } from '../core/errors.ts';
import { createGit } from '../core/git.ts';
import { readConfig } from '../config/redline-json.ts';
import { loadManifest } from '../render/manifest.ts';
import { loadRuleIds } from '../review/rules.ts';
import { buildPrompt } from '../review/prompt.ts';
import { resolveScope, type Scope } from '../review/scope.ts';
import { parseReview, renderFinding, type ReviewFinding } from '../review/schema.ts';
import type { ReviewEngine } from '../review/engines/types.ts';

export interface ReviewOptions {
  cwd: string;
  root: string;
  // Where the change comes from. Working tree against the merge base by default.
  source?: { kind: 'worktree' } | { kind: 'staged' } | { kind: 'diff-file'; path: string };
  base?: string;
  profile?: string;
}

export interface ReviewReport {
  scope: Scope;
  // Set when the engine handed the prompt back for the caller's own model.
  prompt: string | null;
  note: string | null;
  findings: ReviewFinding[];
  rejected: { raw: unknown; reason: string }[];
  rendered: string[];
  // Always true, and stated in the report rather than assumed by the caller.
  //
  // A local review is opt-in and therefore enforces nothing — the pull request
  // review remains the system of record. Its findings must be excluded from the
  // telemetry that drives rule tuning, or acted-on rate is computed partly from
  // runs nobody can verify: a local run has no thread to resolve, no reviewer to
  // attribute, and no way to tell a finding that was fixed from one the author
  // never read.
  excludedFromTelemetry: true;
}

function readDiff(opts: ReviewOptions): string {
  const source = opts.source ?? { kind: 'worktree' };
  if (source.kind === 'diff-file') {
    try {
      return readFileSync(source.path, 'utf8');
    } catch (error) {
      throw new RedlineError(
        'usage',
        `cannot read the diff from ${source.path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const git = createGit(opts.cwd);
  const base = opts.base ?? git.defaultBranch();
  if (source.kind === 'staged') return git.diffStaged();

  // Against the merge base itself, not `base...HEAD`. The three-dot form diffs
  // two commits, so it cannot see work that is not committed yet — which made
  // the default mode review nothing at all in the case the command exists for:
  // "check this before I commit it". Diffing the working tree against the merge
  // base keeps the property three dots was chosen for (never review commits that
  // landed on the base branch since this one started) and includes uncommitted
  // and staged work as well.
  return git.diff(git.mergeBase(base));
}

export async function review(engine: ReviewEngine, opts: ReviewOptions): Promise<ReviewReport> {
  const diff = readDiff(opts);
  if (diff.trim() === '') {
    throw new RedlineError(
      'usage',
      'there is nothing to review — the diff is empty',
      'stage something, or pass --base to compare against a different branch'
    );
  }

  const manifest = loadManifest(opts.root);
  const config = readConfig(opts.cwd);
  const profile = opts.profile ?? config?.profile;
  if (!profile) {
    throw new RedlineError(
      'usage',
      'no profile: this repository has no .redline.json and none was given',
      'run: npx redline-cli init — or pass --profile <name>'
    );
  }

  const files = [...new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]!))].filter(
    (f) => f !== '/dev/null'
  );
  const scope = resolveScope(manifest, profile, files);
  const prompt = buildPrompt({ root: opts.root, manifest, scope, diff });

  const response = await engine.review({ prompt });
  if (response.kind === 'prompt') {
    return {
      scope,
      prompt: response.prompt,
      note: response.note,
      findings: [],
      rejected: [],
      rendered: [],
      excludedFromTelemetry: true,
    };
  }

  const known = loadRuleIds(opts.root, manifest, scope.stacks);
  const { findings, rejected } = parseReview(response.raw, known);

  return {
    scope,
    prompt: null,
    note: null,
    findings,
    rejected,
    // Rendered by code. The comment contract is never free-typed by a model.
    rendered: findings.map(renderFinding),
    excludedFromTelemetry: true,
  };
}
