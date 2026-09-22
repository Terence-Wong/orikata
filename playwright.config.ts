import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
// The e2e-live workflow points the same suite at a real Neon branch and Blob store.
const live = process.env.ORIKATA_LIVE_BACKEND === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Headless Chromium has no GPU in CI; SwiftShader provides a software WebGL context.
        launchOptions: {
          args: [
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
          ],
        },
      },
    },
  ],
  webServer: {
    command: isCI ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      // The fixture routes the viewer tests use are off by default in a production build.
      ORIKATA_DEV_ROUTES: "1",
      // Postgres in process and uploads on disk, so the suite needs no Vercel credentials.
      ORIKATA_LOCAL_BACKEND: live ? "0" : "1",
      ORIKATA_LOCAL_PGDATA: "memory",
      RATE_LIMIT_SALT: process.env.RATE_LIMIT_SALT ?? "playwright",
      CRON_SECRET: process.env.CRON_SECRET ?? "playwright",
    },
  },
});
