import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RedlineError } from '../../core/errors.ts';
import type { Git } from '../../core/git.ts';
import { CLI_VERSION } from '../../core/version.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  Change,
  GateOptions,
  InstallResult,
  MergePolicy,
  OwnershipRule,
  PlatformInstall,
  PolicyResult,
  PullRequestRef,
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
import { isNonNullObject, isSuccess } from '../shape.ts';
import { BEGIN_PREFIX, END, wrapBlock } from '../../render/markers.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// Advanced Security is a separately licensed feature: a tenant without it
// returns 404 on the enablement endpoint. That is `unsupported`, never
// `denied` — the repository is not half-onboarded, the feature was never
// purchased. See enableSecurityFloor.
const ADVSEC = { host: 'advsec', apiVersion: '7.2-preview.1' } as const;

// Azure response bodies are untrusted external input, same house style as
// cli/platforms/github/install.ts: typed `unknown`, narrowed by an explicit
// parse function, and never read before `isSuccess(status)` is checked. An
// Azure error body is a truthy object (e.g. `{ message: "Forbidden" }`), not
// an array — `?? []` never fires on it, so shape is verified with
// `Array.isArray`/`isNonNullObject`, not coercion.

interface PolicyConfiguration {
  id: number;
  type: { id: string };
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
    configs.push({ id: item['id'], type: { id: type['id'] }, settings });
  }
  return configs;
}

function parseCreatedPullRequestId(body: unknown): number | null {
  if (!isNonNullObject(body) || typeof body['pullRequestId'] !== 'number') return null;
  return body['pullRequestId'];
}

// CONTRACT with platforms/azure/gate-template.yml: Azure Repos ignores YAML
// `pr:` triggers (a GitHub-only feature), so the gate pipeline only ever runs
// through a Build Validation branch policy pointing at a registered build
// definition. This name and yaml path are what installGate registers and what
// the Build Validation policy in applyPolicy queues.
const GATE_DEFINITION_NAME = 'redline-gate';
const GATE_YAML_FILENAME = '.azuredevops/redline-gate.yml';
// Definition names are unique per folder, and the `name=` list filter is
// project-wide. Registering Redline's definitions in their own folder is what
// keeps two repositories in the same project from colliding on the name
// `redline-gate` — and adopting each other's definitions, which would point a
// repository's Build Validation policy at a pipeline that checks out a
// sibling repository and publishes redline/gate against the sibling's id.
const GATE_DEFINITION_FOLDER = '\\Redline';

// semantic-release replaces package.json's version only on a published build,
// so this is what an unpublished checkout reports. Pinning it into a gate
// template would install a version the registry has never seen.
const UNPUBLISHED_VERSION = '0.0.0-development';

interface BuildDefinition {
  id: number;
  name: string;
  path: string | null;
  repositoryId: string | null;
  yamlFilename: string | null;
}

function parseBuildDefinitions(body: unknown): BuildDefinition[] | null {
  if (!isNonNullObject(body) || !Array.isArray(body['value'])) return null;
  const defs: BuildDefinition[] = [];
  for (const item of body['value']) {
    if (!isNonNullObject(item) || typeof item['id'] !== 'number' || typeof item['name'] !== 'string') {
      return null;
    }
    const process = item['process'];
    const yamlFilename =
      isNonNullObject(process) && typeof process['yamlFilename'] === 'string'
        ? process['yamlFilename']
        : null;
    const repository = item['repository'];
    const repositoryId =
      isNonNullObject(repository) && typeof repository['id'] === 'string' ? repository['id'] : null;
    defs.push({
      id: item['id'],
      name: item['name'],
      path: typeof item['path'] === 'string' ? item['path'] : null,
      repositoryId,
      yamlFilename,
    });
  }
  return defs;
}

function parseCreatedBuildDefinitionId(body: unknown): number | null {
  if (!isNonNullObject(body) || typeof body['id'] !== 'number') return null;
  return body['id'];
}

// Same degradation contract as outcome(), but registering a build definition
// needs Build Administrator, not project administrator, and a 404 here means
// Azure Pipelines is not available on the project.
function gateOutcome(status: number, detail: string): CapabilityOutcome {
  if (isSuccess(status)) return { capability: 'gate', status: 'applied', detail };
  if (status === 401 || status === 403) {
    return {
      capability: 'gate',
      status: 'denied',
      detail: `${detail} (needs build administrator) — the merge gate stays advisory until it is registered`,
    };
  }
  if (status === 404) {
    return {
      capability: 'gate',
      status: 'unsupported',
      detail: `${detail} (Azure Pipelines is not available on this project)`,
    };
  }
  return { capability: 'gate', status: 'denied', detail: `${detail} (HTTP ${status})` };
}

