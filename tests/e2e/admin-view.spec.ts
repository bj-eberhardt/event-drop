import { expect, test as base } from "@playwright/test";
import { cleanupEvent, createEvent, getEvent, isEventAvailable } from "./support/api";
import { buildEventUrl, getMode } from "./support/urls";

type AdminEventFixture = {
  eventId: string;
  adminPassword: string;
  baseURL?: string;
};

const test = base.extend<{ adminEvent: AdminEventFixture }>({
  adminEvent: async ({ request }, use, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const eventId = `e2e-admin-${Date.now()}`;
    const adminPassword = "adminpass123";

    await createEvent(
      request,
      {
        name: "Admin View Test",
        description: "",
        eventId,
        guestPassword: "1234",
        adminPassword,
        adminPasswordConfirm: adminPassword,
        allowedMimeTypes: [],
      },
      baseURL
    );

    await use({ eventId, adminPassword, baseURL });

    await cleanupEvent(request, eventId, adminPassword, baseURL);
  },
});

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const expectInViewport = async (page: import("@playwright/test").Page, selector: string) => {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  if (!box || !viewport) return;
  const withinVertical = box.y < viewport.height && box.y + box.height > 0;
  const withinHorizontal = box.x < viewport.width && box.x + box.width > 0;
  expect(withinVertical && withinHorizontal).toBe(true);
};

const loginIfPrompted = async (page: import("@playwright/test").Page, password: string) => {
  const prompt = page.getByTestId("password-prompt");
  try {
    await expect(prompt).toBeVisible({ timeout: 2000 });
  } catch {
    return;
  }
  await page.getByTestId("password-input").fill(password);
  await page.getByTestId("password-submit").click();
  await expect(prompt).toHaveCount(0);
};

