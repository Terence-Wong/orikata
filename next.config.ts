import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Single-app repo: trace from here, not from a stray workspace file in a parent directory.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
