import { expect, test as base } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cleanupEvent, createEvent, listFiles } from "./support/api";
import { getUniqueEventId } from "./support/ids";
import { createCleanupTracker } from "./support/cleanup";
import { buildEventUrl, getMode } from "./support/urls";

type GuestEventFixture = {
  eventId: string;
  guestPassword: string;
  adminPassword: string;
  baseURL?: string;
};

const test = base.extend<{ guestEvent: GuestEventFixture }>({
  guestEvent: async ({ request }, use, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const eventId = getUniqueEventId("e2e-guest");
    const guestPassword = "guestpass123";
    const adminPassword = "adminpass123";

    await createEvent(
      request,
      {
        name: "Guest View Test",
        description: "",
        eventId,
        guestPassword,
        adminPassword,
        adminPasswordConfirm: adminPassword,
        allowedMimeTypes: [],
      },
      baseURL
    );

    await use({ eventId, guestPassword, adminPassword, baseURL });
    await cleanupEvent(request, eventId, adminPassword, baseURL);
  },
});

const loginGuest = async (page: import("@playwright/test").Page, password: string) => {
  await expect(page.getByTestId("password-prompt")).toBeVisible();
  await page.getByTestId("password-input").fill(password);
  await page.getByTestId("password-submit").click();
};

const cleanup = createCleanupTracker();

test.afterEach(async ({ request }) => {
  await cleanup.cleanupAll(request);
});

