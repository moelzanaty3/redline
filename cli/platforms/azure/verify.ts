import { RedlineError } from '../../core/errors.ts';
import type {
  CapabilityOutcome,
  MergePolicy,
  PlatformVerify,
  PolicySetting,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { AzureClient } from './client.ts';
import {
  AZURE_BUILD_POLICY_DISPLAY_NAME,
  AZURE_STATUS_GENRE,
  AZURE_STATUS_NAME,
  POLICY_TYPE_NAMES,
  REDLINE_POLICY_MARKER,
  resolvePolicyTypeIds,
} from './policy-types.ts';
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

      // The gate's Build Validation policy — what actually queues the gate
      // pipeline, since Azure Repos ignores YAML `pr:` triggers. Matched by
      // the Redline: displayName marker, never by type alone: a repository
      // routinely carries human-owned build policies of the same type.
      const gateBuild = mine.find((c) => {
        const displayName = c.settings['displayName'];
        return (
          c.type.id === types[POLICY_TYPE_NAMES.build] &&
          typeof displayName === 'string' &&
          displayName.startsWith(REDLINE_POLICY_MARKER)
        );
      });

      const genre = status?.settings['statusGenre'];
      const statusName = status?.settings['statusName'];
      // Mirrors the GitHub adapter: an advisory gate requires nothing, so
      // required checks are derived only from a blocking status policy.
      const requiredChecks =
        status !== undefined && status.isBlocking && typeof genre === 'string' && typeof statusName === 'string'
          ? [`${genre}/${statusName}`]
          : [];

      const minimumApproverCount = reviewers?.settings['minimumApproverCount'];

      // What this host cannot say is Redline's own. `applyPolicy` writes no
      // required-reviewers policy at all here — Azure has no CODEOWNERS-driven
      // reviewer requirement — so `requireCodeOwnerReview` read off this host
      // is never evidence about Redline's install. The reviewer count and
      // comment resolution are Redline's only while the policy carrying them
      // carries the Redline: marker; where a human already owned that control,
      // init reported it and wrote nothing, and holding the repository to a
      // value Redline never set would fail it on every pull request forever.
      const ownsSetting = (config: PolicyConfiguration | undefined): boolean => {
        const displayName = config?.settings['displayName'];
        return typeof displayName === 'string' && displayName.startsWith(REDLINE_POLICY_MARKER);
      };
      const unownedSettings: PolicySetting[] = ['requireCodeOwnerReview'];
      if (!ownsSetting(reviewers)) unownedSettings.push('requiredApprovals');
      if (!ownsSetting(comments)) unownedSettings.push('requireThreadResolution');

      // A blocking Status policy with nothing to queue the pipeline reads as
      // advisory above, which on its own tells an operator the opposite of
      // what they need: the Status policy is the part that is right, and the
      // missing Build Validation policy is why no pull request can ever
      // satisfy it.
      const advisoryReason =
        status?.isBlocking === true && gateBuild === undefined
          ? `the ${AZURE_STATUS_GENRE}/${AZURE_STATUS_NAME} status policy is blocking, but no ` +
            `"${AZURE_BUILD_POLICY_DISPLAY_NAME}" Build Validation policy queues the gate pipeline ` +
            `(Azure Repos ignores the YAML pr: trigger), so the status is never published and every ` +
            `pull request will sit blocked — re-run redline init with build administrator rights`
          : null;

      return {
        requiredApprovals: typeof minimumApproverCount === 'number' ? minimumApproverCount : 0,
        dismissStaleReviews: reviewers?.settings['resetOnSourcePush'] === true,
        requireCodeOwnerReview: byType(POLICY_TYPE_NAMES.requiredReviewers) !== undefined,
        requireThreadResolution: comments?.isEnabled === true,
        requiredChecks,
        // Without the Build Validation policy nothing runs the gate pipeline
        // and redline/gate is never published — a blocking status policy on
        // its own is a misconfiguration, not an enforcing gate.
        blocking: status?.isBlocking === true && gateBuild !== undefined,
        unownedSettings,
        ...(advisoryReason !== null ? { advisoryReason } : {}),
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
          // Read back off the same flag `enableSecurityFloor` records it from:
          // dependency scanning is part of Advanced Security, not a separately
          // switched feature, so `advSecEnabled` is the whole answer here.
          {
            capability: 'dependency-alerts',
            status: statusFor(body?.advSecEnabled),
            detail: 'advanced security dependency scanning',
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
