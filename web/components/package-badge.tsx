import { PACKAGE_NAME, type PackageState } from "@/lib/package-version";

// The three states are deliberately worded differently. "Not published yet" is a
// fact about the package; "could not check" is a fact about this build. Collapsing
// them would let a network blip read as a missing release.
export function PackageBadge({ state }: { state: PackageState }) {
  if (state.status === "published") {
    return (
      <div className="callout ok">
        <span className="ic">✓</span>
        <p>
          <b>
            {PACKAGE_NAME}@{state.version}
          </b>{" "}
          is the version on npm&apos;s <code>latest</code> tag
          {state.publishedAt
            ? `, published ${new Date(state.publishedAt).toISOString().slice(0, 10)}`
            : ""}
          . Every command on this page installs it.
        </p>
      </div>
    );
  }
  if (state.status === "unpublished") {
    return (
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>Not published yet.</b> <code>{PACKAGE_NAME}</code> is not on the npm
          registry, so <code>npx {PACKAGE_NAME}</code> cannot resolve yet. This
          page updates itself the day the first release lands — no edit here.
        </p>
      </div>
    );
  }
  return (
    <div className="callout info">
      <span className="ic">ℹ</span>
      <p>
        <b>Version not checked.</b> This build could not reach the npm registry
        ({state.reason}), so the installable version is unknown — not
        necessarily missing. Check <code>npm view {PACKAGE_NAME} version</code>{" "}
        yourself.
      </p>
    </div>
  );
}
