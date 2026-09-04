// What version of the CLI a reader should actually install, resolved at build
// time from sources that exist.
//
// package.json here says "0.0.0-development": semantic-release computes the real
// version at publish time and never commits it back, so the checked-in field is
// a placeholder and quoting it in the docs would be worse than saying nothing.
// The registry is the only authority on what is installable, so that is what is
// asked — and the honest answer today is that nothing is: the package has never
// been published and the repository carries no v* tag, so the release workflow's
// own first-release guard stops it.
//
// The lookup never fails a build. An unreachable registry and an unpublished
// package are different states and are reported differently, because "we could
// not check" must not read as "it does not exist".
import { readRepoFile } from "./content";

export type PackageState =
  | { status: "published"; version: string; publishedAt: string | null }
  | { status: "unpublished" }
  | { status: "unknown"; reason: string };

export const PACKAGE_NAME = "redline-cli";

// The command a reader should run, given what is actually installable.
export function installCommand(state: PackageState, args = "init"): string {
  return state.status === "published"
    ? `npx ${PACKAGE_NAME}@${state.version} ${args}`
    : `node dist/bin/redline.js ${args}`;
}

export function standardsVersion(): string {
  return (JSON.parse(readRepoFile("standards/manifest.json")) as { version: string }).version;
}

let cached: Promise<PackageState> | null = null;

export function packageState(): Promise<PackageState> {
  cached ??= resolve();
  return cached;
}

async function resolve(): Promise<PackageState> {
  // An escape hatch for a build with no outbound network — an air-gapped runner
  // would otherwise render "could not check" on a page whose whole job is to
  // state the version. Set it to the version the registry serves.
  const pinned = process.env["REDLINE_NPM_VERSION"];
  if (pinned) return { status: "published", version: pinned, publishedAt: null };

  // An org publishing to a private mirror asks that mirror, not npmjs.
  const registry = (process.env["REDLINE_NPM_REGISTRY"] ?? "https://registry.npmjs.org").replace(
    /\/+$/,
    "",
  );

  try {
    const response = await fetch(`${registry}/${PACKAGE_NAME}`, {
      // A docs build must not hang on a slow registry, and a missed lookup
      // degrades to a visible "unknown" rather than a wrong number.
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (response.status === 404) return { status: "unpublished" };
    if (!response.ok) return { status: "unknown", reason: `registry returned ${response.status}` };

    const body = (await response.json()) as {
      "dist-tags"?: Record<string, string>;
      time?: Record<string, string>;
    };
    const version = body["dist-tags"]?.["latest"];
    if (!version) return { status: "unpublished" };
    return { status: "published", version, publishedAt: body.time?.[version] ?? null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "unknown", reason };
  }
}
