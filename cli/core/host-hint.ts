type Host = 'github' | 'azure';

// The hint half of a host failure.
//
// Around fifteen call sites reported `reading acme/web returned 403` and
// stopped. The status is the diagnosis and the caller almost never knows the
// remedy: 403 on a GitHub API call is nearly always a token scope or an
// organisation SAML authorisation, 5xx is worth retrying and nothing to fix,
// and an unexpected body shape is a bug in this tool rather than anything the
// operator did. Leaving them to work that out from a number is how a solvable
// permission problem becomes a ticket.
//
// Deliberately not a thrower: the message stays at the call site, which is the
// only place that knows what was being attempted.

const GITHUB_SCOPES = 'repo, admin:org and read:org';
const AZURE_SCOPES = 'Code (read & write), Project and team (read) and Advanced Security (read)';

export function hostHint(status: number, host: Host = 'github'): string | undefined {
  if (status === 401) {
    return host === 'github'
      ? 'the credential was rejected — check GH_TOKEN, or run: gh auth login'
      : 'the credential was rejected — check AZURE_DEVOPS_EXT_PAT, or run: az login';
  }
  if (status === 403) {
    // 403 is the one that wastes the most time, because it looks like "you are
    // not allowed" when it is usually "this token was never granted the scope"
    // — and on a SAML organisation, a perfectly scoped token still fails until
    // it is authorised for that org specifically.
    return host === 'github'
      ? `the credential is missing a scope, or is not authorised for this organisation — it needs ${GITHUB_SCOPES}, ` +
          'and on a SAML organisation it must also be authorised for it (Settings → Developer settings → ' +
          'Personal access tokens → Configure SSO)'
      : `the credential is missing a scope — it needs ${AZURE_SCOPES}`;
  }
  if (status === 404) {
    return 'either the repository does not exist under that name, or the credential cannot see it — a token ' +
      'with no access to a private repository gets 404, not 403';
  }
  if (status === 422) {
    return 'the host rejected the request as invalid — this is usually a name that already exists or a ' +
      'setting the plan does not include';
  }
  if (status === 429) {
    return 'rate limited — wait for the window to reset and run it again; nothing is wrong with the setup';
  }
  if (status >= 500) {
    return 'the host is failing, not the request — retry in a few minutes before changing anything';
  }
  return undefined;
}

// An unexpected body is not the operator's problem and should never read as
// though it is. Say whose bug it is and what to attach.
export function shapeHint(what: string): string {
  return `${what} is not the shape this CLI expects — the host changed its API or this is a bug here. ` +
    'Re-run with REDLINE_DEBUG=1 and file the output at github.com/moelzanaty3/redline/issues';
}