// resolvePolicyTypeIds always seeds its result from POLICY_TYPE_FALLBACK, so
// every POLICY_TYPE_NAMES value is guaranteed present — but its return type
// is the plain `Record<string, string>` (cli/platforms/azure/verify.ts also
// consumes it and indexes it with a plain string, so narrowing the exported
// type here would break that file), and noUncheckedIndexedAccess therefore
// still sees `string | undefined` at this call site. This proves the
// invariant with a real check instead of a `!` assertion.
function requiredTypeId(types: Record<string, string>, name: string): string {
  const id = types[name];
  if (id === undefined) {
    throw new RedlineError('host', `Azure policy type "${name}" could not be resolved`);
  }
  return id;
}

function outcome(capability: AdminCapability, status: number, detail: string): CapabilityOutcome {
  if (isSuccess(status)) return { capability, status: 'applied', detail };
  if (status === 401 || status === 403) {
    return { capability, status: 'denied', detail: `${detail} (needs project administrator)` };
  }
  if (status === 404) {
    return { capability, status: 'unsupported', detail: `${detail} (not available on this project)` };
  }
  return { capability, status: 'denied', detail: `${detail} (HTTP ${status})` };
}

// Combines several outcomes for one logical capability (three policy
// configuration writes fold into one "merge-policy" result) into a single
// outcome, ranked by how actionable the status is rather than by comparing
// raw HTTP status numbers — a 404 "unsupported" on one call must never mask
// a 403 "denied" on another just because 404 > 403.
const OUTCOME_RANK: Record<CapabilityOutcome['status'], number> = {
  denied: 3,
  unsupported: 2,
  already: 1,
  applied: 0,
};

function worstOutcome(outcomes: CapabilityOutcome[]): CapabilityOutcome {
  const [first, ...rest] = outcomes;
  if (!first) throw new Error('worstOutcome requires at least one outcome');
  return rest.reduce(
    (worst, next) => (OUTCOME_RANK[next.status] > OUTCOME_RANK[worst.status] ? next : worst),
    first
  );
}

// Writes only when the bytes differ, and answers whether they did — same
// contract as cli/platforms/github/install.ts and cli/render/standards.ts.
// The gate template carries a pinned `redline-cli@<version>`, so under a
// published CLI an unconditional write rewrote this file on every single run:
// `redline init` reads the returned file list to decide whether a re-run has
// anything to do, and an always-dirty gate file made that decision worthless
// in one direction and, once the list was ignored, left a modified tracked
// file behind with no pull request in the other. `check` computes the answer
// and writes nothing.
function syncFile(cwd: string, relPath: string, contents: string, check: boolean): boolean {
  const target = join(cwd, relPath);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current === contents) return false;
  if (check) return true;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  return true;
}

// The two sections workflows/redline-gate.yml actually reads out of a pull
// request body, and the reason it is these two and not the others: the
// `checklist` job fails the pull request outright when `## Launch readiness`
// is missing, and the `adr` job fails a large diff whose body carries no
// `docs/adr/` link, which is what `## Architecture decision` prompts for.
// `## Change type` is gated by nothing (the workflow says so in a comment),
// `## Automated review` is gated by nothing, and `# Summary` would collide
// with the heading a repository's own template already has. Dropping the ADR
// section would leave a merged repository failing a gate job it has no
// affordance to satisfy.
const GATED_SECTIONS = ['Launch readiness', 'Architecture decision'];

function gatedSections(template: string): string {
  const kept: string[] = [];
  let inside = false;
  for (const line of template.split('\n')) {
    // The packaged template carries the markers itself, so a greenfield file is
    // marked from the first run. The marker lines are the wrapper wrapBlock
    // adds back, never part of the body it wraps.
    if (line.startsWith(BEGIN_PREFIX) || line === END) continue;
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) inside = GATED_SECTIONS.includes(heading[1] ?? '');
    if (inside) kept.push(line);
  }
  return kept.join('\n').trim();
}

// Any filename the host would resolve as the default pull request template.
// Both hosts match the name case-insensitively, so `PULL_REQUEST_TEMPLATE.md`
// is the file being served and the one Redline must merge into — writing the
// canonical lower-case path beside it would leave two templates with ambiguous
// precedence, and if the host serves the human's, the Redline block is
// invisible and the gate blocks every one of that repository's pull requests.
const TEMPLATE_NAMES = new Set([
  'pull_request_template.md',
  'pull_request_template.txt',
  'pull_request_template',
]);

