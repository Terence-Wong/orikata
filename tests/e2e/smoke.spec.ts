import { expect, test } from "@playwright/test";

// Placeholder that proves the Playwright layer runs in CI. Replaced by the real e2e scenarios.
test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Orikata");
});
