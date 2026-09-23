import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Single-app repo: trace from here, not from a stray workspace file in a parent directory.
  outputFileTracingRoot: import.meta.dirname,
  // The dev fixture route reads these at request time.
  outputFileTracingIncludes: {
    "/examples/[name]": ["./fixtures/valid/*.fold"],
    "/bench": ["./fixtures/valid/*.fold"],
  },
  // PGlite is only loaded by the local backend, and only on the server.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
