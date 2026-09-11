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

// What package.json carries between releases: semantic-release stamps the real
// version at publish time, so a CLI running from a checkout reports this. Any
// artifact that pins the CLI has to recognise it, or a development run writes
// `redlinegate@0.0.0-development` into a real repository's gate — a pin to a
// version npm has never heard of, which fails every pull request it reaches.
export const UNPUBLISHED_VERSION = '0.0.0-development';
