import type { Manifest } from './manifest.ts';

export interface ResolvedProfile {
  profile: string;
  stacks: string[];
}

export function resolveProfile(manifest: Manifest, name: string): ResolvedProfile {
  const key = manifest.profileAliases[name] ?? name;
  const stacks = manifest.profiles[key];
  if (!stacks) {
    throw new Error(
      `unknown profile "${name}". Known: ${Object.keys(manifest.profiles).join(', ')} ` +
        `(aliases: ${Object.keys(manifest.profileAliases).join(', ')})`
    );
  }
  const out: string[] = [];
  const visit = (id: string): void => {
    const stack = manifest.stacks[id];
    if (!stack) throw new Error(`profile "${key}" references unknown stack "${id}"`);
    for (const parent of stack.extends ?? []) visit(parent);
    if (!out.includes(id)) out.push(id);
  };
  stacks.forEach(visit);
  return { profile: key, stacks: out };
}
