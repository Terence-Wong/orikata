import { chromium } from "@playwright/test";
const [, , out, fixture, steps] = process.argv;
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
await page.goto(`http://localhost:3000/dev/${fixture}`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="viewer"][data-loaded="true"]');
for (let i = 0; i < Number(steps); i++) {
  await page.getByTestId("next-step").click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="viewer"]')?.getAttribute("data-transitioning") ===
      "false",
    null,
    { timeout: 15000 },
  );
}
await page.waitForTimeout(400);
await page.getByTestId("viewer-canvas").screenshot({ path: out });
await browser.close();
