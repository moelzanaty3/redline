// What version of the CLI a reader should actually install, resolved at build
// time from the registry.
//
// package.json here says "0.0.0-development": semantic-release computes the real
// version at publish time and never commits it back, so the checked-in field is
// a placeholder and quoting it in the docs would be worse than saying nothing.
// The registry is the only authority on what is installable, so that is what is
// asked.
//
// Every command in these docs installs from the package. There is no
// install-from-source path any more: the CLI is distributed on npm and a second
// set of instructions pointing at a built checkout is a second thing to keep
// true. When the registry cannot be reached the command is rendered unpinned
// (`npx redline-cli ...`), which still resolves — only the version we would have
// named is missing.
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
    : `npx ${PACKAGE_NAME} ${args}`;
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

  // The pre-publication case: the site is built ahead of the first publish and
  // would otherwise render an unpinned command on a page whose job is to name
  // the version. Consulted ONLY when the registry says the package is not there,
  // so it expires by itself — the first real publish outranks it and the page
  // starts quoting the version npm actually serves, with nobody editing
  // anything. REDLINE_NPM_VERSION above still wins outright, for the air-gapped
  // build that cannot ask at all.
  const fallback = process.env["REDLINE_NPM_FALLBACK_VERSION"];

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
    if (response.status === 404) return unpublished(fallback);
    if (!response.ok) return { status: "unknown", reason: `registry returned ${response.status}` };

    const body = (await response.json()) as {
      "dist-tags"?: Record<string, string>;
      time?: Record<string, string>;
    };
    const version = body["dist-tags"]?.["latest"];
    if (!version) return unpublished(fallback);
    return { status: "published", version, publishedAt: body.time?.[version] ?? null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "unknown", reason };
  }
}

// A registry that answered "not there" — reported as the announced version if a
// build declared one, and as the plain unpublished state otherwise.
function unpublished(fallback: string | undefined): PackageState {
  return fallback === undefined || fallback === ""
    ? { status: "unpublished" }
    : { status: "published", version: fallback, publishedAt: null };
}
