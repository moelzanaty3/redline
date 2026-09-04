export type RedlineErrorKind = 'usage' | 'failed' | 'permission' | 'host';

const EXIT_CODES: Record<RedlineErrorKind, number> = {
  failed: 1,
  usage: 2,
  permission: 3,
  host: 4,
};

export function exitCodeFor(kind: RedlineErrorKind): number {
  return EXIT_CODES[kind];
}

export class RedlineError extends Error {
  readonly kind: RedlineErrorKind;
  readonly exitCode: number;
  readonly hint: string | undefined;

  constructor(kind: RedlineErrorKind, message: string, hint?: string) {
    super(message);
    this.name = 'RedlineError';
    this.kind = kind;
    this.exitCode = exitCodeFor(kind);
    this.hint = hint;
  }
}

export function isRedlineError(e: unknown): e is RedlineError {
  return e instanceof RedlineError;
}
