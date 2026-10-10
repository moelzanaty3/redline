"use client";

import { useEffect, useState } from "react";
import { latestFrom, PACKAGE_NAME, type Packument, type PackageState } from "@/lib/npm-registry";

// The three states are deliberately worded differently. "Not published yet" is a
// fact about the package; "could not check" is a fact about this build. Collapsing
// them would let a network blip read as a missing release.
//
// `initial` is what the build saw, and the page is static, so on its own it is
// only as fresh as the last deploy — a release that lands without one left the
// badge naming the previous version. The browser asks the registry again after
// the page loads. The pages stay prerendered, because they are build gates: they
// throw when the repository no longer says what they claim.
export function PackageBadge({ initial, registry }: { initial: PackageState; registry: string | null }) {
  const [state, setState] = useState(initial);

  useEffect(() => {
    if (registry === null) return;
    const controller = new AbortController();
    fetch(`${registry}/${PACKAGE_NAME}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const latest = latestFrom((await response.json()) as Packument);
        if (latest) setState(latest);
      })
      // Deliberately quiet: a reader whose browser cannot reach the registry
      // still has the build's answer on screen, and that is all this can offer.
      .catch(() => {});
    return () => controller.abort();
  }, [registry]);

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
