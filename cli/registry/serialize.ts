import { RedlineError } from '../core/errors.ts';
import type { Registry, RegistryEntry } from './types.ts';

const byOrgThenRepo = (a: RegistryEntry, b: RegistryEntry): number =>
  a.org.localeCompare(b.org) || a.repo.localeCompare(b.repo);

// The register is committed on a schedule. Unordered entries would rewrite the
// file on every run and make each diff unreadable, so ordering is part of the
// format, not a presentation choice.
export function serializeRegistry(registry: Registry): string {
  const ordered: Registry = {
    generatedAt: registry.generatedAt,
    source: registry.source,
    entries: [...registry.entries].sort(byOrgThenRepo),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function parseRegistry(raw: string): Registry {
  const bad = (what: string): never => {
    throw new RedlineError('failed', `registry.json is invalid: ${what}`);
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return bad('not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return bad('expected an object');
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o['generatedAt'] !== 'string') return bad('generatedAt must be a string');
  if (typeof o['source'] !== 'string') return bad('source must be a string');
  if (!Array.isArray(o['entries'])) return bad('entries must be an array');

  return {
    generatedAt: o['generatedAt'],
    source: o['source'],
    entries: o['entries'] as RegistryEntry[],
  };
}
