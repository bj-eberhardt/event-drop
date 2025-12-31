import { expect, test } from "@playwright/test";

test.describe("home view", () => {
  test("homepage renders", async ({ page }) => {
    await page.goto("/");
    const logo = page.getByTestId("home-logo");
    await expect(logo).toBeVisible();
    const naturalWidth = await logo.evaluate((img) =>
      img instanceof HTMLImageElement ? img.naturalWidth : 0
    );
    expect(naturalWidth).toBeGreaterThan(0);
    await expect(page.getByTestId("home-title")).toBeVisible();
    await expect(page.getByTestId("home-lede")).toBeVisible();
  });
});
