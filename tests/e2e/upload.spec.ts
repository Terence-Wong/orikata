import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const fixture = (kind: "valid" | "invalid", name: string) =>
  join(process.cwd(), "fixtures", kind, `${name}.fold`);

async function uploadFixture(page: Page, kind: "valid" | "invalid", name: string) {
  await page.goto("/");
  await page.getByTestId("upload-input").setInputFiles(fixture(kind, name));
}

test("uploading a model gives a shareable link to its viewer", async ({ page }) => {
  await uploadFixture(page, "valid", "preliminary-base");

  await page.waitForURL(/\/view\/[23456789abcdefghjkmnpqrstuvwxyz]{11}$/, { timeout: 20000 });
  const viewer = page.getByTestId("viewer");
  await expect(viewer).toHaveAttribute("data-loaded", "true");
  await expect(viewer).toHaveAttribute("data-frame-index", "0");
  await expect(viewer).toHaveAttribute("data-frame-count", "4");
  await expect(page.getByTestId("step-title")).toHaveText("Precreased square");

  // The link on the page is the page's own URL.
  await expect(page.getByTestId("share-url")).toHaveValue(page.url());
});

test("a shared link opens the model in a fresh browser", async ({ page, browser }) => {
  await uploadFixture(page, "valid", "book-fold-90");
  await page.waitForURL(/\/view\//, { timeout: 20000 });
  const url = page.url();

  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto(url);
  await expect(visitor.getByTestId("viewer")).toHaveAttribute("data-loaded", "true");
  await expect(visitor.getByTestId("viewer")).toHaveAttribute("data-frame-count", "3");
  await expect(visitor.getByTestId("step-title")).toHaveText("Square");

  await visitor.getByTestId("next-step").click();
  await expect(visitor.getByTestId("step-title")).toHaveText("Fold to 90°");
  await context.close();
});

test.describe("files that cannot be opened", () => {
  test("an invalid file is refused without leaving the page", async ({ page }) => {
    await uploadFixture(page, "invalid", "inherit-cycle");

    const error = page.getByTestId("upload-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("inherits from itself");
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByTestId("upload")).toHaveAttribute("data-status", "idle");
  });

  test("a single-frame file says what is wrong with it", async ({ page }) => {
    await uploadFixture(page, "invalid", "one-frame");
    await expect(page.getByTestId("upload-error")).toContainText("at least two frames");
  });

  test("a file that is not JSON says so", async ({ page }) => {
    await uploadFixture(page, "invalid", "invalid-json");
    await expect(page.getByTestId("upload-error")).toContainText("not valid JSON");
  });

  test("a valid file can be uploaded after a rejected one", async ({ page }) => {
    await uploadFixture(page, "invalid", "one-frame");
    await expect(page.getByTestId("upload-error")).toBeVisible();

    await page.getByTestId("upload-input").setInputFiles(fixture("valid", "book-fold"));
    await page.waitForURL(/\/view\//, { timeout: 20000 });
    await expect(page.getByTestId("viewer")).toHaveAttribute("data-frame-count", "2");
  });
});

test("an unknown slug is a 404", async ({ page }) => {
  const response = await page.goto("/view/zzzzzzzzzzz");
  expect(response?.status()).toBe(404);
});

test("a malformed slug is a 404 rather than an error", async ({ page }) => {
  const response = await page.goto("/view/nope");
  expect(response?.status()).toBe(404);
});
