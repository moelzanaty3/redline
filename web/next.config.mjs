import { fileURLToPath } from "node:url";

// The repository root now also carries the CLI's own package.json and
// package-lock.json (this branch), so Next sees two lockfiles and infers the
// wrong workspace root for file tracing. Pin it explicitly to web/.
const webRoot = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: webRoot,
};

export default nextConfig;