// Azure DevOps resolves the default template from `.azuredevops/`, the legacy
// `.vsts/` folder, `docs/` and the repository root.
const TEMPLATE_DIRS = ['.azuredevops', '.vsts', 'docs', ''];

function findPullRequestTemplate(cwd: string): string | null {
  for (const dir of TEMPLATE_DIRS) {
    const abs = dir === '' ? cwd : join(cwd, dir);
    if (!existsSync(abs)) continue;
    // `isFile()` is what excludes a `PULL_REQUEST_TEMPLATE/` directory of
    // alternate templates. Those are reachable only through a `?template=`
    // link and are never the default body, so Redline neither adopts one as
    // the template nor rewrites anything inside it — it writes the default
    // path instead, which is what a plain pull request would otherwise open
    // with an empty body and fail the gate for.
    const hit = readdirSync(abs, { withFileTypes: true }).find(
      (entry) => entry.isFile() && TEMPLATE_NAMES.has(entry.name.toLowerCase())
    );
    if (hit) return dir === '' ? hit.name : `${dir}/${hit.name}`;
  }
  return null;
}

// A repository's own pull request template is a human-owned file, and this was
// the last host-writing path in either adapter that simply overwrote one.
// Leaving it alone is not the fix either: the gate fails any pull request
// whose body has no `## Launch readiness` section, so an untouched brownfield
// template would block the repository's own pull requests. So: write the
// packaged template only where the host would resolve none, and otherwise
// merge just the gated sections into a REDLINE marker block, leaving every
// other byte alone.
function syncPullRequestTemplate(
  cwd: string,
  defaultPath: string,
  packaged: string,
  check: boolean
): { path: string; changed: boolean; detail: string } {
  const relPath = findPullRequestTemplate(cwd) ?? defaultPath;
  const target = join(cwd, relPath);
  const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
  const marked = existing !== null && existing.includes(BEGIN_PREFIX) && existing.includes(END);
  // Already satisfies the gate on its own. This is also where a repository
  // onboarded before the packaged template carried markers lands: its
  // marker-less file is treated as the team's, so it keeps what it has and
  // Redline never rewrites it.
  const selfSufficient =
    existing !== null && !marked && /^##[ \t]+Launch readiness[ \t]*$/m.test(existing);

  const contents =
    existing === null
      ? packaged
      : selfSufficient
        ? existing
        : wrapBlock(existing, gatedSections(packaged));
  const changed = syncFile(cwd, relPath, contents, check);

  if (selfSufficient) {
    return {
      path: relPath,
      changed,
      detail: `${relPath} already has its own "## Launch readiness" section — left untouched`,
    };
  }
  if (!changed) return { path: relPath, changed, detail: `${relPath} is already up to date` };
  if (existing === null) return { path: relPath, changed, detail: `wrote ${relPath}` };
  if (marked) return { path: relPath, changed, detail: `refreshed the Redline block in ${relPath}` };
  return {
    path: relPath,
    changed,
    detail: `kept this repository's ${relPath} and appended the gated section inside REDLINE markers`,
  };
}

