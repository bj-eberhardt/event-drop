import { expect, test } from "@playwright/test";
import { getUniqueEventId } from "./support/ids";
import { buildEventUrl, getMode } from "./support/urls";
import { createEvent } from "./support/api";
import { createCleanupTracker } from "./support/cleanup";

const RATE_LIMIT_MESSAGE =
  "Sie haben die Aktion zu h\u00e4ufig durchgef\u00fchrt. Bitte warten Sie einen Moment.";

const cleanup = createCleanupTracker();

const getApiBaseUrl = (baseURL?: string) => {
  const env = process.env.E2E_API_BASE_URL;
  if (env && env.trim().length > 0) return env.trim().replace(/\/$/, "");
  if (baseURL) {
    const url = new URL(baseURL);
    url.port = "8080";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  }
  return "http://localhost:8080";
};

const toBasicAuth = (username: string, password: string) => {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
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

test.afterEach(async ({ request }) => {
  await cleanup.cleanupAll(request);
});

test.describe("rate limit messaging", () => {
  test("shows rate limit error when event creation is throttled", async ({ page }) => {
    await test.step("mock 429 for event creation", async () => {
      await page.route("**/api/events", (route) => {
        if (route.request().method() !== "POST") {
          route.continue();
          return;
        }
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ message: "Too Many Requests" }),
        });
      });
    });

    await test.step("fill new event form", async () => {
      await page.goto("/new");
      await expect(page.getByTestId("new-event-form")).toBeVisible();

      const eventId = getUniqueEventId("e2e-rate");
      await page.getByTestId("new-event-name").fill("Rate Limit Event");
      await page.getByTestId("new-event-subdomain").fill(eventId);
      await page.getByTestId("new-event-admin-password").fill("adminpass123");
      await page.getByTestId("new-event-admin-password-confirm").fill("adminpass123");
    });

    await test.step("submit and show rate limit message", async () => {
      await page.getByTestId("new-event-submit").click();
      await expect(page.getByTestId("new-event-submit-error")).toHaveText(RATE_LIMIT_MESSAGE);
    });
  });

  test("shows rate limit error on admin login", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const mode = getMode();
    const eventId = getUniqueEventId("e2e-rate-admin-login");
    const adminPassword = "adminpass123";

    await createEvent(
      request,
      {
        name: "Rate Limit Files",
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

    await test.step("mock 429 for admin event fetch", async () => {
      await page.route(`**/api/events/${eventId}`, (route) => {
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ message: "Too Many Requests" }),
        });
      });
      await page.route(`**/api/events/${eventId}/files`, (route) => {
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ message: "Too Many Requests" }),
        });
      });
    });

    await test.step("open admin view", async () => {
      const adminUrl = buildEventUrl(baseURL, mode, eventId, true);
      await page.goto(adminUrl);
    });

    await test.step("shows rate limit message", async () => {
      await expect(page.getByTestId("admin-view-global-error")).toHaveText(RATE_LIMIT_MESSAGE);
    });
  });

  test("shows rate limit error when file list is throttled after login", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const mode = getMode();
    const eventId = getUniqueEventId("e2e-rate-files");
    const adminPassword = "adminpass123";

    await createEvent(
      request,
      {
        name: "Rate Limit Files",
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

    const result = await test.step("open admin view and login", async () => {
      const adminUrl = buildEventUrl(baseURL, mode, eventId, true);
      await page.goto(adminUrl);
      await page.waitForLoadState("load");
      return await waitForPromptOrAdmin(page);
    });

    await test.step("mock 429 for file list", async () => {
      let allowedRequests = 1;
      await page.route(`**/api/events/${eventId}/files*`, (route) => {
        console.log("File list request intercepted, allowedRequests =", allowedRequests);
        allowedRequests -= 1;
        if (route.request().method() !== "GET" || allowedRequests >= 0) {
          route.continue();
          return;
        }
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ message: "Too Many Requests" }),
        });
      });
      await page.route(`**/api/events/${eventId}`, (route) => {
        if (route.request().method() !== "GET") {
          route.continue();
          return;
        }
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ message: "Too Many Requests" }),
        });
      });
    });

    await test.step("login", async () => {
      if (result === "prompt") {
        await page.getByTestId("password-input").fill(adminPassword);
        await page.getByTestId("password-submit").click();
      }
      await expect(page.getByTestId("admin-view")).toBeVisible();
    });

    await test.step("shows rate limit message", async () => {
      await expect(page.getByTestId("filebrowser-admin")).toContainText(RATE_LIMIT_MESSAGE);
      await expect(page.getByTestId("admin-settings-loading")).toContainText(RATE_LIMIT_MESSAGE);
    });
  });

  test("shows rate limit error when zip download is throttled", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const mode = getMode();
    const eventId = getUniqueEventId("e2e-rate-zip");
    const adminPassword = "adminpass123";

    await createEvent(
      request,
      {
        name: "Rate Limit Zip",
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

    await test.step("upload file so zip button is visible", async () => {
      const apiBase = getApiBaseUrl(baseURL);
      const response = await request.post(
        `${apiBase}/api/events/${encodeURIComponent(eventId)}/files`,
        {
          headers: { Authorization: toBasicAuth("admin", adminPassword) },
          multipart: {
            files: {
              name: "zip-ready.txt",
              mimeType: "text/plain",
              buffer: Buffer.from("zip ready"),
            },
          },
        }
      );
      expect(response.status()).toBe(200);
    });

    await test.step("mock 429 for zip download", async () => {
      await page.route(`**/api/events/${eventId}/files.zip*`, (route) => {
        if (route.request().method() !== "GET") {
          route.continue();
          return;
        }
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ message: "Too Many Requests" }),
        });
      });
    });

    await test.step("open admin view and trigger zip download", async () => {
      const adminUrl = buildEventUrl(baseURL, mode, eventId, true);
      await page.goto(adminUrl);
      const result = await waitForPromptOrAdmin(page);
      if (result === "prompt") {
        await page.getByTestId("password-input").fill(adminPassword);
        await page.getByTestId("password-submit").click();
      }
      await expect(page.getByTestId("filebrowser-admin")).toBeVisible();
      await expect(page.getByTestId("file-list")).toContainText("zip-ready.txt");
      await page.getByRole("button", { name: /download als zip/i }).click();
    });

    await test.step("shows rate limit message", async () => {
      await expect(page.getByTestId("filebrowser-admin")).toContainText(RATE_LIMIT_MESSAGE);
    });
  });

  test("shows rate limit error when guest file upload is throttled", async ({
    page,
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const mode = getMode();
    const eventId = getUniqueEventId("e2e-rate-upload");
    const adminPassword = "adminpass123";

    await createEvent(
      request,
      {
        name: "Rate Limit Upload",
        description: "",
        eventId,
        guestPassword: "guestpass123",
        adminPassword,
        adminPasswordConfirm: adminPassword,
        allowedMimeTypes: [],
      },
      baseURL
    );
    cleanup.track({ eventId, adminPassword, baseURL });

    await test.step("mock 429 for file upload", async () => {
      await page.route(`**/api/events/${eventId}/files`, (route) => {
        if (route.request().method() !== "POST") {
          route.continue();
          return;
        }
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ message: "Too Many Requests" }),
        });
      });
    });

    await test.step("open guest view and login", async () => {
      const guestUrl = buildEventUrl(baseURL, mode, eventId);
      await page.goto(guestUrl);
      await expect(page.getByTestId("password-prompt")).toBeVisible();
      await page.getByTestId("password-input").fill("guestpass123");
      await page.getByTestId("password-submit").click();
      await expect(page.getByTestId("upload-form")).toBeVisible();
    });

    await test.step("attempt upload and show rate limit message", async () => {
      const fileInput = page.getByTestId("upload-files-input");
      await expect(fileInput).toBeEnabled();
      await fileInput.setInputFiles({
        name: "rate-upload.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("rate limit"),
      });
      await expect(page.getByTestId("upload-message")).toContainText(RATE_LIMIT_MESSAGE);
    });
  });

  test("shows rate limit error on guest login form", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const mode = getMode();
    const eventId = getUniqueEventId("e2e-rate-guest-login");
    const adminPassword = "adminpass123";

    await createEvent(
      request,
      {
        name: "Rate Limit Guest Login",
        description: "",
        eventId,
        guestPassword: "guestpass123",
        adminPassword,
        adminPasswordConfirm: adminPassword,
        allowedMimeTypes: [],
      },
      baseURL
    );
    cleanup.track({ eventId, adminPassword, baseURL });

    await test.step("mock 429 for guest event access", async () => {
      await page.route(`**/api/events/${eventId}`, (route) => {
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ message: "Too Many Requests" }),
        });
      });
    });

    await test.step("open guest view", async () => {
      const guestUrl = buildEventUrl(baseURL, mode, eventId);
      await page.goto(guestUrl);
    });

    await test.step("shows rate limit message", async () => {
      await expect(page.getByTestId("event-view-global-error")).toHaveText(RATE_LIMIT_MESSAGE);
    });
  });

  test("blocks guest login after too many failed attempts", async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    testInfo.skip(!baseURL, "baseURL required");

    const mode = getMode();
    const eventId = getUniqueEventId("e2e-guest-rate");
    const adminPassword = "adminpass123";

    await createEvent(
      request,
      {
        name: "Rate Limit Guest",
        description: "",
        eventId,
        guestPassword: "guestpass123",
        adminPassword,
        adminPasswordConfirm: adminPassword,
        allowedMimeTypes: [],
      },
      baseURL
    );
    cleanup.track({ eventId, adminPassword, baseURL });

    await test.step("open guest view", async () => {
      const guestUrl = buildEventUrl(baseURL, mode, eventId);
      await page.goto(guestUrl);
      await expect(page.getByTestId("password-prompt")).toBeVisible();
    });

    await test.step("exceed failed login attempts (max 12)", async () => {
      const passwordInput = page.getByTestId("password-input");
      const submitButton = page.getByTestId("password-submit");
      const errorText = page.getByTestId("password-error");
      const globalError = page.getByTestId("event-view-global-error");
      let lastMessage = "";

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await test.step(`attempt ${attempt + 1}`, async () => {
          await passwordInput.fill("wrongpass");
          await submitButton.click();
          await Promise.race([
            errorText.waitFor({ state: "visible" }).catch(() => {}),
            globalError.waitFor({ state: "visible" }).catch(() => {}),
          ]);
          if (await errorText.isVisible()) {
            lastMessage = await errorText.textContent();
            return;
          }
          if (await globalError.isVisible()) {
            lastMessage = await globalError.textContent();
          }
        });
        if (lastMessage?.trim() === RATE_LIMIT_MESSAGE) break;
      }

      expect(lastMessage?.trim()).toBe(RATE_LIMIT_MESSAGE);
    });
  });
});
