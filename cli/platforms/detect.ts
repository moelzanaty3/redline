import { RedlineError } from '../core/errors.ts';
import type { Host } from './types.ts';

export interface RemoteIdentity {
  host: Host;
  org: string;
  project?: string;
  repo: string;
}

const AZURE_HTTPS = /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;
const AZURE_SSH = /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/;
const AZURE_LEGACY = /^https?:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;
// GitHub Enterprise Server lives on a customer domain, so the host segment
// is captured and checked for "github" rather than matched against a fixed
// domain — this is what tells github.acme-corp.net apart from gitlab.com.
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
    `cannot tell which host "${trimmed}" belongs to — redline only recognises github and azure devops remotes`,
    'add a github or azure devops remote to continue'
  );
}
