import { createGit, type Git } from '../core/git.ts';
import { RedlineError } from '../core/errors.ts';
import { parseRemote } from '../platforms/detect.ts';
import { createAzureClient, type AzureClient } from '../platforms/azure/client.ts';
import { createGitHubClient, type GitHubClient } from '../platforms/github/client.ts';
import { RULESET_NAME } from '../platforms/github/install.ts';
import {
  AZURE_STATUS_GENRE,
  AZURE_STATUS_NAME,
  POLICY_TYPE_NAMES,
  REDLINE_POLICY_MARKER,
  resolvePolicyTypeIds,
} from '../platforms/azure/policy-types.ts';
import { isNonNullObject, isSuccess } from '../platforms/shape.ts';
import type { AdminCapability, CapabilityOutcome, Host, RepoRef } from '../platforms/types.ts';

// Withdrawing the host state `redline init` created.
//
// `Platform` (cli/platforms/types.ts) is the install-and-verify port: every
// method on it either creates host state or reads it back, and not one of them
// takes any away. Removal is a third verb with a blast radius neither of the
// other two has, so it gets its own narrow port instead of widening the one
// `init` and `verify` both depend on — a `deleteRuleset` sitting on Platform is
// a method every adapter has to provide and any command can reach by accident.
//
// The rule every operation below is written to, and the reason none of them
// matches on a path or a name alone: ownership is proven from the object itself
// before anything is deleted. Redline's ruleset is the one named `Redline`;
// Redline's labels are the ones still carrying the description the gate install
// wrote; Redline's Azure policies are the ones carrying REDLINE_POLICY_MARKER.
// Everything else on the host belongs to the repository's own team, and is
// reported rather than removed.
//
// The security floor — secret scanning, push protection, dependency alerts — is
// deliberately absent from this file. It is the organisation's minimum, not
// Redline's own state, and there is no code path here that can lower it.

export interface WithdrawalResult {
  outcomes: CapabilityOutcome[];
  // Host state this run deliberately left alone, and why. Never silence: an
  // object left in place that nobody is told about reads as one that was
  // removed.
  notes: string[];
}

export interface HostWithdrawal {
  readonly host: Host;
  withdraw(ref: RepoRef): Promise<WithdrawalResult>;
}

// CONTRACT with GATE_LABELS in cli/platforms/github/install.ts: these are the
// three labels the gate install creates, with the descriptions it gives them.
// The description is what makes deletion safe. `no-adr` carries no Redline
// prefix at all and is exactly the name a team may already have used, and
// GitHub answers the install's POST with 422 either way — so the install
// cannot record whether it created one or found one. The description can still
// answer it: a label still carrying the text Redline wrote is Redline's, and
// one carrying anything else is the repository's own and is left in place.
const REDLINE_LABELS = [
  { name: 'no-adr', description: 'PR intentionally ships without an ADR' },
  { name: 'redline-exempt', description: 'Gate process checks soft-failed with reviewer sign-off' },
  { name: 'redline-sync', description: 'Automated standards sync from the Redline source repo' },
] as const;

// CONTRACT with cli/platforms/github/install.ts's applyPolicy: the property it
// sets. GitHub removes a property value when it is PATCHed as null.
const REPO_PROPERTY = 'redline';

// CONTRACT with GATE_DEFINITION_NAME/FOLDER and GATE_YAML_FILENAME in
// cli/platforms/azure/install.ts. All three together are what
// `ensureGateBuildDefinition` uses to recognise its own definition, and the
// same tuple is what this file reports on.
const AZURE_GATE_DEFINITION = '\\Redline\\redline-gate';

const OUTCOME_RANK: Record<CapabilityOutcome['status'], number> = {
  denied: 4,
  unknown: 3,
  unsupported: 2,
  already: 1,
  applied: 0,
};

