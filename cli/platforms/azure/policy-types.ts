import type { AzureClient } from './client.ts';
import { isNonNullObject, isSuccess } from '../shape.ts';

// CONTRACT: the gate pipeline (platforms/azure/gate-template.yml) publishes a
// pull-request status with this genre and name. The Status policy this file
// helps configure must require exactly that pair — see resolvePolicyTypeIds.
export const AZURE_STATUS_GENRE = 'redline';
export const AZURE_STATUS_NAME = 'gate';

export const POLICY_TYPE_NAMES = {
  minimumReviewers: 'Minimum number of reviewers',
  comments: 'Comment requirements',
  status: 'Status',
  requiredReviewers: 'Required reviewers',
} as const;

/**
 * Well-known Azure DevOps policy type ids, used only when the live lookup is
 * unavailable. Verify these against `GET {project}/_apis/policy/types` on the
 * pilot organisation before relying on the fallback path.
 */
export const POLICY_TYPE_FALLBACK: Record<string, string> = {
  'Minimum number of reviewers': 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd',
  'Comment requirements': 'c6a1889d-b943-4856-b76f-9e46bb6b0df2',
  Status: 'cbdc66da-9728-4af8-aada-9a5a32e4a226',
  'Required reviewers': 'fd2167ab-b0be-447a-8ec8-39368250530e',
};

interface PolicyType {
  id: string;
  displayName: string;
}

// The types endpoint response is untrusted external input: narrowed by an
// explicit parse function rather than trusted by shape assertion, and never
// read before the status is confirmed successful (a 403 body is a truthy
// object here too, not an array — `Array.isArray` below is what actually
// protects against it, not `?? []`).
function parsePolicyTypes(body: unknown): PolicyType[] | null {
  if (!isNonNullObject(body) || !Array.isArray(body['value'])) return null;
  const types: PolicyType[] = [];
  for (const item of body['value']) {
    if (!isNonNullObject(item)) return null;
    if (typeof item['id'] !== 'string' || typeof item['displayName'] !== 'string') return null;
    types.push({ id: item['id'], displayName: item['displayName'] });
  }
  return types;
}

/**
 * Resolves each name in POLICY_TYPE_NAMES to the live policy type id for
 * `project`, falling back to POLICY_TYPE_FALLBACK for any name the live
 * lookup does not return (including when the whole call is denied or
 * returns an unexpected shape). The lookup call itself never throws — a
 * 403 here degrades to the fallback guids rather than aborting the caller.
 */
export async function resolvePolicyTypeIds(
  client: AzureClient,
  project: string
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = { ...POLICY_TYPE_FALLBACK };
  const res = await client.request<unknown>('GET', `/${project}/_apis/policy/types`);
  if (!isSuccess(res.status)) return resolved;

  const types = parsePolicyTypes(res.body);
  if (types === null) return resolved;

  for (const type of types) {
    if (type.displayName in resolved) resolved[type.displayName] = type.id;
  }
  return resolved;
}
