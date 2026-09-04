import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isRedlineError, RedlineError } from '../core/errors.ts';
import { METRICS_COMMANDS, REGISTRY_COMMAND, resolveArgv, resolveEnv, type CommandSpec } from './options.ts';

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
  const label = name === 'registry' ? 'registry' : `metrics ${name}`;
  // Both paths validate through the same table. Which one a runner takes is a
  // fact about that runner, never a difference in what the user may type.
  const resolved = resolveEnv(spec, opts.flags, env, label);
  const argv = spec.argv ? resolveArgv(spec, opts.flags, env, label) : null;

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

  // A runner that parses its own argv reads process.argv, so it is set the way
  // node would have: [execPath, script, ...flags].
  const savedArgv = process.argv;
  if (argv) process.argv = [process.argv[0] ?? 'node', script, ...argv];
  try {
    const load = opts.load ?? ((path: string) => import(pathToFileURL(path).href));
    await load(script);
  } catch (error) {
    if (isRedlineError(error)) throw error;
    // A runner that throws is reporting a real failure of the work — a bad
    // credential, an unreachable host, a malformed data file. Letting it reach
    // the CLI's catch-all would print "redline failed unexpectedly", which tells
    // a reader the tool is broken when the token is.
    const message = error instanceof Error ? error.message : String(error);
    throw new RedlineError(
      'host',
      `redline ${name} failed: ${message.split('\n')[0]}`,
      /401|403|bad credentials/i.test(message)
        ? 'check the token — most of these commands need org read access'
        : undefined
    );
  } finally {
    process.argv = savedArgv;
  }
}