test.describe("admin event view", () => {
  test("shows sections, share link, and empty file browser", async ({
    page,
    context,
    adminEvent,
  }, testInfo) => {
    testInfo.skip(!adminEvent.baseURL, "baseURL required");

    await test.step("open admin view", async () => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);

      const mode = getMode();
      const adminUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId, true);

      await page.goto(adminUrl);
      await loginIfPrompted(page, adminEvent.adminPassword);

      const adminUrlPattern = new RegExp(`^${escapeRegExp(adminUrl)}/?$`);
      await expect(page).toHaveURL(adminUrlPattern);
      await expect(page.getByTestId("admin-view")).toBeVisible();
    });

    await test.step("verify share link and copy", async () => {
      const mode = getMode();
      const shareUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId);
      const shareInput = page.getByTestId("admin-share-input");
      await expect(shareInput).toHaveValue(shareUrl);
      await page.getByTestId("admin-share-copy").click();
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboard).toBe(shareUrl);
    });

    await test.step("verify empty file browser", async () => {
      const fileBrowser = page.getByTestId("filebrowser-admin");
      await expect(fileBrowser).toBeVisible();
      await expect(fileBrowser).toContainText("Noch keine Dateien hochgeladen.");
    });

    await test.step("verify settings and delete sections", async () => {
      const settingsForm = page.getByTestId("admin-settings-form");
      await expect(settingsForm).toBeVisible();
      await expect(page.getByLabel("Projektname")).toHaveValue("Admin View Test");
      await expect(page.getByTestId("admin-delete-section")).toBeVisible();
    });
  });

  test("overview navigation scrolls to sections", async ({ page, adminEvent }, testInfo) => {
    testInfo.skip(!adminEvent.baseURL, "baseURL required");

    await test.step("open admin view", async () => {
      const mode = getMode();
      const adminUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId, true);

      await page.goto(adminUrl);
      await loginIfPrompted(page, adminEvent.adminPassword);
      await expect(page.getByTestId("admin-view")).toBeVisible();
    });

    await test.step("navigate to files section", async () => {
      await page.getByTestId("admin-overview-files").click();
      await expect(page).toHaveURL(/#admin-files$/);
      await expectInViewport(page, '[data-testid="admin-files"]');
    });

    await test.step("navigate to settings section", async () => {
      await page.getByTestId("admin-overview-settings").click();
      await expect(page).toHaveURL(/#admin-settings$/);
      await expectInViewport(page, '[data-testid="admin-settings"]');
    });

    await test.step("navigate to removal section", async () => {
      await page.getByTestId("admin-overview-removal").click();
      await expect(page).toHaveURL(/#admin-removal$/);
      await expectInViewport(page, '[data-testid="admin-removal"]');
    });
  });

  test("admin settings updates guest password and removal", async ({
    page,
    request,
    adminEvent,
  }, testInfo) => {
    testInfo.skip(!adminEvent.baseURL, "baseURL required");

    await test.step("open admin settings", async () => {
      const mode = getMode();
      const adminUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId, true);
      await page.goto(adminUrl);
      await loginIfPrompted(page, adminEvent.adminPassword);
      await expect(page.getByTestId("admin-view")).toBeVisible();

      await page.getByTestId("admin-overview-settings").click();
      await expect(page.getByTestId("admin-settings")).toBeVisible();
      await expect(page.getByTestId("admin-settings-form")).toBeVisible();
    });

    await test.step("set guest password and verify guest access", async () => {
      const guestPassword = "guestpass123";
      await page.getByTestId("admin-guest-password-edit").click();
      await page.getByTestId("admin-guest-password").fill(guestPassword);
      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /einstellungen gespeichert/i
      );

      const guestResponse = await getEvent(request, adminEvent.eventId, adminEvent.baseURL, {
        type: "guest",
        password: guestPassword,
      });
      expect(guestResponse.status()).toBe(200);
    });

    await test.step("clear guest password and verify open access", async () => {
      await page.getByTestId("admin-guest-password-edit").click();
      await page.getByTestId("admin-guest-password").fill("");
      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /einstellungen gespeichert/i
      );

      const openResponse = await getEvent(request, adminEvent.eventId, adminEvent.baseURL);
      expect(openResponse.status()).toBe(200);
    });
  });

  test("guest download checkbox requires guest password", async ({
    page,
    adminEvent,
  }, testInfo) => {
    testInfo.skip(!adminEvent.baseURL, "baseURL required");

    await test.step("open admin settings", async () => {
      const mode = getMode();
      const adminUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId, true);
      await page.goto(adminUrl);
      await loginIfPrompted(page, adminEvent.adminPassword);
      await expect(page.getByTestId("admin-view")).toBeVisible();

      await page.getByTestId("admin-overview-settings").click();
      await expect(page.getByTestId("admin-settings-form")).toBeVisible();
    });

    await test.step("enable download when password is set", async () => {
      const downloadCheckbox = page.getByTestId("admin-guest-download");
      await expect(downloadCheckbox).toBeEnabled();

      await downloadCheckbox.check();
      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /einstellungen gespeichert/i
      );
    });

    await test.step("disable download when password cleared", async () => {
      const downloadCheckbox = page.getByTestId("admin-guest-download");
      await page.getByTestId("admin-guest-password-edit").click();
      await page.getByTestId("admin-guest-password").fill("");
      await expect(downloadCheckbox).toBeDisabled();
      await expect(downloadCheckbox).not.toBeChecked();

      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /einstellungen gespeichert/i
      );
    });
  });

  test("admin settings validation and mime types", async ({
    page,
    request,
    adminEvent,
  }, testInfo) => {
    testInfo.skip(!adminEvent.baseURL, "baseURL required");

    const mode = getMode();
    const adminUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId, true);
    await test.step("open admin settings", async () => {
      await page.goto(adminUrl);
      await loginIfPrompted(page, adminEvent.adminPassword);
      await expect(page.getByTestId("admin-view")).toBeVisible();
      await page.getByTestId("admin-overview-settings").click();
      await expect(page.getByTestId("admin-settings-form")).toBeVisible();
    });

    await test.step("validate project name length", async () => {
      const nameInput = page.getByLabel("Projektname");
      await expect(nameInput).toHaveAttribute("maxlength", "48");
      await nameInput.fill("a".repeat(60));
      await expect(nameInput).toHaveValue("a".repeat(48));
    });

    await test.step("validate description length", async () => {
      const descriptionInput = page.getByLabel("Beschreibung");
      await expect(descriptionInput).toHaveAttribute("maxlength", "2048");
      await descriptionInput.fill("b".repeat(2100));
      await expect(descriptionInput).toHaveValue("b".repeat(2048));
    });

    await test.step("validate guest password min length", async () => {
      const guestPasswordInput = page.getByTestId("admin-guest-password");
      if (await page.getByTestId("admin-guest-password-edit").count()) {
        await page.getByTestId("admin-guest-password-edit").click();
      }
      await guestPasswordInput.fill("abc");
      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(/mindestens 4/i);
      await guestPasswordInput.fill("");
    });

    await test.step("add predefined mime type group", async () => {
      await page.getByTestId("mime-group-images").click();
      await expect(page.getByTestId("mime-tag").filter({ hasText: "image/*" })).toBeVisible();
      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /einstellungen gespeichert/i
      );
    });

    await test.step("add custom mime type", async () => {
      const mimeInput = page.getByTestId("mime-input");
      await mimeInput.fill("application/x-test");
      await mimeInput.press("Enter");
      await expect(
        page.getByTestId("mime-tag").filter({ hasText: "application/x-test" })
      ).toBeVisible();
      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /einstellungen gespeichert/i
      );
    });

    await test.step("remove custom mime type", async () => {
      const customTag = page.getByTestId("mime-tag").filter({ hasText: "application/x-test" });
      await customTag.getByTestId("mime-remove").click();
      await expect(
        page.getByTestId("mime-tag").filter({ hasText: "application/x-test" })
      ).toHaveCount(0);
      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /einstellungen gespeichert/i
      );
    });

    await test.step("verify persisted settings via API", async () => {
      const response = await getEvent(request, adminEvent.eventId, adminEvent.baseURL, {
        type: "admin",
        password: adminEvent.adminPassword,
      });
      expect(response.status()).toBe(200);
      const event = await response.json();
      expect(event.name).toBe("a".repeat(48));
      expect(event.description).toBe("b".repeat(2048));
      expect(event.allowedMimeTypes).toContain("image/*");
      expect(event.allowedMimeTypes).not.toContain("application/x-test");
      expect(event.secured).toBe(false);
      expect(event.allowGuestDownload).toBe(false);
    });
  });

  test("logout redirects and requires password on return", async ({
    page,
    adminEvent,
  }, testInfo) => {
    testInfo.skip(!adminEvent.baseURL, "baseURL required");

    const mode = getMode();
    const adminUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId, true);
    const projectUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId);

    await test.step("prompt rejects wrong password", async () => {
      await page.goto(adminUrl);
      await expect(page.getByTestId("password-prompt")).toBeVisible();

      await page.getByTestId("password-input").fill("wrongpass");
      await page.getByTestId("password-submit").click();
      await expect(page.getByTestId("password-error")).toContainText(/falsches passwort/i);
    });

    await test.step("login succeeds and logout returns to guest page", async () => {
      await page.getByTestId("password-input").fill(adminEvent.adminPassword);
      await page.getByTestId("password-submit").click();
      await expect(page.getByTestId("admin-view")).toBeVisible();

      await page.getByTestId("admin-logout").click();
      await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(projectUrl)}/?$`));
      await expect(page.getByTestId("password-prompt")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /g.ste-passwort erforderlich/i })
      ).toBeVisible();
    });

    await test.step("admin URL requires password again", async () => {
      await page.goto(adminUrl);
      await expect(page.getByTestId("password-prompt")).toBeVisible();
    });
  });

  test("delete flow disables button until match and removes event", async ({
    page,
    request,
    adminEvent,
  }, testInfo) => {
    testInfo.skip(!adminEvent.baseURL, "baseURL required");

    const mode = getMode();
    const adminUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId, true);

    await test.step("open admin view", async () => {
      await page.goto(adminUrl);
      await loginIfPrompted(page, adminEvent.adminPassword);
      await expect(page.getByTestId("admin-view")).toBeVisible();
    });

    const deleteInput = page.getByTestId("admin-delete-input");
    const deleteOpen = page.getByTestId("admin-delete-open");

    await test.step("delete button disabled until exact match", async () => {
      await deleteInput.fill("wrong-id");
      await expect(deleteOpen).toBeDisabled();

      await deleteInput.fill(adminEvent.eventId);
      await expect(deleteOpen).toBeEnabled();
    });

    await test.step("cancel delete confirmation", async () => {
      await deleteOpen.click();
      await expect(page.getByTestId("modal")).toBeVisible();
      await page.getByTestId("modal-cancel").click();
      await expect(page.getByTestId("modal")).toHaveCount(0);
    });

    await test.step("confirm deletion and return home", async () => {
      await deleteOpen.click();
      await expect(page.getByTestId("modal")).toBeVisible();

      const homeUrlPattern = new RegExp(`^${escapeRegExp(adminEvent.baseURL as string)}/?$`);
      await Promise.all([
        page.waitForURL(homeUrlPattern),
        page.getByTestId("modal-confirm").click(),
      ]);

      await expect(page.getByTestId("home-logo")).toBeVisible();

      const available = await isEventAvailable(request, adminEvent.eventId, adminEvent.baseURL);
      expect(available).toBe(true);
    });
  });
});
