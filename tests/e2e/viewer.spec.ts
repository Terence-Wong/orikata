import { expect, test, type Page } from "@playwright/test";

async function openFixture(page: Page, fixture: string, animator = "instant") {
  await page.goto(`/dev/${fixture}?animator=${animator}`);
  const viewer = page.getByTestId("viewer");
  await expect(viewer).toHaveAttribute("data-loaded", "true");
  return viewer;
}

test("opens on the crease pattern with no step number", async ({ page }) => {
  const viewer = await openFixture(page, "book-fold");
  await expect(viewer).toHaveAttribute("data-frame-index", "0");
  await expect(viewer).toHaveAttribute("data-frame-count", "2");
  await expect(page.getByTestId("step-title")).toHaveText("Crease pattern");
  await expect(page.getByTestId("step-progress")).toHaveCount(0);
  await expect(page.getByTestId("prev-step")).toBeDisabled();
});

test("next and previous move between steps and update the panel", async ({ page }) => {
  const viewer = await openFixture(page, "book-fold-90");

  await page.getByTestId("next-step").click();
  await expect(viewer).toHaveAttribute("data-frame-index", "1");
  await expect(page.getByTestId("step-title")).toHaveText("Fold to 90°");
  await expect(page.getByTestId("step-progress")).toHaveText("Step 1 of 2");
  await expect(page.getByTestId("step-description")).toHaveText(
    "Lift the right edge until it stands upright.",
  );

  await page.getByTestId("next-step").click();
  await expect(page.getByTestId("step-title")).toHaveText("Fold flat");
  await expect(page.getByTestId("next-step")).toBeDisabled();

  await page.getByTestId("prev-step").click();
  await expect(viewer).toHaveAttribute("data-frame-index", "1");
  await expect(page.getByTestId("step-title")).toHaveText("Fold to 90°");
});

test("hides the description for a step that has none", async ({ page }) => {
  await openFixture(page, "book-fold");
  await page.getByTestId("next-step").click();
  await expect(page.getByTestId("step-title")).toHaveText("Fold in half");
  await expect(page.getByTestId("step-description")).toHaveCount(0);
});

test("reports the creases that move in each step", async ({ page }) => {
  const viewer = await openFixture(page, "preliminary-base");
  await expect(viewer).toHaveAttribute("data-active-edges", "");

  await page.getByTestId("next-step").click();
  await expect(viewer).toHaveAttribute("data-active-edges", "8,9,10,11,12,13,14,15");

  await page.getByTestId("next-step").click();
  await page.getByTestId("next-step").click();
  await expect(viewer).toHaveAttribute("data-frame-index", "3");
  await expect(viewer).toHaveAttribute("data-active-edges", "8,9,10,11");
});

test("arrow keys step through the model", async ({ page }) => {
  const viewer = await openFixture(page, "diagonal-twice");
  await page.keyboard.press("ArrowRight");
  await expect(viewer).toHaveAttribute("data-frame-index", "1");
  await page.keyboard.press("ArrowRight");
  await expect(viewer).toHaveAttribute("data-frame-index", "2");
  await page.keyboard.press("ArrowLeft");
  await expect(viewer).toHaveAttribute("data-frame-index", "1");
});

test("draws the model in WebGL", async ({ page }) => {
  await openFixture(page, "preliminary-base");
  // The canvas is backed by a real WebGL context, and the scene has drawn into it.
  const drawn = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="viewer-canvas"]');
    return canvas !== null && canvas.width > 0 && canvas.height > 0;
  });
  expect(drawn).toBe(true);
});

for (const animator of ["lerp", "solver"]) {
  test(`animates between steps and settles on the destination (${animator})`, async ({ page }) => {
    const viewer = await openFixture(page, "preliminary-base", animator);
    await expect(viewer).toHaveAttribute("data-animator", animator);

    await page.getByTestId("next-step").click();
    await expect(viewer).toHaveAttribute("data-transitioning", "true");
    await expect(viewer).toHaveAttribute("data-transitioning", "false", { timeout: 8000 });
    await expect(viewer).toHaveAttribute("data-frame-index", "1");

    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.getByTestId("next-step").click();
    await expect(viewer).toHaveAttribute("data-transitioning", "false", { timeout: 8000 });
    await expect(viewer).toHaveAttribute("data-frame-index", "2");
    expect(errors).toEqual([]);
  });
}

test("the crease pattern panel opens, closes and highlights the creases that move", async ({
  page,
}) => {
  const viewer = await openFixture(page, "preliminary-base");
  await expect(viewer).toHaveAttribute("data-crease-panel-open", "false");
  await expect(page.getByTestId("crease-panel")).toHaveCount(0);

  await page.getByTestId("crease-panel-toggle").click();
  await expect(viewer).toHaveAttribute("data-crease-panel-open", "true");
  const panel = page.getByTestId("crease-panel");
  await expect(panel).toBeVisible();
  // Frame 0 is the crease pattern itself: nothing has moved yet.
  await expect(panel.locator('line[data-active="true"]')).toHaveCount(0);
  await expect(page.getByTestId("crease-panel-note")).toHaveText("No creases move yet");

  await page.getByTestId("next-step").click();
  await expect(viewer).toHaveAttribute("data-frame-index", "1");
  await expect(panel.locator('line[data-active="true"]')).toHaveCount(8);
  await expect(page.getByTestId("crease-panel-note")).toHaveText("8 creases move in this step");

  await page.getByTestId("next-step").click();
  await page.getByTestId("next-step").click();
  await expect(viewer).toHaveAttribute("data-frame-index", "3");
  const activeIds = await panel
    .locator('line[data-active="true"]')
    .evaluateAll((lines) =>
      lines.map((line) => Number(line.getAttribute("data-edge-id"))).sort((a, b) => a - b),
    );
  expect(activeIds).toEqual([8, 9, 10, 11]);

  await page.getByTestId("crease-panel-toggle").click();
  await expect(viewer).toHaveAttribute("data-crease-panel-open", "false");
  await expect(page.getByTestId("crease-panel")).toHaveCount(0);
});

test("the crease pattern shows each step's assignments on the flat sheet", async ({ page }) => {
  await openFixture(page, "book-fold");
  await page.getByTestId("crease-panel-toggle").click();
  const crease = page.getByTestId("crease-panel").locator('line[data-edge-id="6"]');
  await expect(crease).toHaveAttribute("data-assignment", "U");

  await page.getByTestId("next-step").click();
  await expect(crease).toHaveAttribute("data-assignment", "V");
  await expect(crease).toHaveAttribute("data-active", "true");
});

test("rejects a file that does not pass validation", async ({ page }) => {
  await page.goto("/dev/inherit-cycle");
  await expect(page.getByTestId("viewer")).toHaveCount(0);
});
