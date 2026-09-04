import { readFileSync } from 'node:fs';
import { RedlineError } from '../core/errors.ts';
import { covers, parseExemption, type Exemption } from '../exempt/parse.ts';

export interface ExemptOptions {
  // Path to a file holding the pull request body. A file rather than an
  // argument: a pull request body contains newlines, quotes and backticks, and
  // passing it through a shell argument is how a body with a backtick becomes a
  // command.
  bodyFile: string;
  // The failing check this exemption is being asked to cover.
  scope?: string;
  now?: Date;
}

export interface ExemptReport {
  exemption: Exemption | null;
  applies: boolean;
  messages: string[];
}

// Decide whether a pull request carries a valid exemption for a named check.
//
// The gate calls this instead of re-implementing the parse in shell. Two
// independent readings of the same block would eventually disagree, and the
// disagreement would be a pull request the gate exempts and the audit does not —
// or worse, the reverse.
export function exempt(opts: ExemptOptions): ExemptReport {
  let body: string;
  try {
    body = readFileSync(opts.bodyFile, 'utf8');
  } catch (error) {
    throw new RedlineError(
      'usage',
      `cannot read the pull request body from ${opts.bodyFile}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const { exemption, problems } = parseExemption(body, opts.now ?? new Date());
  if (!exemption) {
    return {
      exemption: null,
      applies: false,
      messages: problems.map((p) => p.detail),
    };
  }

  const scope = opts.scope;
  if (scope && !covers(exemption, scope)) {
    return {
      exemption,
      applies: false,
      messages: [
        `the exemption covers ${exemption.scope.join(', ')} — it does not cover "${scope}". ` +
          'Widen its scope deliberately, or fix the check.',
      ],
    };
  }

  return {
    exemption,
    applies: true,
    messages: [
      `exempt until ${exemption.until} (${exemption.scope.join(', ')}): ${exemption.reason}`,
    ],
  };
}