// Several host calls fold into one capability the operator reads — three label
// deletions, several Azure policy deletions. Ranked by how actionable the
// status is rather than by HTTP status number, so a definite refusal on one
// call is never masked by a larger number on another. Same table and same
// reasoning as both install adapters.
function worstOutcome(outcomes: CapabilityOutcome[]): CapabilityOutcome {
  const [first, ...rest] = outcomes;
  if (!first) throw new Error('worstOutcome requires at least one outcome');
  return rest.reduce(
    (worst, next) => (OUTCOME_RANK[next.status] > OUTCOME_RANK[worst.status] ? next : worst),
    first
  );
}

// Every DELETE below is issued only after a read confirmed the object is there,
// so a 404 on the delete itself is not "already gone": GitHub answers 404
// rather than 403 on an admin endpoint a fine-grained token cannot reach, the
// same reading writeOutcome takes in cli/platforms/github/install.ts. Reporting
// it as success would tell an operator their ruleset is gone when it is not.
function deleteOutcome(
  capability: AdminCapability,
  status: number,
  detail: string
): CapabilityOutcome {
  if (isSuccess(status)) return { capability, status: 'applied', detail };
  if (status === 401 || status === 403 || status === 404) {
    return { capability, status: 'denied', detail: `${detail} (needs repository admin)` };
  }
  return { capability, status: 'denied', detail: `${detail} (HTTP ${status})` };
}

// A read that did not answer. It cannot be `unknown`: `unknown` never reaches
// pendingAdmin (isPending is exactly `denied`), and a repository whose Redline
// ruleset could not even be listed has host state left behind that somebody has
// to go and remove. The detail says it was the read that failed, so nobody goes
// looking for a delete that was never attempted.
function unreadable(capability: AdminCapability, status: number, what: string): CapabilityOutcome {
  return {
    capability,
    status: 'denied',
    detail:
      `${what} could not be read (HTTP ${status}), so nothing was removed — ` +
      'an administrator has to take it away by hand',
  };
}

interface NamedObject {
  id: number;
  name: string;
}

function parseNamedObjects(body: unknown): NamedObject[] | null {
  if (!Array.isArray(body)) return null;
  const parsed: NamedObject[] = [];
  for (const item of body) {
    if (!isNonNullObject(item) || typeof item['id'] !== 'number' || typeof item['name'] !== 'string') {
      return null;
    }
    parsed.push({ id: item['id'], name: item['name'] });
  }
  return parsed;
}

function parseLabelDescription(body: unknown): string | null {
  if (!isNonNullObject(body)) return null;
  const description = body['description'];
  return typeof description === 'string' ? description : '';
}

