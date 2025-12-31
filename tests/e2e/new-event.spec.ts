import { expect, test } from "@playwright/test";
import { buildEventUrl, getMode } from "./support/urls";
import { createEvent } from "./support/api";
import { createCleanupTracker } from "./support/cleanup";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cleanup = createCleanupTracker();

test.afterEach(async ({ request }) => {
  await cleanup.cleanupAll(request);
});

test.describe("new event view", () => {
  test("new event cancel returns to home", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    await page.getByTestId("new-event-cancel").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("home-logo")).toBeVisible();
  });

  test("create event and land on upload page", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL;
    testInfo.skip(!baseURL, "baseURL required");

    const mode = getMode();
    const eventId = `e2e-${Date.now()}`;

    await page.goto("/");
    await page.getByTestId("home-cta").click();

    await expect(page.getByTestId("new-event-form")).toBeVisible();
    await page.getByTestId("new-event-name").fill("E2E Event");
    await page.getByTestId("new-event-subdomain").fill(eventId);
    await page.getByTestId("new-event-admin-password").fill("adminpass123");
    await page.getByTestId("new-event-admin-password-confirm").fill("adminpass123");

    await expect(page.getByTestId("new-event-availability")).toContainText(/verf.gbar/i);
    await page.getByTestId("new-event-submit").click();

    const expectedUrl = buildEventUrl(baseURL as string, mode, eventId, true);
    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(expectedUrl)}/?$`));

    const passwordPrompt = page.getByTestId("password-prompt");
    if (await passwordPrompt.isVisible()) {
      await page.getByTestId("password-input").fill("adminpass123");
      await page.getByTestId("password-submit").click();
    }

    await expect(page.getByTestId("admin-view")).toBeVisible();
    await expect(page.getByTestId("filebrowser-admin")).toBeVisible();
    await expect(
      page.locator('[data-testid="admin-settings-form"], [data-testid="admin-settings-loading"]')
    ).toBeVisible();
    await expect(page.getByTestId("admin-delete-section")).toBeVisible();
  });

  test("new event rejects reserved subdomain names", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    const reserved = ["admin", "login", "logout", "api", "docs", "static", "public", "uploads"];
    const subdomainInput = page.getByTestId("new-event-subdomain");
    const availability = page.getByTestId("new-event-availability");

    for (const value of reserved) {
      await subdomainInput.fill(value);
      await expect(availability).toContainText(/erlaubte subdomain|erlaubter pfad/i);
    }
  });

  test("new event rejects illegal characters in subdomain", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    await page.getByTestId("new-event-subdomain").fill("bad?.name");
    await expect(page.getByTestId("new-event-availability")).toContainText(/nur kleinbuchstaben/i);
  });

  test("new event requires a name", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    await page.getByTestId("new-event-submit").click();
    await expect(page.getByTestId("new-event-submit-error")).toContainText(/projektnamen/i);
  });

  test("new event name is limited to 48 characters", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    const nameInput = page.getByTestId("new-event-name");
    await expect(nameInput).toHaveAttribute("maxlength", "48");
    await nameInput.fill("a".repeat(60));
    await expect(nameInput).toHaveValue("a".repeat(48));
  });

  test("new event description is limited to 2048 characters", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    const descriptionInput = page.getByTestId("new-event-description");
    await expect(descriptionInput).toHaveAttribute("maxlength", "2048");
    await descriptionInput.fill("a".repeat(2100));
    await expect(descriptionInput).toHaveValue("a".repeat(2048));
  });

  test("new event rejects subdomains shorter than 3 characters", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    await page.getByTestId("new-event-name").fill("Validation Event");
    await page.getByTestId("new-event-subdomain").fill("aa");
    await expect(page.getByTestId("new-event-availability")).toContainText(/mindestens 3/i);
    await page.getByTestId("new-event-submit").click();
    await expect(page.getByTestId("new-event-submit-error")).toContainText(/subdomain|pfad/i);
  });

  test("new event rejects subdomains with leading or trailing dashes", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    await page.getByTestId("new-event-subdomain").fill("-bad");
    await expect(page.getByTestId("new-event-availability")).toContainText(
      /erlaubte subdomain|erlaubter pfad/i
    );
  });

  test("new event rejects already used subdomains", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const eventId = `e2e-taken-${Date.now()}`;
    const adminPassword = "adminpass123";

    await createEvent(
      request,
      {
        name: "Taken Event",
        description: "",
        eventId,
        guestPassword: "",
        adminPassword,
        adminPasswordConfirm: adminPassword,
        allowedMimeTypes: [],
      },
      baseURL
    );
    cleanup.track({ eventId, adminPassword, baseURL });

    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();
    await page.getByTestId("new-event-subdomain").fill(eventId);
    await expect(page.getByTestId("new-event-availability")).toContainText(/vergeben/i);
  });

  test("admin password confirmation must match", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    const eventId = `e2ematch${Date.now()}`;
    await page.getByTestId("new-event-name").fill("Validation Event");
    await page.getByTestId("new-event-subdomain").fill(eventId);
    await expect(page.getByTestId("new-event-availability")).toContainText(/verf.gbar/i);

    await page.getByTestId("new-event-admin-password").fill("adminpass123");
    await page.getByTestId("new-event-admin-password-confirm").fill("adminpass321");
    await page.getByTestId("new-event-submit").click();

    const adminConfirm = page.getByTestId("new-event-admin-password-confirm");
    const isValid = await adminConfirm.evaluate((input) =>
      input instanceof HTMLInputElement ? input.checkValidity() : false
    );
    expect(isValid).toBe(false);
    await expect(page).toHaveURL(/\/new\/?$/);
  });

  test("admin password requires at least 8 characters", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByTestId("new-event-form")).toBeVisible();

    const eventId = `e2echeck${Date.now()}`;
    await page.getByTestId("new-event-name").fill("Validation Event");
    await page.getByTestId("new-event-subdomain").fill(eventId);
    await expect(page.getByTestId("new-event-availability")).toContainText(/verf.gbar/i);

    await page.getByTestId("new-event-admin-password").fill("short7");
    await page.getByTestId("new-event-admin-password-confirm").fill("short7");
    await page.getByTestId("new-event-submit").click();

    const adminPassword = page.getByTestId("new-event-admin-password");
    const isValid = await adminPassword.evaluate((input) =>
      input instanceof HTMLInputElement ? input.checkValidity() : false
    );
    expect(isValid).toBe(false);
    await expect(page).toHaveURL(/\/new\/?$/);
  });
});
