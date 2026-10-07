// The parts of the version lookup the browser needs too. Kept apart from
// package-version.ts because that module reads the repository from disk, and a
// client component that imported it would pull node:fs into the bundle.

export type PackageState =
  | { status: "published"; version: string; publishedAt: string | null }
  | { status: "unpublished" }
  | { status: "unknown"; reason: string };

export const PACKAGE_NAME = "redlinegate";

// The full packument, not the abbreviated `application/vnd.npm.install-v1+json`
// one: the abbreviated document has no `time` field, so the publish date was
// always missing.
export interface Packument {
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
}

// null when the registry has the name but no `latest` tag — the caller decides
// what that means, because the build has a pre-publication fallback and the
// browser does not.
export function latestFrom(body: Packument): PackageState | null {
  const version = body["dist-tags"]?.["latest"];
  if (!version) return null;
  return { status: "published", version, publishedAt: body.time?.[version] ?? null };
}
