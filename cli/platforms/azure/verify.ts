import { RedlineError } from '../../core/errors.ts';
import type {
  CapabilityOutcome,
  MergePolicy,
  PlatformVerify,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { AzureClient } from './client.ts';
import { POLICY_TYPE_NAMES, resolvePolicyTypeIds } from './policy-types.ts';
import { createHostShapeError, isNonNullObject, isSuccess } from '../shape.ts';

// Azure response bodies are untrusted external input, same house style as
// cli/platforms/github/verify.ts and cli/platforms/azure/install.ts: typed
// `unknown`, narrowed by an explicit parse function, and never read before
// the status is confirmed successful. An Azure error body is a truthy
// object (e.g. `{ message: "Forbidden" }`), not an array — `?? []` never
// fires on it, so shape is verified with `Array.isArray`/`isNonNullObject`,
// not coercion.

const hostShapeError = createHostShapeError('Azure DevOps');

function assertOk(status: number, path: string): void {
  if (!isSuccess(status)) {
    throw new RedlineError('host', `Azure DevOps returned HTTP ${status} reading ${path}`);
  }
}

interface PolicyConfiguration {
  id: number;
  isEnabled: boolean;
  isBlocking: boolean;
  type: { id: string };
  settings: Record<string, unknown>;
}

function parseScopedRepoIds(settings: Record<string, unknown>): string[] {
  const scope = settings['scope'];
  if (!Array.isArray(scope)) return [];
  const ids: string[] = [];
  for (const entry of scope) {
    if (isNonNullObject(entry) && typeof entry['repositoryId'] === 'string') {
      ids.push(entry['repositoryId']);
    }
  }
  return ids;
}

function parsePolicyConfigurations(body: unknown, what: string): PolicyConfiguration[] {
  if (!isNonNullObject(body) || !Array.isArray(body['value'])) throw hostShapeError(what);
  return body['value'].map((item) => {
    if (
      !isNonNullObject(item) ||
      typeof item['id'] !== 'number' ||
      typeof item['isEnabled'] !== 'boolean' ||
      typeof item['isBlocking'] !== 'boolean'
    ) {
      throw hostShapeError(what);
    }
    const type = item['type'];
    if (!isNonNullObject(type) || typeof type['id'] !== 'string') throw hostShapeError(what);
    const settings = item['settings'];
    if (!isNonNullObject(settings)) throw hostShapeError(what);
    return {
      id: item['id'],
      isEnabled: item['isEnabled'],
      isBlocking: item['isBlocking'],
      type: { id: type['id'] },
      settings,
    };
  });
}

interface ReportedStatus {
  genre?: string;
  name: string;
}

function parseStatusList(body: unknown, what: string): ReportedStatus[] {
  if (!isNonNullObject(body) || !Array.isArray(body['value'])) throw hostShapeError(what);
  return body['value'].map((item) => {
    if (!isNonNullObject(item)) throw hostShapeError(what);
    const context = item['context'];
    if (!isNonNullObject(context) || typeof context['name'] !== 'string') throw hostShapeError(what);
    const genre = context['genre'];
    if (genre !== undefined && typeof genre !== 'string') throw hostShapeError(what);
    return { name: context['name'], ...(genre !== undefined ? { genre } : {}) };
  });
}

function parsePullRequestIds(body: unknown, what: string): number[] {
  if (!isNonNullObject(body) || !Array.isArray(body['value'])) throw hostShapeError(what);
  return body['value'].map((item) => {
    if (!isNonNullObject(item) || typeof item['pullRequestId'] !== 'number') throw hostShapeError(what);
    return item['pullRequestId'];
  });
}

interface EnablementBody {
  advSecEnabled?: boolean;
  blockPushes?: boolean;
}

function parseEnablement(body: unknown, what: string): EnablementBody {
  if (!isNonNullObject(body)) throw hostShapeError(what);
  const advSecEnabled = body['advSecEnabled'];
  const blockPushes = body['blockPushes'];
  if (advSecEnabled !== undefined && typeof advSecEnabled !== 'boolean') throw hostShapeError(what);
  if (blockPushes !== undefined && typeof blockPushes !== 'boolean') throw hostShapeError(what);
  return {
    ...(advSecEnabled !== undefined ? { advSecEnabled } : {}),
    ...(blockPushes !== undefined ? { blockPushes } : {}),
  };
}

export function createAzureVerify(client: AzureClient): PlatformVerify {
  const project = (ref: RepoRef): string => {
    if (!ref.project) throw new RedlineError('usage', 'an Azure DevOps repository needs a project');
    return ref.project;
  };
  const repoId = (ref: RepoRef): string => {
    if (!ref.repoId) throw new RedlineError('usage', 'an Azure DevOps repository needs its id');
    return ref.repoId;
  };

  return {
    async readPolicy(ref: RepoRef): Promise<MergePolicy | null> {
      const proj = project(ref);
      const types = await resolvePolicyTypeIds(client, proj);
      const path = `/${proj}/_apis/policy/configurations`;
      const res = await client.request<unknown>('GET', path);
      assertOk(res.status, path);
      const configs = parsePolicyConfigurations(res.body, 'policy configurations');

      const repo = repoId(ref);
      const mine = configs.filter((c) => parseScopedRepoIds(c.settings).includes(repo));
      if (mine.length === 0) return null;

      const byType = (name: string): PolicyConfiguration | undefined =>
        mine.find((c) => c.type.id === types[name]);

      const reviewers = byType(POLICY_TYPE_NAMES.minimumReviewers);
      const comments = byType(POLICY_TYPE_NAMES.comments);
      const status = byType(POLICY_TYPE_NAMES.status);

      const genre = status?.settings['statusGenre'];
      const statusName = status?.settings['statusName'];
      const requiredChecks =
        status !== undefined && typeof genre === 'string' && typeof statusName === 'string'
          ? [`${genre}/${statusName}`]
          : [];

      const minimumApproverCount = reviewers?.settings['minimumApproverCount'];

      return {
        requiredApprovals: typeof minimumApproverCount === 'number' ? minimumApproverCount : 0,
        dismissStaleReviews: reviewers?.settings['resetOnSourcePush'] === true,
        requireCodeOwnerReview: byType(POLICY_TYPE_NAMES.requiredReviewers) !== undefined,
        requireThreadResolution: comments?.isEnabled === true,
        requiredChecks,
        blocking: status?.isBlocking === true,
      };
    },

    async readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]> {
      const path = `/${project(ref)}/_apis/git/repositories/${repoId(ref)}/pullRequests/${pr}/statuses`;
      const res = await client.request<unknown>('GET', path);
      assertOk(res.status, path);
      const statuses = parseStatusList(res.body, 'pull request statuses');
      return statuses.map((s) => (s.genre ? `${s.genre}/${s.name}` : s.name));
    },

    async readSecurityState(ref: RepoRef): Promise<SecurityResult> {
      const path = `/${project(ref)}/_apis/management/repositories/${repoId(ref)}/enablement`;
      const res = await client.request<unknown>('GET', path, undefined, {
        host: 'advsec',
        apiVersion: '7.2-preview.1',
      });

      // Advanced Security is a separately licensed feature: a tenant without
      // it returns 404 here — that is `unsupported`, never `denied`, the
      // same distinction install.ts's enableSecurityFloor draws. A 401/403
      // is a real permission denial and also degrades into a capability
      // outcome. Any other non-2xx (500, 502, a gateway timeout) is a host
      // error, not a finding about the repository, and must not be dressed
      // up as `denied` — that is exactly the status that files pending
      // admin work against a problem that does not exist. Throw, same as
      // assertOk everywhere else in this file.
      const refusal: CapabilityOutcome['status'] | null =
        res.status === 404 ? 'unsupported' : res.status === 401 || res.status === 403 ? 'denied' : null;
      if (refusal === null) assertOk(res.status, path);
      const body = refusal === null ? parseEnablement(res.body, 'a repository enablement') : null;
      const statusFor = (on: boolean | undefined): CapabilityOutcome['status'] =>
        refusal ?? (on === true ? 'applied' : 'denied');

      return {
        outcomes: [
          {
            capability: 'secret-scanning',
            status: statusFor(body?.advSecEnabled),
            detail: 'advanced security secret scanning',
          },
          {
            capability: 'push-protection',
            status: statusFor(body?.blockPushes),
            detail: 'advanced security push protection',
          },
        ],
      };
    },

    async latestPullRequestNumber(ref: RepoRef): Promise<number | null> {
      const path = `/${project(ref)}/_apis/git/repositories/${repoId(ref)}/pullrequests?searchCriteria.status=all&$top=1`;
      const res = await client.request<unknown>('GET', path);
      assertOk(res.status, path);
      const ids = parsePullRequestIds(res.body, 'a pull request list');
      return ids[0] ?? null;
    },
  };
}
