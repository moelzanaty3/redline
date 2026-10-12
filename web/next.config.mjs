import { fileURLToPath } from "node:url";

// Both roots, one value — Next requires them to agree and silently prefers
// `outputFileTracingRoot` when they disagree.
//
// It has to be the repository root, not web/: lib/rules.ts imports the shared
// rule parser at ../../scripts/lib/rules.mjs, and Turbopack refuses to resolve
// anything above its root. Stating it also settles the inference this pin
// originally existed for — the repository root carries the CLI's own
// package.json and package-lock.json, so Next sees two lockfiles and guesses.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
  // /docs/installation was merged into /docs/onboarding: prerequisites, the
  // once-per-org gate publish and the limitations list now sit on the page that
  // documents the command they are prerequisites for. The old URL was the site's
  // header CTA for its whole life, so it is in bookmarks and in anything that
  // ever linked the docs.
  redirects: async () => [
    {
      source: "/docs/installation",
      destination: "/docs/onboarding",
      permanent: true,
    },
    // Quick start (one long page) and the four-page Tutorial were merged into
    // Learn: one path, a page per step. Both were linked from the home page and
    // the README of the demo repository, so the old addresses keep working.
    { source: "/docs/quickstart", destination: "/docs/learn", permanent: true },
    { source: "/docs/tutorial", destination: "/docs/learn", permanent: true },
    { source: "/docs/tutorial/first-finding", destination: "/docs/learn/first-finding", permanent: true },
    { source: "/docs/tutorial/assistant", destination: "/docs/learn/first-finding", permanent: true },
    { source: "/docs/tutorial/explain-and-fix", destination: "/docs/learn/explain-and-fix", permanent: true },
    { source: "/docs/tutorial/stay-current", destination: "/docs/learn/next-steps", permanent: true },
  ],
};

export default nextConfig;
