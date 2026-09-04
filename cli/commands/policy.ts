import { readFileSync } from 'node:fs';
import { RedlineError } from '../core/errors.ts';
import { SEVERITY_RANK, type Severity } from '../core/severity.ts';
import { loadManifest } from '../render/manifest.ts';
import { parseDiff } from '../policy/diff.ts';
import { formatFinding, runChecks, type PolicyFinding } from '../policy/checks.ts';

export interface PolicyOptions {
  root: string;
  // A unified diff. A file, not stdin, for the same reason the exemption body is
  // a file: the gate has it on disk already and passing it through a shell is
  // avoidable risk.
  diffFile: string;
  // Severity at or above which the command exits non-zero.
  failOn?: Severity;
}

export interface PolicyReport {
  findings: PolicyFinding[];
  evaluated: string[];
  // Rules the manifest classifies deterministic but which have no implementation.
  // Reported, and separately a build failure in scripts/validate.mjs — a rule
  // classified as machine-checked and then checked by nobody is worse than one
  // left to the model, because everyone believes it is covered.
  unimplemented: string[];
  ok: boolean;
}

export function policy(opts: PolicyOptions): PolicyReport {
  let diff: string;
  try {
    diff = readFileSync(opts.diffFile, 'utf8');
  } catch (error) {
    throw new RedlineError(
      'usage',
      `cannot read the diff from ${opts.diffFile}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const manifest = loadManifest(opts.root);
  const classified = manifest.deterministic ?? [];
  const added = parseDiff(diff);
  const { findings, evaluated } = runChecks(
    { added, files: [...new Set(added.map((a) => a.file))], body: '' },
    classified
  );

  const unimplemented = classified.filter((id) => !evaluated.includes(id));
  const failOn = opts.failOn ?? 'BLOCKER';
  const ok = !findings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[failOn]);

  return { findings, evaluated, unimplemented, ok };
}

export { formatFinding };