export function createAzureInstall(
  client: AzureClient,
  gitFor: (cwd: string) => Git,
  cliVersion: string = CLI_VERSION
): PlatformInstall {
  const project = (ref: RepoRef): string => {
    if (!ref.project) throw new RedlineError('usage', 'an Azure DevOps repository needs a project');
    return ref.project;
  };
  const repoId = (ref: RepoRef): string => {
    if (!ref.repoId) throw new RedlineError('usage', 'an Azure DevOps repository needs its id');
    return ref.repoId;
  };

  // What installGate learned about the gate build definition, read later by
  // applyPolicy in the same run: init.ts calls installGate first. null means
  // installGate has not run in this process (applyPolicy called standalone),
  // in which case applyPolicy neither writes a Build Validation policy nor
  // second-guesses the caller's blocking choice.
  type GateBuildState = { registered: true; definitionId: number } | { registered: false };
  let gateBuild: GateBuildState | null = null;

  async function ensureGateBuildDefinition(ref: RepoRef): Promise<CapabilityOutcome> {
    const proj = project(ref);
    const repo = repoId(ref);
    const listed = await client.request<unknown>(
      'GET',
      `/${proj}/_apis/build/definitions?name=${GATE_DEFINITION_NAME}` +
        `&path=${encodeURIComponent(GATE_DEFINITION_FOLDER)}&includeAllProperties=true`
    );
    if (!isSuccess(listed.status)) {
      gateBuild = { registered: false };
      return gateOutcome(listed.status, 'gate pipeline definition');
    }
    const defs = parseBuildDefinitions(listed.body);
    if (defs === null) {
      throw new RedlineError('host', 'Azure DevOps returned an unexpected shape for build definitions');
    }

    // The `path` filter is re-applied locally: the list endpoint's own
    // filtering is not something to trust a repository's merge gate to.
    const named = defs.filter(
      (d) => d.name === GATE_DEFINITION_NAME && d.path === GATE_DEFINITION_FOLDER
    );
    const forThisRepo = named.filter((d) => d.repositoryId === repo);
    const mine = forThisRepo.find((d) => d.yamlFilename === GATE_YAML_FILENAME);
    if (mine) {
      gateBuild = { registered: true, definitionId: mine.id };
      return {
        capability: 'gate',
        status: 'already',
        detail: `gate pipeline definition "${GATE_DEFINITION_NAME}" (id ${mine.id}) already registered`,
      };
    }
    const foreign = forThisRepo[0];
    if (foreign) {
      // Brownfield: a definition Redline did not create is human-owned and is
      // never updated — and a second definition with the same name cannot be
      // created. Pending admin work, not an error: an administrator must
      // rename it or point it at the gate yaml before the gate can block.
      gateBuild = { registered: false };
      return {
        capability: 'gate',
        status: 'denied',
        detail:
          `a build definition named "${GATE_DEFINITION_NAME}" (id ${foreign.id}) already exists but runs ` +
          `${foreign.yamlFilename === null ? 'a designer pipeline' : `"${foreign.yamlFilename}"`}, not ` +
          `${GATE_YAML_FILENAME} — it is human-owned and was left untouched; the merge gate stays advisory ` +
          `until an administrator points it at ${GATE_YAML_FILENAME} or renames it`,
      };
    }
    const otherRepo = named[0];
    if (otherRepo) {
      // Same name, same folder, a different repository — reusing it would
      // point this repository's Build Validation policy at a pipeline that
      // builds the other repository and publishes redline/gate against the
      // other repository's id, blocking every pull request here. The name is
      // also taken, so a POST cannot succeed either.
      gateBuild = { registered: false };
      return {
        capability: 'gate',
        status: 'denied',
        detail:
          `build definition "${GATE_DEFINITION_FOLDER}\\${GATE_DEFINITION_NAME}" (id ${otherRepo.id}) is ` +
          `bound to repository ${otherRepo.repositoryId ?? 'unknown'}, not ${repo} — it was left untouched ` +
          `and the name is unavailable, so the merge gate stays advisory until an administrator renames it`,
      };
    }

    const created = await client.request<unknown>('POST', `/${proj}/_apis/build/definitions`, {
      name: GATE_DEFINITION_NAME,
      path: GATE_DEFINITION_FOLDER,
      process: { type: 2, yamlFilename: GATE_YAML_FILENAME },
      repository: { id: repo, type: 'TfsGit' },
    });
    if (!isSuccess(created.status)) {
      gateBuild = { registered: false };
      return gateOutcome(created.status, 'gate pipeline definition');
    }
    const id = parseCreatedBuildDefinitionId(created.body);
    if (id === null) {
      throw new RedlineError(
        'host',
        'Azure DevOps returned an unexpected shape for a created build definition'
      );
    }
    gateBuild = { registered: true, definitionId: id };
    return {
      capability: 'gate',
      status: 'applied',
      detail: `gate pipeline definition "${GATE_DEFINITION_NAME}" registered`,
    };
  }

  return {
    async enableSecurityFloor(ref: RepoRef): Promise<SecurityResult> {
      const res = await client.request(
        'PATCH',
        `/${project(ref)}/_apis/management/repositories/${repoId(ref)}/enablement`,
        { advSecEnabled: true, blockPushes: true },
        ADVSEC
      );
      return {
        outcomes: [
          outcome('secret-scanning', res.status, 'advanced security secret scanning'),
          outcome('push-protection', res.status, 'advanced security push protection'),
          outcome('dependency-alerts', res.status, 'advanced security dependency scanning'),
        ],
      };
    },

    async applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult> {
      const proj = project(ref);
      const repo = repoId(ref);
      const types = await resolvePolicyTypeIds(client, proj);
      const defaultRef = `refs/heads/${ref.defaultBranch}`;
      const scope = [{ repositoryId: repo, refName: defaultRef, matchKind: 'exact' }];

      const buildTypeId = requiredTypeId(types, POLICY_TYPE_NAMES.build);
      const statusTypeId = requiredTypeId(types, POLICY_TYPE_NAMES.status);

      // Brownfield ownership, the rule the whole of this function turns on.
      // Redline writes REDLINE_POLICY_MARKER into settings.displayName on
      // every policy it creates; a policy of the same type WITHOUT it belongs
      // to a human and is never updated, rescoped or deleted — matching on
      // the type id alone would PUT a team's own review rules away.
      const isRedlineOwned = (config: PolicyConfiguration): boolean => {
        const displayName = config.settings['displayName'];
        return typeof displayName === 'string' && displayName.startsWith(REDLINE_POLICY_MARKER);
      };
      const isRedlineBuildPolicy = (config: PolicyConfiguration): boolean =>
        config.type.id === buildTypeId && isRedlineOwned(config);
      // Status policies carry a second marker: the genre/name pair the gate
      // pipeline publishes, which is what makes one Status policy a different
      // object from another on the same branch. It also predates the
      // displayName marker, so a repository onboarded by an earlier release
      // is still recognised as Redline's own instead of being mistaken for a
      // human's and abandoned.
      const isRedlineStatusPolicy = (config: PolicyConfiguration): boolean =>
        config.type.id === statusTypeId &&
        config.settings['statusGenre'] === AZURE_STATUS_GENRE &&
        config.settings['statusName'] === AZURE_STATUS_NAME;

      // Only policies that govern the branch this run writes are candidates.
      // A scope entry naming another ref belongs to a branch an operator
      // chose deliberately: matching it would rewrite it with the
      // default-branch scope and silently move it.
      const coversDefaultBranch = (config: PolicyConfiguration): boolean => {
        const configScope = config.settings['scope'];
        if (!Array.isArray(configScope)) return false;
        return configScope.some((entry) => {
          if (!isNonNullObject(entry) || entry['repositoryId'] !== repo) return false;
          const refName = entry['refName'];
          // No ref at all means the whole repository, which includes the
          // default branch.
          if (refName === undefined || refName === null) return true;
          if (typeof refName !== 'string') return false;
          // Azure echoes matchKind back with whatever casing the object was
          // created with: a policy made through the portal returns 'Prefix'.
          // Compared case-sensitively, a human's `refs/heads/` prefix policy
          // stops looking like it covers the default branch and Redline
          // stacks a second policy beside it.
          const matchKind = entry['matchKind'];
          return typeof matchKind === 'string' && matchKind.toLowerCase() === 'prefix'
            ? defaultRef.startsWith(refName)
            : refName === defaultRef;
        });
      };

      const describe = (config: PolicyConfiguration): string => {
        const displayName = config.settings['displayName'];
        return typeof displayName === 'string'
          ? `"${displayName}" (policy ${config.id})`
          : `policy ${config.id}`;
      };

      const repoPropertyOutcome: CapabilityOutcome = {
        capability: 'repo-property',
        status: 'unsupported',
        detail: 'Azure DevOps has no repository properties — the central registry tracks this repo instead',
      };

      const existing = await client.request<unknown>('GET', `/${proj}/_apis/policy/configurations`);
      if (!isSuccess(existing.status)) {
        // Denied or unsupported — never guess whether a Redline policy
        // already exists, and never crash on it. Skip the write entirely;
        // onboarding still continues below.
        return {
          outcomes: [outcome('merge-policy', existing.status, 'branch policies'), repoPropertyOutcome],
          policy: null,
        };
      }
      const configs = parsePolicyConfigurations(existing.body);
      if (configs === null) {
        throw new RedlineError('host', 'Azure DevOps returned an unexpected shape for policy configurations');
      }
      const onBranch = configs.filter(coversDefaultBranch);

      const gate = gateBuild;
      const registeredGate = gate !== null && gate.registered ? gate : null;
      // Security property: a blocking redline/gate Status policy with no
      // pipeline able to publish that status blocks every pull request
      // forever, so blocking survives only when something can actually queue
      // the gate. Three ways it can: installGate has not run in this process
      // (applyPolicy called standalone — the caller's choice stands), this
      // run registered or confirmed the definition, or the repository already
      // carries a Redline Build Validation policy from an earlier run. That
      // last case is what keeps a token which cannot read build definitions
      // from silently downgrading a working, enforcing gate to advisory.
      const gateAlreadyEnforcing = onBranch.some(isRedlineBuildPolicy);
      const blocking =
        policy.blocking && (gate === null || registeredGate !== null || gateAlreadyEnforcing);

      interface PolicyBody {
        type: { id: string };
        isEnabled: boolean;
        isBlocking: boolean;
        settings: Record<string, unknown>;
      }
      interface WantedPolicy {
        typeId: string;
        // Recognises Redline's own object among the policies of that type on
        // the branch. Never `true` for a policy a human created.
        mine: (config: PolicyConfiguration) => boolean;
        // Read at write time, not up front: a rejected Build Validation write
        // has to reach the Status policy that is written after it.
        config: (blocking: boolean) => PolicyBody;
        // True for the write the blocking gate depends on: if it fails,
        // everything written after it drops to advisory.
        runsTheGate?: boolean;
        // Azure models this policy type as a single setting per branch (one
        // toggle in the UI), so an unmarked policy of this type on the branch
        // is not a neighbour — it is the same control, already configured by
        // a human. Redline reports it and adds nothing rather than stacking a
        // second, conflicting copy.
        //
        // Status and Build policies are deliberately NOT marked this way:
        // Azure keys them by (genre, name) and by buildDefinitionId, several
        // coexist natively on one branch, and backing off there would leave a
        // repository with a human's unrelated status policy and no Redline
        // gate at all.
        oneSettingPerBranch?: boolean;
        // Names the control in the outcome an operator reads.
        what: string;
      }
      const minimumReviewersTypeId = requiredTypeId(types, POLICY_TYPE_NAMES.minimumReviewers);
      const commentsTypeId = requiredTypeId(types, POLICY_TYPE_NAMES.comments);

      // types is guaranteed to carry every POLICY_TYPE_NAMES entry:
      // resolvePolicyTypeIds always seeds it from POLICY_TYPE_FALLBACK first.
      const wanted: WantedPolicy[] = [
        {
          typeId: minimumReviewersTypeId,
          mine: isRedlineOwned,
          oneSettingPerBranch: true,
          what: 'the minimum reviewer count',
          config: () => ({
            type: { id: minimumReviewersTypeId },
            isEnabled: true,
            isBlocking: true,
            settings: {
              minimumApproverCount: policy.requiredApprovals,
              creatorVoteCounts: false,
              resetOnSourcePush: policy.dismissStaleReviews,
              blockLastPusherVote: true,
              displayName: `${REDLINE_POLICY_MARKER} minimum reviewers`,
              scope,
            },
          }),
        },
        {
          typeId: commentsTypeId,
          mine: isRedlineOwned,
          oneSettingPerBranch: true,
          what: 'comment resolution',
          config: () => ({
            type: { id: commentsTypeId },
            isEnabled: policy.requireThreadResolution,
            isBlocking: policy.requireThreadResolution,
            settings: { displayName: `${REDLINE_POLICY_MARKER} comment resolution`, scope },
          }),
        },
        // The Build Validation policy is what actually queues the gate
        // pipeline on a pull request (Azure Repos ignores YAML `pr:`
        // triggers) — written only against a definition installGate confirmed
        // or registered, never against a guess, and written BEFORE the Status
        // policy so that a rejected write can still hold the gate advisory.
        //
        // DO NOT ADD `oneSettingPerBranch: true` HERE. Azure keys Build
        // Validation policies by buildDefinitionId and several coexist on one
        // branch, so a human's Build policy is a neighbour, not the same
        // control. Backing off beside it would leave the repository with a
        // blocking `redline/gate` Status policy (written below, after this
        // entry) and nothing able to publish that status — every pull request
        // blocked forever. The back-off branch in the loop below deliberately
        // does not degrade `effectiveBlocking`, because this entry is the one
        // case where it would matter and this entry must never reach it.
        ...(registeredGate === null
          ? []
          : [
              {
                typeId: buildTypeId,
                mine: isRedlineBuildPolicy,
                runsTheGate: true,
                what: 'the gate build',
                config: (blocking: boolean): PolicyBody => ({
                  type: { id: buildTypeId },
                  isEnabled: true,
                  isBlocking: blocking,
                  settings: {
                    buildDefinitionId: registeredGate.definitionId,
                    displayName: AZURE_BUILD_POLICY_DISPLAY_NAME,
                    validDuration: 0,
                    queueOnSourceUpdateOnly: true,
                    scope,
                  },
                }),
              },
            ]),
        {
          typeId: statusTypeId,
          mine: isRedlineStatusPolicy,
          what: `the ${AZURE_STATUS_GENRE}/${AZURE_STATUS_NAME} status`,
          config: (blocking: boolean) => ({
            type: { id: statusTypeId },
            isEnabled: true,
            // Advisory is native on Azure: isBlocking mirrors the (possibly
            // degraded) blocking choice directly, no rule needs omitting the
            // way GitHub's does.
            isBlocking: blocking,
            settings: {
              statusName: AZURE_STATUS_NAME,
              statusGenre: AZURE_STATUS_GENRE,
              authorId: null,
              invalidateOnSourceUpdate: true,
              displayName: `${REDLINE_POLICY_MARKER} gate status`,
              scope,
            },
          }),
        },
      ];

      let effectiveBlocking = blocking;
      const results: CapabilityOutcome[] = [];
      for (const wantedPolicy of wanted) {
        const sameType = onBranch.filter((c) => c.type.id === wantedPolicy.typeId);
        const match = sameType.find(wantedPolicy.mine);
        const humanOwned =
          match === undefined && wantedPolicy.oneSettingPerBranch === true ? sameType[0] : undefined;
        if (humanOwned) {
          results.push({
            capability: 'merge-policy',
            status: 'already',
            detail:
              `branch policies — ${describe(humanOwned)} already sets ${wantedPolicy.what} on ` +
              `${defaultRef} and carries no "${REDLINE_POLICY_MARKER}" marker, so it is human-owned ` +
              `and was left untouched; Redline wrote none of its own`,
          });
          continue;
        }
        const config = wantedPolicy.config(effectiveBlocking);
        const res = match
          ? await client.request('PUT', `/${proj}/_apis/policy/configurations/${match.id}`, config)
          : await client.request('POST', `/${proj}/_apis/policy/configurations`, config);
        results.push(outcome('merge-policy', res.status, 'branch policies'));
        if (wantedPolicy.runsTheGate === true && !isSuccess(res.status)) effectiveBlocking = false;
      }
      const mergePolicy = worstOutcome(results);
      // "Nothing was refused", not "every write was a create". `already` is
      // how a settled branch reports — a human-owned policy Redline
      // deliberately left alone — and reading it as failure zeroed the policy
      // the run reports, which then read back as no policy at all.
      const nothingRefused = results.every((o) => o.status === 'applied' || o.status === 'already');

      return {
        outcomes: [mergePolicy, repoPropertyOutcome],
        // The applied policy reports what was actually written: when nothing
        // could queue the gate, blocking was degraded to advisory.
        policy: nothingRefused ? { ...policy, blocking: effectiveBlocking } : null,
      };
    },

    async installGate(
      ref: RepoRef,
      cwd: string,
      opts: GateOptions,
      check = false
    ): Promise<InstallResult> {
      const files: string[] = [];
      const pipeline = readFileSync(join(PACKAGE_ROOT, 'platforms/azure/gate-template.yml'), 'utf8')
        .replace(/ADR_DIFF_THRESHOLD: \d+/, `ADR_DIFF_THRESHOLD: ${opts.adrDiffThreshold}`)
        .replace(
          /FAIL_ON_DEPENDENCY_SEVERITY: \w+/,
          `FAIL_ON_DEPENDENCY_SEVERITY: ${opts.failOnDependencySeverity}`
        )
        .replace(/SOFT_FAIL_LABELS: .*/, `SOFT_FAIL_LABELS: ${opts.softFailLabels.join(',')}`);
      // `redline-cli@latest` inside a template installed across every
      // onboarded repository means any npm publish changes org-wide gate
      // behaviour with no pull request anywhere. Pin the version that wrote
      // the file, so a CLI upgrade arrives as a reviewable sync PR.
      const pinned =
        cliVersion === UNPUBLISHED_VERSION
          ? pipeline
          : pipeline.replace('redline-cli@latest', `redline-cli@${cliVersion}`);
      if (syncFile(cwd, '.azuredevops/redline-gate.yml', pinned, check)) {
        files.push('.azuredevops/redline-gate.yml');
      }

      const template = readFileSync(
        join(PACKAGE_ROOT, 'templates/azure/pull_request_template.md'),
        'utf8'
      );
      const prTemplate = syncPullRequestTemplate(
        cwd,
        '.azuredevops/pull_request_template.md',
        template,
        check
      );
      if (prTemplate.changed) files.push(prTemplate.path);

      if (check) return { files, outcomes: [] };

      // Azure Repos ignores the YAML `pr:` trigger, so writing the pipeline
      // file alone runs nothing: the definition must be registered so the
      // Build Validation policy (applyPolicy) can queue it on pull requests.
      const gate = await ensureGateBuildDefinition(ref);

      return {
        files,
        // No `labels` outcome here: Azure creates pull request labels on use
        // rather than pre-declaring them, so the capability is only exercised
        // when openPullRequest applies them — and it reports it there.
        outcomes: [
          gate,
          {
            capability: 'gate',
            status: prTemplate.changed ? 'applied' : 'already',
            detail: prTemplate.detail,
          },
        ],
      };
    },

    // Phase 1 boundary, reported honestly instead of half-done. GitHub takes
    // team *slugs* in a CODEOWNERS file; Azure takes reviewer *identity
    // GUIDs* in a policy. cli/commands/init.ts has only slugs, so every
    // policy this used to POST named a reviewer id that does not exist on
    // Azure — and it POSTed unconditionally, with no filter on the existing
    // configurations, so each re-run of `redline init` added another blocking
    // required-reviewer policy per rule. Until an identity lookup exists
    // (Task 17) this reports `unsupported`: the capability does not exist on
    // this host yet, which is not pending administrator work.
    async ensureReviewOwnership(
      _ref: RepoRef,
      _cwd: string,
      rules: OwnershipRule[]
    ): Promise<InstallResult> {
      if (rules.length === 0) return { files: [], outcomes: [] };
      return {
        files: [],
        outcomes: [
          {
            capability: 'review-ownership',
            status: 'unsupported',
            detail:
              'Azure DevOps required-reviewer policies take identity GUIDs, not team slugs — ' +
              'set them by hand under Project settings > Repositories > Policies',
          },
        ],
      };
    },

    async openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef | null> {
      const git = gitFor(cwd);
      // `git commit -m` commits the WHOLE index, so anything the user staged
      // before running redline would be swept into the onboarding PR.
      // Refusing beats `commit -- <paths>`: a partial-index commit surprises
      // in the opposite direction.
      if (git.hasStagedChanges()) {
        throw new RedlineError(
          'usage',
          'this repository already has staged changes',
          'commit or unstage them first, then re-run — redline will not sweep them into its onboarding pull request'
        );
      }
      const originalBranch = git.currentBranch();
      git.checkoutNewBranch(change.branch);
      let gitFailed = false;
      try {
        // Stage only what Redline itself wrote — never sweep in pre-existing
        // dirty or untracked state from the working tree.
        git.stagePaths(change.files);
        if (!git.hasStagedChanges()) {
          // Already onboarded and nothing changed: a legitimate no-op, not
          // an error — the caller reports it instead of a pull request.
          return null;
        }
        git.commit(change.title);
        git.push(change.branch);
      } catch (error) {
        gitFailed = true;
        throw error;
      } finally {
        // Leave the operator on their own branch, never on redline/onboard.
        // When a git step failed its error already says where the work sits,
        // and a failed restore must not mask it.
        try {
          git.checkoutBranch(originalBranch);
        } catch (restoreError) {
          if (!gitFailed) throw restoreError;
        }
      }

      const created = await client.request<unknown>(
        'POST',
        `/${project(ref)}/_apis/git/repositories/${repoId(ref)}/pullrequests`,
        {
          sourceRefName: `refs/heads/${change.branch}`,
          targetRefName: `refs/heads/${ref.defaultBranch}`,
          title: change.title,
          description: change.body,
        }
      );
      const id = isSuccess(created.status) ? parseCreatedPullRequestId(created.body) : null;
      if (id === null) {
        throw new RedlineError('host', `could not open a pull request (HTTP ${created.status})`);
      }
      // Labels come after creation on Azure (there is no field on the create
      // body), and the gate reads them: the onboarding pull request must
      // carry `redline-sync` or the first gate run fails on a repository that
      // has not adopted the standard yet. A refused label is still not worth
      // losing the pull request over — it degrades into an outcome.
      const labelOutcomes: CapabilityOutcome[] = [];
      for (const label of change.labels) {
        const applied = await client.request(
          'POST',
          `/${project(ref)}/_apis/git/repositories/${repoId(ref)}/pullRequests/${id}/labels`,
          { name: label }
        );
        labelOutcomes.push(outcome('labels', applied.status, `pull request label "${label}"`));
      }

      return {
        number: id,
        url: `https://dev.azure.com/${ref.org}/${project(ref)}/_git/${ref.repo}/pullrequest/${id}`,
        ...(labelOutcomes.length > 0 ? { outcomes: [worstOutcome(labelOutcomes)] } : {}),
      };
    },
  };
}
