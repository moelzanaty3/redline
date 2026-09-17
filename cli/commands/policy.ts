import { readFileSync } from 'node:fs';
import { RedlineError } from '../core/errors.ts';
import { SEVERITY_RANK, type Severity } from '../core/severity.ts';
import { loadManifest } from '../render/manifest.ts';
import { parseDiff } from '../policy/diff.ts';
import { formatFinding, runChecks, type PolicyFinding } from '../policy/checks.ts';
import { loadRules } from '../rules/catalogue.ts';

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
  // Every rule in the catalogue, deterministic or not. Reported so the caller
  // can say what this run could NOT decide: a reader who sees "no deterministic
  // findings" after deliberately committing a hardcoded secret concludes the
  // install is broken, when the truth is that `core/hardcoded-secrets` is real
  // and is reviewed by a model. Silence about the remainder is what makes the
  // wrong conclusion the reasonable one.
  catalogue: number;
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

  return { findings, evaluated, unimplemented, catalogue: loadRules(opts.root).size, ok };
}

export { formatFinding };
