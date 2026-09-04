import { parseConfig } from '../config/redline-json.ts';
import type { GitHubClient } from '../platforms/github/client.ts';
import type { RegistryEntry } from './types.ts';

export interface DiscoveryResult {
  entries: RegistryEntry[];
  // A repository the walk could not turn into an entry. Reported, never
  // thrown: one malformed .redline.json in the estate must not cost the whole
  // register.
  problems: string[];
}

interface RepoNode {
  name: string;
  defaultBranchRef: { name: string } | null;
  object: { text?: string } | null;
}

interface OrgPage {
  // repositoryOwner, not organization: the source repository may live under a
  // user account, and `organization(login:)` returns null for one. This query
  // resolves both.
  repositoryOwner: {
    repositories: {
      nodes: RepoNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

export const DISCOVERY_QUERY = `
query($org: String!, $cursor: String) {
  repositoryOwner(login: $org) {
    repositories(first: 100, after: $cursor, isArchived: false, ownerAffiliations: OWNER) {
      nodes {
        name
        defaultBranchRef { name }
        object(expression: "HEAD:.redline.json") { ... on Blob { text } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

// A host that reports hasNextPage: true forever must not hang a nightly job.
// 200 pages of 100 is 20,000 repositories — far past any real estate.
const MAX_PAGES = 200;

export async function discoverGitHub(
  client: Pick<GitHubClient, 'graphql'>,
  org: string,
): Promise<DiscoveryResult> {
  const entries: RegistryEntry[] = [];
  const problems: string[] = [];

  let cursor: string | null = null;
  let pages = 0;

  do {
    const data: OrgPage = await client.graphql<OrgPage>(DISCOVERY_QUERY, { org, cursor });
    const repos = data.repositoryOwner?.repositories;
    if (!repos) {
      problems.push(`${org}: owner not readable with this token`);
      break;
    }

    for (const node of repos.nodes) {
      // No .redline.json is the discovery signal for "not onboarded", not an
      // error: it is why nothing has to write a register on the way in.
      const text = node.object?.text;
      if (!text) continue;
      if (!node.defaultBranchRef) {
        problems.push(`${org}/${node.name}: has .redline.json but no default branch`);
        continue;
      }
      // The estate's own files are external input to this walk, so this is a
      // real boundary and the guard belongs here. Without it one hand-edited
      // config would abort the walk and publish a register missing every
      // repository after it.
      let config;
      try {
        config = parseConfig(JSON.parse(text));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        problems.push(`${org}/${node.name}: ${detail}`);
        continue;
      }
      entries.push({
        host: 'github',
        org,
        repo: node.name,
        defaultBranch: node.defaultBranchRef.name,
        profile: config.profile,
        standardsVersion: config.standardsVersion,
        cliVersion: config.cliVersion,
        onboardedAt: config.onboardedAt,
      });
    }

    cursor = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
    pages += 1;
    if (cursor !== null && pages >= MAX_PAGES) {
      problems.push(`${org}: stopped after ${MAX_PAGES} pages — the register may be incomplete`);
      break;
    }
  } while (cursor !== null);

  return { entries, problems };
}
