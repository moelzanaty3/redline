import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RedlineError } from '../core/errors.ts';
import { METRICS_COMMANDS, REGISTRY_COMMAND, resolveEnv, type CommandSpec } from './options.ts';

export interface RunOptions {
  // The package root. The runners ship inside the package (package.json "files"
  // includes scripts/), so they are located from there and not from dist/ —
  // a path relative to the compiled output would break the moment someone
  // installed the package rather than running from a checkout.
  root: string;
  flags: Record<string, string | boolean | undefined>;
  env?: NodeJS.ProcessEnv;
  // Injected in tests so the dispatch can be asserted without executing a runner
  // that talks to GitHub.
  load?: (path: string) => Promise<unknown>;
}

export function specFor(name: string): CommandSpec {
  if (name === 'registry') return REGISTRY_COMMAND;
  const spec = METRICS_COMMANDS[name];
  if (!spec) {
    throw new RedlineError(
      'usage',
      `unknown metrics command "${name}"`,
      `known: ${Object.keys(METRICS_COMMANDS).join(', ')}`
    );
  }
  return spec;
}

/**
 * Validate the flags, then run the runner in this process.
 *
 * The runner reads its configuration from the environment, which is the contract
 * it already documents. This layer is its front door: it decides what is valid,
 * says so in `--help`, and refuses before anything runs — rather than letting a
 * missing token surface as a 401 halfway through an org walk.
 */
export async function runMetrics(name: string, opts: RunOptions): Promise<void> {
  const spec = specFor(name);
  const env = opts.env ?? process.env;
  const resolved = resolveEnv(spec, opts.flags, env, name === 'registry' ? 'registry' : `metrics ${name}`);

  const script = join(opts.root, spec.script);
  if (!existsSync(script) && !opts.load) {
    throw new RedlineError(
      'failed',
      `${spec.script} is missing from this installation`,
      'reinstall redline-cli — the runners ship inside the package'
    );
  }

  // Applied to the real environment because the runner reads process.env
  // directly. Scoped to this process, which lives for exactly one command.
  for (const [key, value] of Object.entries(resolved)) process.env[key] = value;

  const load = opts.load ?? ((path: string) => import(pathToFileURL(path).href));
  await load(script);
}
