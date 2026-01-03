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

  test("hides create button when event creation is disabled", async ({ page }) => {
    await page.route("**/api/config", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          allowedDomains: ["localhost"],
          supportSubdomain: true,
          allowEventCreation: false,
        }),
      });
    });

    await page.goto("/");
    await expect(page.getByTestId("home-cta")).toHaveCount(0);
  });

  test("shows domain not allowed when hostname is not in config", async ({ page }) => {
    await page.route("**/api/config", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          allowedDomains: ["example.com"],
          supportSubdomain: true,
          allowEventCreation: true,
        }),
      });
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /fehler|error/i })).toBeVisible();
    await expect(page.getByTestId("domain-not-allowed")).toBeVisible();
  });
});
