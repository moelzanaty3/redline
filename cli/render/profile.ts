import type { Manifest } from './manifest.ts';
import { RedlineError } from '../core/errors.ts';

export interface ResolvedProfile {
  profile: string;
  stacks: string[];
}

/**
 * Resolve one profile, or several, into the stacks they render.
 *
 * A profile is a named bundle of stacks, and plenty of repositories are more
 * than one bundle: a React application with its own Terraform beside it is
 * `web,infra` and was previously forced to pick the half that fitted worst.
 * So `name` may be a comma-separated list, and the result is the union.
 *
 * This deliberately needs no change to `.redline.json`: `profile` stays a
 * single string there, it just may now read `infra,web`. Every reader already
 * hands that string straight back to this function — `managedPaths`, `render`,
 * `review`'s scope, `remove`'s plan — so nothing else has to learn a new shape,
 * and a config written by an older CLI resolves exactly as it did.
 *
 * The recorded name is SORTED and de-duplicated. `web,infra` and `infra,web`
 * name the same repository and must produce the same artifacts, or
 * `redline verify`'s artifacts-current finding would flap between two runs that
 * chose the same thing in a different order.
 */
export function resolveProfile(manifest: Manifest, name: string): ResolvedProfile {
  const requested = name
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (requested.length === 0) {
    throw new RedlineError(
      'usage',
      `no profile given. Known: ${Object.keys(manifest.profiles).join(', ')}`,
      'name one, or several separated by commas: --profile web,infra'
    );
  }

  const keys: string[] = [];
  for (const part of requested) {
    const key = manifest.profileAliases[part] ?? part;
    if (!manifest.profiles[key]) {
      throw new RedlineError(
        'usage',
        `unknown profile "${part}". Known: ${Object.keys(manifest.profiles).join(', ')} ` +
          `(aliases: ${Object.keys(manifest.profileAliases).join(', ')})`
      );
    }
    if (!keys.includes(key)) keys.push(key);
  }
  keys.sort();

  const out: string[] = [];
  const visit = (id: string, from: string): void => {
    const stack = manifest.stacks[id];
    if (!stack) {
      throw new RedlineError('usage', `profile "${from}" references unknown stack "${id}"`);
    }
    for (const parent of stack.extends ?? []) visit(parent, from);
    if (!out.includes(id)) out.push(id);
  };
  for (const key of keys) {
    for (const id of manifest.profiles[key]!) visit(id, key);
  }

  return { profile: keys.join(','), stacks: out };
}
