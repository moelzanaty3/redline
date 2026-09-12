import { RedlineError } from '../core/errors.ts';
import type { Host } from './types.ts';

export interface RemoteIdentity {
  host: Host;
  org: string;
  project?: string;
  repo: string;
}

// A remote URL is not safe to print. Git stores credentials inline on an HTTPS
// remote — `https://x-access-token:ghp_…@github.com/org/repo` is what a CI
// checkout and a credential helper both write — and Redline's own
// troubleshooting page tells a reader to paste command output into an issue.
// Anything that puts a remote in front of a human goes through this first.
export function redactRemote(url: string): string {
  // Userinfo is everything between the scheme and the "@" that precedes the
  // host. Matched on the raw string rather than via URL parsing because the ssh
  // forms here are not valid URLs and must pass through untouched — `git@host:`
  // carries a username and no secret.
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1<redacted>@');
}

const AZURE_HTTPS = /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;
const AZURE_SSH = /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/;
const AZURE_LEGACY = /^https?:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;
// GitHub is recognised by a hostname *containing* "github" plus a
// two-segment org/repo path — not by URL shape alone. This covers
// github.com and a self-hosted GitHub Enterprise Server whose hostname
// happens to include "github" (e.g. github.acme-corp.net), and rejects
// gitlab.com and other unrelated hosts that share the same path shape.
// A GHES instance on a hostname WITHOUT that substring (e.g.
// git.internal-corp.io) is NOT auto-detected and falls through to the
// "cannot tell which host" error below — telling an arbitrary self-hosted
// GHES apart from any other git-over-HTTPS remote by shape alone is
// underspecified without an allowlist or an explicit hint (out of scope
// here; a `--host` override belongs to the command surface, not this
// pure parser).
const GENERIC_HTTPS = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/;
const GENERIC_SSH = /^(?:ssh:\/\/)?git@([^:/]+)[:/]([^/]+)\/([^/]+?)(?:\.git)?$/;

export function parseRemote(url: string): RemoteIdentity {
  const trimmed = url.trim();
  if (trimmed === '') {
    throw new RedlineError(
      'usage',
      'this repository has no git remote',
      'add one with: git remote add origin <url>'
    );
  }

  for (const pattern of [AZURE_HTTPS, AZURE_SSH, AZURE_LEGACY]) {
    const m = pattern.exec(trimmed);
    if (m) return { host: 'azure', org: m[1]!, project: m[2]!, repo: m[3]! };
  }

  for (const pattern of [GENERIC_SSH, GENERIC_HTTPS]) {
    const m = pattern.exec(trimmed);
    if (m && m[1]!.toLowerCase().includes('github')) {
      return { host: 'github', org: m[2]!, repo: m[3]! };
    }
  }

  throw new RedlineError(
    'usage',
    `cannot tell which host "${redactRemote(trimmed)}" belongs to — recognised shapes: ` +
      'github.com/<org>/<repo> or any "github"-named hostname with that path shape (GitHub Enterprise Server), ' +
      'dev.azure.com/<org>/<project>/_git/<repo>, ssh.dev.azure.com:v3/<org>/<project>/<repo>, ' +
      'and <org>.visualstudio.com/<project>/_git/<repo>',
    'add a github or azure devops remote to continue'
  );
}