export function createGitHubWithdrawal(client: GitHubClient): HostWithdrawal {
  const repoPath = (ref: RepoRef): string => `/repos/${ref.org}/${ref.repo}`;

  async function withdrawRuleset(ref: RepoRef): Promise<CapabilityOutcome> {
    const listed = await client.rest<unknown>('GET', `${repoPath(ref)}/rulesets`);
    if (!isSuccess(listed.status)) {
      return unreadable('merge-policy', listed.status, `the branch rulesets on ${ref.repo}`);
    }
    const rulesets = parseNamedObjects(listed.body);
    if (rulesets === null) {
      throw new RedlineError('host', 'GitHub returned an unexpected shape for the rulesets list');
    }
    // By name, which is the only attribution a ruleset carries. A ruleset a
    // human named anything else is theirs even if it requires the Redline
    // check — that is a policy decision they made, and taking it away is not
    // this command's to do.
    const mine = rulesets.find((ruleset) => ruleset.name === RULESET_NAME);
    if (!mine) {
      return {
        capability: 'merge-policy',
        status: 'already',
        detail: `no ruleset named "${RULESET_NAME}" on this repository — nothing to remove`,
      };
    }
    const deleted = await client.rest('DELETE', `${repoPath(ref)}/rulesets/${mine.id}`);
    return deleteOutcome(
      'merge-policy',
      deleted.status,
      `branch ruleset "${RULESET_NAME}" (and with it the required Redline check)`
    );
  }

  async function withdrawLabels(ref: RepoRef): Promise<{ outcome: CapabilityOutcome; notes: string[] }> {
    const notes: string[] = [];
    const outcomes: CapabilityOutcome[] = [];
    for (const label of REDLINE_LABELS) {
      const path = `${repoPath(ref)}/labels/${label.name}`;
      const read = await client.rest<unknown>('GET', path);
      if (read.status === 404) continue; // not on this repository at all
      if (!isSuccess(read.status)) {
        outcomes.push(unreadable('labels', read.status, `the "${label.name}" label`));
        continue;
      }
      const description = parseLabelDescription(read.body);
      if (description === null) {
        throw new RedlineError('host', 'GitHub returned an unexpected shape for a label');
      }
      if (description !== label.description) {
        notes.push(
          `the "${label.name}" label was left in place: its description is no longer the one Redline ` +
            'wrote, so this repository has made it its own'
        );
        continue;
      }
      const deleted = await client.rest('DELETE', path);
      outcomes.push(deleteOutcome('labels', deleted.status, `label "${label.name}"`));
    }
    if (outcomes.length === 0) {
      return {
        outcome: {
          capability: 'labels',
          status: 'already',
          detail: 'no label still carrying a Redline description — nothing to remove',
        },
        notes,
      };
    }
    return { outcome: worstOutcome(outcomes), notes };
  }

  return {
    host: 'github',
    async withdraw(ref: RepoRef): Promise<WithdrawalResult> {
      const ruleset = await withdrawRuleset(ref);
      const labels = await withdrawLabels(ref);
      // Removed by PATCHing the value to null, which is how GitHub deletes a
      // repository property value. The registry derives the estate by walking
      // for this property, so leaving it set is what keeps a removed repository
      // showing up as onboarded.
      const property = await client.rest('PATCH', `${repoPath(ref)}/properties/values`, {
        properties: [{ property_name: REPO_PROPERTY, value: null }],
      });
      return {
        outcomes: [
          ruleset,
          labels.outcome,
          deleteOutcome(
            'repo-property',
            property.status,
            `repository property "${REPO_PROPERTY}"`
          ),
        ],
        notes: labels.notes,
      };
    },
  };
}

interface PolicyConfiguration {
  id: number;
  typeId: string;
  settings: Record<string, unknown>;
}

function parsePolicyConfigurations(body: unknown): PolicyConfiguration[] | null {
  if (!isNonNullObject(body) || !Array.isArray(body['value'])) return null;
  const configs: PolicyConfiguration[] = [];
  for (const item of body['value']) {
    if (!isNonNullObject(item) || typeof item['id'] !== 'number') return null;
    const type = item['type'];
    if (!isNonNullObject(type) || typeof type['id'] !== 'string') return null;
    const settings = item['settings'];
    if (!isNonNullObject(settings)) return null;
    configs.push({ id: item['id'], typeId: type['id'], settings });
  }
  return configs;
}

