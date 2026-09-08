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
};

export default nextConfig;
