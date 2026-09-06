import { execFileSync } from 'node:child_process';
import { RedlineError } from '../../core/errors.ts';
import { createHttp, type FetchLike, type HttpResponse } from '../http.ts';

export const DEFAULT_API_VERSION = '7.1';
const AZURE_DEVOPS_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';

export interface AzureCredential {
  scheme: 'Basic' | 'Bearer';
  value: string;
}

const readAzTokenFromCli = (): string => {
  const raw = execFileSync(
    'az',
    ['account', 'get-access-token', '--resource', AZURE_DEVOPS_RESOURCE, '--query', 'accessToken', '-o', 'tsv'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return raw.trim();
};

export function resolveAzureCredential(
  env: NodeJS.ProcessEnv,
  readAzToken: () => string = readAzTokenFromCli
): AzureCredential {
  const pat = env['AZURE_DEVOPS_EXT_PAT'];
  if (pat) return { scheme: 'Basic', value: Buffer.from(`:${pat}`, 'utf8').toString('base64') };

  const system = env['SYSTEM_ACCESSTOKEN'];
  if (system) return { scheme: 'Bearer', value: system };

  try {
    const token = readAzToken();
    if (token) return { scheme: 'Bearer', value: token };
  } catch {
    // The az CLI's own error (missing binary, not logged in, etc.) is never
    // surfaced here — it could carry account or environment details. Fall
    // through to the generic, actionable error below.
  }

  throw new RedlineError(
    'permission',
    'no Azure DevOps credentials found — set AZURE_DEVOPS_EXT_PAT, or run: az login',
    'set AZURE_DEVOPS_EXT_PAT, or run: az login'
  );
}

export interface AzureRequestOptions {
  host?: 'core' | 'advsec';
  apiVersion?: string;
}

export interface AzureClient {
  request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: AzureRequestOptions
  ): Promise<HttpResponse<T>>;
}

export interface AzureClientOptions {
  credential?: AzureCredential;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export function createAzureClient(org: string, opts: AzureClientOptions = {}): AzureClient {
  const env = opts.env ?? process.env;
  const credential = opts.credential ?? resolveAzureCredential(env);
  const headers = {
    authorization: `${credential.scheme} ${credential.value}`,
    accept: 'application/json',
    'user-agent': 'redlinegate',
  };
  const httpOptions = {
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
  };
  const hosts = {
    core: createHttp(`https://dev.azure.com/${org}`, headers, httpOptions),
    advsec: createHttp(`https://advsec.dev.azure.com/${org}`, headers, httpOptions),
  };

  return {
    request<T>(method: string, path: string, body?: unknown, requestOpts: AzureRequestOptions = {}) {
      const version = requestOpts.apiVersion ?? DEFAULT_API_VERSION;
      const separator = path.includes('?') ? '&' : '?';
      return hosts[requestOpts.host ?? 'core'].request<T>(
        method,
        `${path}${separator}api-version=${version}`,
        body
      );
    },
  };
}