test.describe("guest event view", () => {
  const samplePng = "tests/e2e/assets/sample.png";
  test("missing event shows error", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const mode = getMode();
    const missingId = getUniqueEventId("missing");
    const url = buildEventUrl(baseURL, mode, missingId);

    await page.goto(url);
    await expect(page.getByRole("heading", { name: /nicht gefunden/i })).toBeVisible();
  });

  test("secured event requires guest password", async ({ page, guestEvent }, testInfo) => {
    testInfo.skip(!guestEvent.baseURL, "baseURL required");

    const mode = getMode();
    const url = buildEventUrl(guestEvent.baseURL as string, mode, guestEvent.eventId);

    await page.goto(url);
    await loginGuest(page, "wrongpass");
    await expect(page.getByTestId("password-error")).toBeVisible();

    await loginGuest(page, guestEvent.guestPassword);
    await expect(page.getByTestId("upload-form")).toBeVisible();
  });

  test("unsecured event shows event view directly", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-open");
    const adminPassword = "adminpass123";
    await createEvent(
      request,
      {
        name: "Open Guest Event",
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

    const mode = getMode();
    const url = buildEventUrl(baseURL, mode, eventId);
    await page.goto(url);
    await expect(page.getByTestId("password-prompt")).toHaveCount(0);
    await expect(page.getByTestId("upload-form")).toBeVisible();
  });

  test("upload rejects invalid folder name and accepts valid one", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-folder");
    const adminPassword = "adminpass123";
    await test.step("create event and open guest view", async () => {
      await createEvent(
        request,
        {
          name: "Folder Validation Event",
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

      const mode = getMode();
      const url = buildEventUrl(baseURL, mode, eventId);
      await page.goto(url);
      await expect(page.getByTestId("upload-form")).toBeVisible();
    });

    await test.step("validate folder name rules and upload", async () => {
      const fromInput = page.getByTestId("upload-from-input");
      const fileInput = page.getByTestId("upload-files-input");

      await expect(fromInput).toHaveAttribute("maxlength", "32");
      await fromInput.fill("a".repeat(40));
      await expect(fromInput).toHaveValue("a".repeat(32));

      await fromInput.fill("bad@folder");
      await expect(fileInput).toBeDisabled();

      await fromInput.fill("Guests 1");
      await expect(fileInput).toBeEnabled();
      await fileInput.setInputFiles({
        name: "valid.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("valid upload"),
      });
      const validItem = page.getByTestId("upload-item").filter({ hasText: "valid.txt" });
      await expect(validItem.getByTestId("upload-status")).toHaveText(/fertig/i);
    });
  });

  test("upload rejects disallowed mime types and clears queue item", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-mime");
    const adminPassword = "adminpass123";
    await test.step("create event and open guest view", async () => {
      await createEvent(
        request,
        {
          name: "MIME Validation Event",
          description: "",
          eventId,
          guestPassword: "",
          adminPassword,
          adminPasswordConfirm: adminPassword,
          allowedMimeTypes: ["image/*"],
        },
        baseURL
      );
      cleanup.track({ eventId, adminPassword, baseURL });

      const mode = getMode();
      const url = buildEventUrl(baseURL, mode, eventId);
      await page.goto(url);
      await expect(page.getByTestId("upload-form")).toBeVisible();
    });

    await test.step("reject invalid mime and clear queue item", async () => {
      const fileInput = page.getByTestId("upload-files-input");
      await fileInput.setInputFiles({
        name: "note.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not allowed"),
      });

      const rejectedItem = page.getByTestId("upload-item").filter({ hasText: "note.txt" });
      await expect(rejectedItem.getByTestId("upload-message")).toHaveText(
        /dateityp nicht erlaubt/i
      );
      await expect(rejectedItem.getByTestId("upload-status")).toHaveText(/warnung/i);

      await rejectedItem.getByTestId("upload-clear").click();
      await expect(page.getByTestId("upload-item").filter({ hasText: "note.txt" })).toHaveCount(0);
    });
  });

  test("admin login button routes to admin and shows password prompt", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-admin-link");
    const adminPassword = "adminpass123";
    await createEvent(
      request,
      {
        name: "Guest Admin Link Event",
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

    const mode = getMode();
    const guestUrl = buildEventUrl(baseURL, mode, eventId);
    const adminUrl = buildEventUrl(baseURL, mode, eventId, true);
    await page.goto(guestUrl);

    await page.getByTestId("event-admin-login").click();
    await expect(page).toHaveURL(
      new RegExp(`^${adminUrl.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}/?$`)
    );
    await expect(page.getByTestId("password-prompt")).toBeVisible();
  });

  test("back to home button returns to homepage", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-home-link");
    const adminPassword = "adminpass123";
    await createEvent(
      request,
      {
        name: "Guest Home Link Event",
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

    const mode = getMode();
    const guestUrl = buildEventUrl(baseURL, mode, eventId);
    await page.goto(guestUrl);

    await page.getByTestId("event-back-home").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("home-logo")).toBeVisible();
  });

  test("uploads duplicate filenames and persists both", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-dup");
    const adminPassword = "adminpass123";
    await test.step("create event and open guest view", async () => {
      await createEvent(
        request,
        {
          name: "Duplicate Upload Event",
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

      const mode = getMode();
      const url = buildEventUrl(baseURL, mode, eventId);
      await page.goto(url);
      await expect(page.getByTestId("upload-form")).toBeVisible();
    });

    await test.step("upload duplicate filenames", async () => {
      const fileInput = page.getByTestId("upload-files-input");
      await fileInput.setInputFiles([
        {
          name: "dupe.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("first"),
        },
        {
          name: "dupe.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("second"),
        },
      ]);

      const dupeItems = page.getByTestId("upload-item").filter({ hasText: "dupe.txt" });
      await expect(dupeItems).toHaveCount(2);
      await expect(dupeItems.getByTestId("upload-status")).toHaveText([/fertig/i, /fertig/i]);
    });

    await test.step("verify files persisted via API", async () => {
      const listResponse = await listFiles(request, eventId, baseURL, {
        type: "admin",
        password: adminPassword,
      });
      expect(listResponse.status()).toBe(200);
      const list = await listResponse.json();
      const files = (list.files ?? []) as { name: string; size: number }[];
      const names = files.map((file) => file.name);
      expect(names).toContain("dupe.txt");
      expect(names.some((name: string) => /^dupe_\d+\.txt$/.test(name))).toBe(true);
      expect(files.some((file) => file.size === 5)).toBe(true);
      expect(files.some((file) => file.size === 6)).toBe(true);
    });
  });

  test("guest file browser shows uploads and folders", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-files");
    const adminPassword = "adminpass123";
    const guestPassword = "guestpass123";

    await test.step("create guest event with downloads enabled", async () => {
      await createEvent(
        request,
        {
          name: "Guest Files Event",
          description: "",
          eventId,
          guestPassword,
          adminPassword,
          adminPasswordConfirm: adminPassword,
          allowedMimeTypes: [],
          allowGuestDownload: true,
        },
        baseURL
      );
      cleanup.track({ eventId, adminPassword, baseURL });
    });

    await test.step("open guest view and confirm file browser is visible", async () => {
      const mode = getMode();
      const url = buildEventUrl(baseURL, mode, eventId);
      await page.goto(url);
      await loginGuest(page, guestPassword);
      await expect(page.getByTestId("filebrowser-guest")).toBeVisible();
    });

    await test.step("upload first file and verify it appears", async () => {
      const fileInput = page.getByTestId("upload-files-input");
      await fileInput.setInputFiles({
        name: "first.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("first file"),
      });
      const firstUpload = page.getByTestId("upload-item").filter({ hasText: "first.txt" });
      await expect(firstUpload.getByTestId("upload-status")).toHaveText(/fertig/i);
      await expect
        .poll(
          async () =>
            page
              .getByTestId("file-list")
              .getByTestId("file-row")
              .filter({ hasText: "first.txt" })
              .count(),
          { timeout: 15_000, intervals: [500, 1000] }
        )
        .toBeGreaterThan(0);
    });

    await test.step("upload second file and verify it appears", async () => {
      const fileInput = page.getByTestId("upload-files-input");
      await fileInput.setInputFiles({
        name: "second.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("second file"),
      });
      const secondUpload = page.getByTestId("upload-item").filter({ hasText: "second.txt" });
      await expect(secondUpload.getByTestId("upload-status")).toHaveText(/fertig/i);
      await expect
        .poll(
          async () =>
            page
              .getByTestId("file-list")
              .getByTestId("file-row")
              .filter({ hasText: "second.txt" })
              .count(),
          { timeout: 15_000, intervals: [500, 1000] }
        )
        .toBeGreaterThan(0);
    });

    await test.step("upload file into folder and verify folder navigation", async () => {
      const fileInput = page.getByTestId("upload-files-input");
      const fromInput = page.getByTestId("upload-from-input");
      await fromInput.fill("test");
      await fileInput.setInputFiles({
        name: "third.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("third file"),
      });
      const thirdUpload = page.getByTestId("upload-item").filter({ hasText: "third.txt" });
      await expect(thirdUpload.getByTestId("upload-status")).toHaveText(/fertig/i);

      await expect
        .poll(
          async () =>
            page
              .getByTestId("filebrowser-folders")
              .getByTestId("filebrowser-folder")
              .filter({ hasText: "test" })
              .count(),
          { timeout: 15_000, intervals: [500, 1000] }
        )
        .toBeGreaterThan(0);

      const folderButton = page
        .getByTestId("filebrowser-folders")
        .getByTestId("filebrowser-folder")
        .filter({ hasText: "test" });
      await expect(folderButton).toBeVisible();
      await folderButton.click();
      await expect(page.getByText(/L?dt/i)).toHaveCount(0);
      await expect(
        page.getByTestId("file-list").getByTestId("file-row").filter({ hasText: "third.txt" })
      ).toBeVisible();
      await page.getByTestId("filebrowser-back").click();
      await expect(page.getByTestId("filebrowser-folders")).toBeVisible();
    });
  });

  test("guest view hides rename folder action", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-rename-guest");
    const adminPassword = "adminpass123";
    const guestPassword = "guestpass123";

    await test.step("create guest event and open view", async () => {
      await createEvent(
        request,
        {
          name: "Guest Rename Event",
          description: "",
          eventId,
          guestPassword,
          adminPassword,
          adminPasswordConfirm: adminPassword,
          allowedMimeTypes: [],
          allowGuestDownload: true,
        },
        baseURL
      );
      cleanup.track({ eventId, adminPassword, baseURL });

      const mode = getMode();
      const url = buildEventUrl(baseURL, mode, eventId);
      await page.goto(url);
      await loginGuest(page, guestPassword);
      await expect(page.getByTestId("filebrowser-guest")).toBeVisible();
    });

    await test.step("upload file into folder", async () => {
      const fromInput = page.getByTestId("upload-from-input");
      const fileInput = page.getByTestId("upload-files-input");
      await fromInput.fill("guest-folder");
      await fileInput.setInputFiles({
        name: "guest-folder-file.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("guest folder file"),
      });
      const uploadItem = page
        .getByTestId("upload-item")
        .filter({ hasText: "guest-folder-file.txt" });
      await expect(uploadItem.getByTestId("upload-status")).toHaveText(/fertig/i);
      await expect(
        page
          .getByTestId("filebrowser-folders")
          .getByTestId("filebrowser-folder")
          .filter({ hasText: "guest-folder" })
      ).toBeVisible();
    });

    await test.step("rename action is not visible", async () => {
      await expect(page.getByTestId("filebrowser-folder-rename")).toHaveCount(0);
    });
  });

  test("guest view hides upload form when uploads disabled", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-uploads-off");
    const adminPassword = "adminpass123";
    const guestPassword = "guestpass123";

    await test.step("create event with uploads disabled", async () => {
      await createEvent(
        request,
        {
          name: "Uploads Off Event",
          description: "",
          eventId,
          guestPassword,
          adminPassword,
          adminPasswordConfirm: adminPassword,
          allowedMimeTypes: [],
          allowGuestDownload: true,
          allowGuestUpload: false,
        },
        baseURL
      );
      cleanup.track({ eventId, adminPassword, baseURL });
    });

    await test.step("open guest view", async () => {
      const mode = getMode();
      const url = buildEventUrl(baseURL, mode, eventId);
      await page.goto(url);
      await loginGuest(page, guestPassword);
      await expect(page.getByTestId("filebrowser-guest")).toBeVisible();
      await expect(page.getByTestId("upload-form")).toHaveCount(0);
    });
  });

  test("guest view hides file browser when downloads disabled", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-downloads-off");
    const adminPassword = "adminpass123";

    await test.step("create event with downloads disabled", async () => {
      await createEvent(
        request,
        {
          name: "Downloads Off Event",
          description: "",
          eventId,
          guestPassword: "",
          adminPassword,
          adminPasswordConfirm: adminPassword,
          allowedMimeTypes: [],
          allowGuestDownload: false,
          allowGuestUpload: true,
        },
        baseURL
      );
      cleanup.track({ eventId, adminPassword, baseURL });
    });

    await test.step("open guest view", async () => {
      const mode = getMode();
      const url = buildEventUrl(baseURL, mode, eventId);
      await page.goto(url);
      await expect(page.getByTestId("upload-form")).toBeVisible();
      await expect(page.getByTestId("filebrowser-guest")).toHaveCount(0);
    });
  });

  test("guest can download uploaded file and cannot delete it", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-download");
    const adminPassword = "adminpass123";
    const guestPassword = "guestpass123";
    await test.step("create event and open guest view", async () => {
      await createEvent(
        request,
        {
          name: "Guest Download Event",
          description: "",
          eventId,
          guestPassword,
          adminPassword,
          adminPasswordConfirm: adminPassword,
          allowedMimeTypes: [],
          allowGuestDownload: true,
        },
        baseURL
      );
      cleanup.track({ eventId, adminPassword, baseURL });

      const mode = getMode();
      const url = buildEventUrl(baseURL, mode, eventId);
      await page.goto(url);
      await loginGuest(page, guestPassword);
      await expect(page.getByTestId("filebrowser-guest")).toBeVisible();
    });

    const fileName = "download-me.txt";
    const fileContent = "download content";

    await test.step("upload file and verify listed", async () => {
      const fileInput = page.getByTestId("upload-files-input");
      await fileInput.setInputFiles({
        name: fileName,
        mimeType: "text/plain",
        buffer: Buffer.from(fileContent),
      });
      const uploadItem = page.getByTestId("upload-item").filter({ hasText: fileName });
      await expect(uploadItem.getByTestId("upload-status")).toHaveText(/fertig/i);
      await expect(page.getByText(/L?dt/i)).toHaveCount(0);
      const fileRow = page.getByTestId("file-row").filter({ hasText: fileName });
      await expect(fileRow).toBeVisible();
      await expect(fileRow.getByLabel(/datei l.schen/i)).toHaveCount(0);
    });

    await test.step("download file and verify content", async () => {
      const fileRow = page.getByTestId("file-row").filter({ hasText: fileName });
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        fileRow.getByTestId("file-download").click(),
      ]);
      const downloadPath = testInfo.outputPath("guest-download.txt");
      await download.saveAs(downloadPath);
      const downloaded = readFileSync(downloadPath, "utf-8");
      expect(downloaded).toBe(fileContent);
    });
  });

  test("image preview navigation and download works", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const eventId = getUniqueEventId("e2e-preview");
    const adminPassword = "adminpass123";
    const guestPassword = "guestpass123";
    await test.step("create event and open guest view", async () => {
      await createEvent(
        request,
        {
          name: "Guest Preview Event",
          description: "",
          eventId,
          guestPassword,
          adminPassword,
          adminPasswordConfirm: adminPassword,
          allowedMimeTypes: ["image/*"],
          allowGuestDownload: true,
        },
        baseURL
      );
      cleanup.track({ eventId, adminPassword, baseURL });

      const mode = getMode();
      const url = buildEventUrl(baseURL, mode, eventId);
      await page.goto(url);
      await loginGuest(page, guestPassword);
      await expect(page.getByTestId("filebrowser-guest")).toBeVisible();
    });

    const expectPreviewLoaded = async () => {
      const img = page.getByTestId("preview-image");
      await expect(img).toBeVisible();
      const width = await img.evaluate((el) =>
        el instanceof HTMLImageElement ? el.naturalWidth : 0
      );
      expect(width).toBeGreaterThan(0);
    };

    await test.step("upload images", async () => {
      const fileInput = page.getByTestId("upload-files-input");
      const files = ["image-1.png", "image-2.png", "image-3.png"];
      const imageBuffer = Buffer.from(readFileSync(samplePng));
      await fileInput.setInputFiles(
        files.map((name) => ({
          name,
          mimeType: "image/png",
          buffer: imageBuffer,
        }))
      );

      const uploadItems = page.getByTestId("upload-item").filter({ hasText: "image-" });
      await expect(uploadItems).toHaveCount(3);
      await expect(uploadItems.getByTestId("upload-status")).toHaveText([
        /fertig/i,
        /fertig/i,
        /fertig/i,
      ]);
      await expect(page.getByText(/L?dt/i)).toHaveCount(0);
    });

    await test.step("open preview and navigate with buttons", async () => {
      const firstRow = page.getByTestId("file-row").filter({ hasText: "image-1.png" });
      await firstRow.getByTestId("file-open").click();

      await expect(page.getByText(/Datei 1 von 3/i)).toBeVisible();
      await expect(page.getByTestId("preview-prev")).toBeDisabled();
      await expect(page.getByTestId("preview-next")).toBeEnabled();
      await expectPreviewLoaded();

      await page.getByTestId("preview-next").click();
      await expect(page.getByText(/Datei 2 von 3/i)).toBeVisible();
      await expect(page.getByTestId("preview-prev")).toBeEnabled();
      await expect(page.getByTestId("preview-next")).toBeEnabled();
      await expectPreviewLoaded();

      await page.getByTestId("preview-next").click();
      await expect(page.getByText(/Datei 3 von 3/i)).toBeVisible();
      await expect(page.getByTestId("preview-prev")).toBeEnabled();
      await expect(page.getByTestId("preview-next")).toBeDisabled();
      await expectPreviewLoaded();
    });

    await test.step("navigate with keyboard", async () => {
      await page.getByTestId("modal").click();
      await page.keyboard.press("ArrowLeft");
      await expect(page.getByText(/Datei 2 von 3/i)).toBeVisible();
      await expectPreviewLoaded();

      await page.getByTestId("modal").click();
      await page.keyboard.press("ArrowLeft");
      await expect(page.getByText(/Datei 1 von 3/i)).toBeVisible();
      await expectPreviewLoaded();

      await page.getByTestId("modal").click();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByText(/Datei 2 von 3/i)).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByText(/Datei 3 von 3/i)).toBeVisible();
      await expectPreviewLoaded();
    });

    await test.step("download image and close preview", async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("preview-download").click(),
      ]);
      const downloadPath = testInfo.outputPath("preview-image-3.png");
      await download.saveAs(downloadPath);
      const downloaded = readFileSync(downloadPath);
      const expected = Buffer.from(readFileSync(samplePng));
      expect(Buffer.compare(downloaded, expected)).toBe(0);

      await page.getByTestId("preview-close").click();
      await expect(page.getByTestId("modal")).toHaveCount(0);
    });
  });
});
