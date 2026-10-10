/**
 * The oldest Node this CLI runs on, kept in one place.
 *
 * `package.json` → `engines.node` is the declaration npm reads, and it does not
 * enforce anything: `npx redlinegate init` under Node 18 prints an EBADENGINE
 * *warning* and runs the tool anyway. Whatever breaks then breaks somewhere
 * inside a dependency, on a repository the operator is in the middle of
 * changing, with an error that names neither Node nor Redline.
 *
 * So the number lives here, `scripts/validate.mjs` holds it to the manifest,
 * and `assertSupportedNode` turns the warning into a refusal.
 */
//
// 18.11, not 22: the CLI has no runtime dependencies, and what it needs from
// Node is global `fetch` (18), `util.parseArgs` and that function's `default`
// option, which arrived in 18.11 — before it, every flag default is silently
// dropped. Its output on 18.13, 20 and 22 was compared byte for byte. A
// repository pinned to an old Node is common, so the floor is the lowest one
// the code actually needs, not the newest one it was developed on.
export const REQUIRED_NODE = { major: 18, minor: 11 } as const;
export const REQUIRED_NODE_LABEL = `${REQUIRED_NODE.major}.${REQUIRED_NODE.minor}`;

// What the escape hatches run under: any current LTS works, and naming one is
// what makes the hint pasteable.
const SUGGESTED_NODE_MAJOR = 22;

export interface NodeSupport {
  readonly ok: boolean;
  readonly major: number | null;
}

export function nodeSupport(version: string): NodeSupport {
  const [majorText, minorText] = version.replace(/^v/, '').split('.');
  const major = Number.parseInt(majorText ?? '', 10);
  const minor = Number.parseInt(minorText ?? '0', 10);
  // An unparseable version is not a refusal. Redline is not the tool that gets
  // to stop someone's work over a runtime string it did not recognise, and a
  // future format this predates would otherwise brick every command.
  if (!Number.isFinite(major)) return { ok: true, major: null };
  const ok =
    major > REQUIRED_NODE.major ||
    (major === REQUIRED_NODE.major && (!Number.isFinite(minor) || minor >= REQUIRED_NODE.minor));
  return { ok, major };
}

/**
 * The message a too-old Node gets. Returned rather than thrown so the caller
 * owns the exit code and the sink.
 *
 * Names the escape hatches by tool, because the repository is usually pinned on
 * purpose — "upgrade Node" is advice the operator is not free to take, and a
 * fix nobody can apply reads as the tool refusing to work at all.
 */
export function unsupportedNodeMessage(version: string): string {
  return (
    `Redline needs Node ${REQUIRED_NODE_LABEL} or later, and this is ${version}. ` +
    'npm only warns about that, so the run would have failed later and somewhere less obvious.'
  );
}

export function unsupportedNodeHint(command = 'init'): string {
  // The command the operator actually typed, not a generic `init`. Advice that
  // silently swaps out the verb reads as boilerplate and gets skipped; the
  // point is that it can be pasted.
  return (
    'run it under a newer Node without changing your pin:\n' +
    `  volta run --node ${SUGGESTED_NODE_MAJOR} -- npx redlinegate ${command}\n` +
    `  fnm exec --using ${SUGGESTED_NODE_MAJOR} npx redlinegate ${command}\n` +
    `  nvm exec ${SUGGESTED_NODE_MAJOR} npx redlinegate ${command}`
  );
}
