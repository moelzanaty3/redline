import { readFileSync } from 'node:fs';
import { RedlineError } from './errors.ts';

export function parseVersion(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) {
    throw new RedlineError('failed', 'package.json is not a JSON object');
  }
  const version = (raw as Record<string, unknown>)['version'];
  if (typeof version !== 'string') {
    throw new RedlineError('failed', 'package.json is missing a string "version" field');
  }
  return version;
}

const pkg: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export const CLI_VERSION: string = parseVersion(pkg);