export function createAzureWithdrawal(client: AzureClient): HostWithdrawal {
  return {
    host: 'azure',
    async withdraw(ref: RepoRef): Promise<WithdrawalResult> {
      const project = ref.project;
      const repoId = ref.repoId;
      if (project === undefined || repoId === undefined) {
        throw new RedlineError('usage', 'an Azure DevOps repository needs a project and its id');
      }

      const listed = await client.request<unknown>('GET', `/${project}/_apis/policy/configurations`);
      if (!isSuccess(listed.status)) {
        return {
          outcomes: [unreadable('merge-policy', listed.status, 'the branch policies on this project')],
          notes: [],
        };
      }
      const configs = parsePolicyConfigurations(listed.body);
      if (configs === null) {
        throw new RedlineError(
          'host',
          'Azure DevOps returned an unexpected shape for policy configurations'
        );
      }

      const types = await resolvePolicyTypeIds(client, project);
      const statusTypeId = types[POLICY_TYPE_NAMES.status];

      // Scoped to THIS repository, and marked as Redline's. Both halves matter:
      // policy configurations are project-wide, so a sibling repository's
      // Redline policies are in the same list and are not this run's to delete.
      const coversThisRepo = (config: PolicyConfiguration): boolean => {
        const scope = config.settings['scope'];
        if (!Array.isArray(scope)) return false;
        return scope.some((entry) => isNonNullObject(entry) && entry['repositoryId'] === repoId);
      };
      // The displayName marker every policy `redline init` writes carries, plus
      // the genre/name pair that identifies the gate Status policy — which
      // predates the marker, so a repository onboarded by an earlier release is
      // still recognised rather than abandoned. Exactly the two tests
      // cli/platforms/azure/install.ts uses to decide a policy is its own.
      const mine = (config: PolicyConfiguration): boolean => {
        const displayName = config.settings['displayName'];
        if (typeof displayName === 'string' && displayName.startsWith(REDLINE_POLICY_MARKER)) {
          return true;
        }
        return (
          config.typeId === statusTypeId &&
          config.settings['statusGenre'] === AZURE_STATUS_GENRE &&
          config.settings['statusName'] === AZURE_STATUS_NAME
        );
      };

      const targets = configs.filter((config) => coversThisRepo(config) && mine(config));
      const outcomes: CapabilityOutcome[] = [];
      for (const config of targets) {
        const deleted = await client.request(
          'DELETE',
          `/${project}/_apis/policy/configurations/${config.id}`
        );
        outcomes.push(deleteOutcome('merge-policy', deleted.status, `branch policy ${config.id}`));
      }

      return {
        outcomes: [
          outcomes.length === 0
            ? {
                capability: 'merge-policy',
                status: 'already',
                detail: `no branch policy carrying "${REDLINE_POLICY_MARKER}" on this repository — nothing to remove`,
              }
            : worstOutcome(outcomes),
          {
            capability: 'repo-property',
            status: 'unsupported',
            detail: 'Azure DevOps has no repository properties, so there is none to clear',
          },
          {
            capability: 'labels',
            status: 'unsupported',
            detail:
              'Azure DevOps creates pull request labels on use rather than declaring them on the ' +
              'repository, so there is no label object to remove',
          },
        ],
        // Left standing on purpose. Deleting a build definition deletes its run
        // history with it, and that history is the repository's record of what
        // ran on which pull request — losing it is a bigger change than
        // removing Redline. The Build Validation policy above is gone, so the
        // definition no longer queues on anything.
        notes: [
          `the "${AZURE_GATE_DEFINITION}" pipeline definition is still registered and is yours to ` +
            'delete: removing it would delete its run history too, and nothing queues it now that ' +
            'the Build Validation policy is gone',
        ],
      };
    },
  };
}

export interface HostWithdrawalDeps {
  gitFor?: (cwd: string) => Git;
  makeGitHubClient?: () => GitHubClient;
  makeAzureClient?: (org: string) => AzureClient;
}

/**
 * The withdrawal port for whichever host this checkout belongs to. It reads the
 * remote the same way cli/platforms/resolve.ts does, and for the same reason —
 * the git remote is the only thing that says which host a working tree is on.
 */
export function createHostWithdrawal(cwd: string, deps: HostWithdrawalDeps = {}): HostWithdrawal {
  const gitFor = deps.gitFor ?? ((dir: string) => createGit(dir));
  const identity = parseRemote(gitFor(cwd).remoteUrl());
  if (identity.host === 'github') {
    return createGitHubWithdrawal((deps.makeGitHubClient ?? createGitHubClient)());
  }
  const makeAzure = deps.makeAzureClient ?? ((org: string): AzureClient => createAzureClient(org));
  return createAzureWithdrawal(makeAzure(identity.org));
}
