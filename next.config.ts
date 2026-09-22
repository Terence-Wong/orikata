import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Single-app repo: trace from here, not from a stray workspace file in a parent directory.
  outputFileTracingRoot: import.meta.dirname,
  // The dev fixture route reads these at request time.
  outputFileTracingIncludes: {
    "/dev/[fixture]": ["./fixtures/valid/*.fold"],
    "/bench": ["./fixtures/valid/*.fold"],
  },
};

export default nextConfig;
