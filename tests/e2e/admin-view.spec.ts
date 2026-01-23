import { expect, test as base } from "@playwright/test";
import { cleanupEvent, createEvent, getEvent, isEventAvailable, uploadFile } from "./support/api";
import { readFile } from "node:fs/promises";
import { getUniqueEventId } from "./support/ids";
import { buildEventUrl, getMode } from "./support/urls";

type AdminEventFixture = {
  eventId: string;
  adminPassword: string;
  baseURL?: string;
};

const test = base.extend<{ adminEvent: AdminEventFixture }>({
  adminEvent: async ({ request }, useFixture, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const eventId = getUniqueEventId("e2e-admin");
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

    await useFixture({ eventId, adminPassword, baseURL });

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

const waitForPromptOrAdmin = async (page: import("@playwright/test").Page, timeout = 12_000) => {
  const prompt = page.getByTestId("password-prompt");
  const adminView = page.getByTestId("admin-view");
  try {
    return await Promise.race([
      prompt.waitFor({ state: "visible", timeout }).then(() => "prompt" as const),
      adminView.waitFor({ state: "visible", timeout }).then(() => "admin" as const),
    ]);
  } catch {
    return "none" as const;
  }
};

const loginIfPrompted = async (page: import("@playwright/test").Page, password: string) => {
  const prompt = page.getByTestId("password-prompt");
  const adminView = page.getByTestId("admin-view");
  const result = await waitForPromptOrAdmin(page);
  if (result !== "prompt") return;
  await page.getByTestId("password-input").fill(password);
  await page.getByTestId("password-submit").click();
  await expect(adminView).toBeVisible();
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

    await test.step("open QR modal and copy link", async () => {
      const mode = getMode();
      const shareUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId);

      await page.getByTestId("admin-share-qr").click();
      await expect(page.getByTestId("admin-share-qr-modal")).toBeVisible();
      await expect(page.getByTestId("admin-share-qr-link")).toContainText(shareUrl);

      await page.getByTestId("admin-share-qr-copy").click();
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboard).toBe(shareUrl);
    });

    await test.step("close QR modal with Escape", async () => {
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("admin-share-qr-modal")).toHaveCount(0);
    });

    await test.step("close QR modal with X", async () => {
      await page.getByTestId("admin-share-qr").click();
      await expect(page.getByTestId("admin-share-qr-modal")).toBeVisible();
      await page.getByTestId("modal-close").click();
      await expect(page.getByTestId("admin-share-qr-modal")).toHaveCount(0);
    });

    await test.step("close QR modal with cancel button", async () => {
      await page.getByTestId("admin-share-qr").click();
      await expect(page.getByTestId("admin-share-qr-modal")).toBeVisible();
      await page.getByTestId("admin-share-qr-close").click();
      await expect(page.getByTestId("admin-share-qr-modal")).toHaveCount(0);
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

  test("admin settings require at least one guest access option", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-guest-access");
    const adminPassword = "adminpass123";

    await test.step("create event with guest access enabled", async () => {
      await createEvent(
        request,
        {
          name: "Guest Access Event",
          description: "",
          eventId,
          guestPassword: "guestpass123",
          adminPassword,
          adminPasswordConfirm: adminPassword,
          allowedMimeTypes: [],
          allowGuestDownload: true,
          allowGuestUpload: true,
        },
        baseURL
      );
    });

    await test.step("open admin settings", async () => {
      const mode = getMode();
      const adminUrl = buildEventUrl(baseURL, mode, eventId, true);
      await page.goto(adminUrl);
      await loginIfPrompted(page, adminPassword);
      await expect(page.getByTestId("admin-view")).toBeVisible();
      await page.getByTestId("admin-overview-settings").click();
      await expect(page.getByTestId("admin-settings-form")).toBeVisible();
    });

    await test.step("disable both options and verify error", async () => {
      const downloadCheckbox = page.getByTestId("admin-guest-download");
      const uploadCheckbox = page.getByTestId("admin-guest-upload");

      await downloadCheckbox.uncheck();
      await uploadCheckbox.uncheck();

      await expect(page.getByTestId("admin-guest-access-error")).toBeVisible();
      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /mindestens upload oder download/i
      );
    });

    await test.step("re-enable uploads and persist state", async () => {
      const uploadCheckbox = page.getByTestId("admin-guest-upload");
      await uploadCheckbox.check();
      await expect(page.getByTestId("admin-guest-access-error")).toHaveCount(0);

      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /einstellungen gespeichert/i
      );
    });

    await test.step("reload and verify checkbox state", async () => {
      await page.reload();
      await loginIfPrompted(page, adminPassword);
      await page.getByTestId("admin-overview-settings").click();
      await expect(page.getByTestId("admin-settings-form")).toBeVisible();

      await expect(page.getByTestId("admin-guest-download")).not.toBeChecked();
      await expect(page.getByTestId("admin-guest-upload")).toBeChecked();
    });

    await cleanupEvent(request, eventId, adminPassword, baseURL);
  });

  test("admin settings show server-side validation error", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-guest-access-api");
    const adminPassword = "adminpass123";

    await test.step("create event", async () => {
      await createEvent(
        request,
        {
          name: "Guest Access Server Error",
          description: "",
          eventId,
          guestPassword: "guestpass123",
          adminPassword,
          adminPasswordConfirm: adminPassword,
          allowedMimeTypes: [],
          allowGuestDownload: true,
          allowGuestUpload: true,
        },
        baseURL
      );
    });

    await test.step("open admin settings", async () => {
      const mode = getMode();
      const adminUrl = buildEventUrl(baseURL, mode, eventId, true);
      await page.goto(adminUrl);
      await loginIfPrompted(page, adminPassword);
      await expect(page.getByTestId("admin-view")).toBeVisible();
      await page.getByTestId("admin-overview-settings").click();
      await expect(page.getByTestId("admin-settings-form")).toBeVisible();
    });

    await test.step("simulate server validation error and show feedback", async () => {
      await page.route(new RegExp(`/api/events/${eventId}$`), async (route) => {
        if (route.request().method() !== "PATCH") {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Guest uploads or downloads must be enabled.",
            errorKey: "GUEST_ACCESS_DISABLED",
            property: "allowGuestUpload",
            additionalParams: {},
          }),
        });
      });

      const uploadCheckbox = page.getByTestId("admin-guest-upload");
      await uploadCheckbox.uncheck();
      await page.getByTestId("admin-settings-save").click();
      await expect(page.getByTestId("admin-settings-feedback")).toHaveText(
        /uploads or downloads must be enabled/i
      );
    });

    await cleanupEvent(request, eventId, adminPassword, baseURL);
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

  test("admin can browse folder and download file, then zip is available at root", async ({
    page,
    request,
    adminEvent,
  }, testInfo) => {
    testInfo.skip(!adminEvent.baseURL, "baseURL required");

    const mode = getMode();
    const adminUrl = buildEventUrl(adminEvent.baseURL as string, mode, adminEvent.eventId, true);
    const folderName = "album-1";
    const fileName = "folder-file.txt";
    const fileContent = "hello from folder";

    await test.step("upload file into folder via API", async () => {
      await uploadFile(
        request,
        adminEvent.eventId,
        { name: fileName, mimeType: "text/plain", content: fileContent },
        adminEvent.baseURL,
        { type: "admin", password: adminEvent.adminPassword },
        folderName
      );
    });

    await test.step("open admin view and navigate to folder", async () => {
      await page.goto(adminUrl);
      await loginIfPrompted(page, adminEvent.adminPassword);
      await expect(page.getByTestId("admin-view")).toBeVisible();
      await expect(page.getByTestId("filebrowser-admin")).toBeVisible();
      await expect(page.getByTestId("filebrowser-folders")).toBeVisible();
      const folderButton = page.getByTestId("filebrowser-folder").filter({ hasText: folderName });
      await expect(folderButton).toBeVisible();
      await folderButton.click();
      await expect(page.getByTestId("file-list")).toBeVisible();
      await expect(page.getByTestId("file-list")).toContainText(fileName);
    });

    await test.step("download file and verify content", async () => {
      const fileRow = page.getByTestId("file-row").filter({ hasText: fileName });
      await expect(fileRow).toBeVisible();
      const download = page.waitForEvent("download");
      await fileRow.getByTestId("file-download").click();
      const downloadEvent = await download;
      const downloadPath = await downloadEvent.path();
      const content = downloadPath ? await readFile(downloadPath, "utf8") : "";
      expect(content).toBe(fileContent);
    });

    await test.step("open delete modal and close with Escape", async () => {
      const fileRow = page.getByTestId("file-row").filter({ hasText: fileName });
      await fileRow.getByTestId("file-delete").click();
      await expect(page.getByTestId("modal")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("modal")).toHaveCount(0);

    });

    await test.step("open delete modal and close with Abbrechen", async () => {
      const fileRow = page.getByTestId("file-row").filter({ hasText: fileName });
      await fileRow.getByTestId("file-delete").click();
      await expect(page.getByTestId("modal")).toBeVisible();
      await page.getByTestId("modal-cancel").click();
      await expect(page.getByTestId("modal")).toHaveCount(0);
    });

    await test.step("confirm delete and return to root", async () => {
      const fileRow = page.getByTestId("file-row").filter({ hasText: fileName });
      await fileRow.getByTestId("file-delete").click();
      await expect(page.getByTestId("modal")).toBeVisible();
      await page.getByTestId("modal-confirm").click();
      await expect(page.getByTestId("file-row")).toHaveCount(0);
      await page.getByTestId("filebrowser-back").click();
      await expect(page.getByTestId("filebrowser-admin")).toBeVisible();
    });

    await test.step("zip button is visible at root", async () => {
      await expect(page.getByTestId("filebrowser-download-zip")).toBeVisible();
    });
  });

  test("admin can rename folders and sees validation/conflict", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-rename-admin");
    const adminPassword = "adminpass123";
    const mode = getMode();
    const adminUrl = buildEventUrl(baseURL, mode, eventId, true);

    try {
      await test.step("create event and upload files into folders", async () => {
        await createEvent(
          request,
          {
            name: "Admin Rename Event",
            description: "",
            eventId,
            guestPassword: "1234",
            adminPassword,
            adminPasswordConfirm: adminPassword,
            allowedMimeTypes: [],
          },
          baseURL
        );

        await uploadFile(
          request,
          eventId,
          { name: "a.txt", mimeType: "text/plain", content: "file a" },
          baseURL,
          { type: "admin", password: adminPassword },
          "a"
        );

        await uploadFile(
          request,
          eventId,
          { name: "b.txt", mimeType: "text/plain", content: "file b" },
          baseURL,
          { type: "admin", password: adminPassword },
          "b"
        );
      });

      await test.step("open admin view and verify rename button", async () => {
        await page.goto(adminUrl);
        await loginIfPrompted(page, adminPassword);
        await expect(page.getByTestId("filebrowser-admin")).toBeVisible();
        const folderA = page.getByTestId("filebrowser-folder").filter({ hasText: "a" });
        await expect(folderA).toBeVisible();
        await expect(folderA.getByTestId("filebrowser-folder-rename")).toBeVisible();
      });

      await test.step("attempt rename a -> b and verify conflict", async () => {
        const folderA = page.getByTestId("filebrowser-folder").filter({ hasText: "a" });
        await folderA.getByTestId("filebrowser-folder-rename").click();
        await expect(page.getByTestId("modal")).toBeVisible();

        const input = page.getByTestId("rename-folder-input");
        await input.fill("b");
        await page.getByTestId("rename-folder-confirm").click();
        await expect(page.getByText(/ordnername existiert bereits/i)).toBeVisible();
      });

      await test.step("cancel rename dialog", async () => {
        await page.getByTestId("rename-folder-cancel").click();
        await expect(page.getByTestId("modal")).toHaveCount(0);
      });

      await test.step("validate rename input and rename b -> c", async () => {
        const folderB = page.getByTestId("filebrowser-folder").filter({ hasText: "b" });
        await folderB.getByTestId("filebrowser-folder-rename").click();
        await expect(page.getByTestId("modal")).toBeVisible();

        const input = page.getByTestId("rename-folder-input");
        await input.fill("bad/");
        await input.blur();
        await expect(page.getByTestId("rename-folder-error")).toBeVisible();

        await input.fill("c");
        await page.getByTestId("rename-folder-confirm").click();
        await expect(page.getByTestId("modal")).toHaveCount(0);
        await expect(page.getByTestId("filebrowser-folder").filter({ hasText: "c" })).toBeVisible();
      });

      await test.step("open renamed folder and verify file", async () => {
        const folderC = page.getByTestId("filebrowser-folder").filter({ hasText: "c" });
        await folderC.click();
        await expect(page.getByTestId("file-list")).toBeVisible();
        await expect(page.getByTestId("file-row").filter({ hasText: "b.txt" })).toBeVisible();
      });
    } finally {
      await cleanupEvent(request, eventId, adminPassword, baseURL);
    }
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

    await test.step("cancel delete confirmation with Escape", async () => {
      await deleteOpen.click();
      await expect(page.getByTestId("modal")).toBeVisible();
      await page.keyboard.press("Escape");
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
