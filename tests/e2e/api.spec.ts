import { expect, test } from "@playwright/test";
import { createCleanupTracker } from "./support/cleanup";
import { getUniqueEventId } from "./support/ids";
import { readFileSync } from "node:fs";

type Auth = { user: "admin" | "guest"; password: string };

const cleanup = createCleanupTracker();

const getApiBaseUrl = (baseURL?: string) => {
  const env = process.env.E2E_API_BASE_URL;
  const port = process.env.E2E_API_PORT || "8080";
  if (env && env.trim().length > 0) return env.trim().replace(/\/$/, "");
  if (baseURL) {
    const url = new URL(baseURL);
    url.port = port;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  }
  return `http://localhost:${port}`;
};

const toAuthHeader = (auth?: Auth) => {
  if (!auth) return undefined;
  const token = Buffer.from(`${auth.user}:${auth.password}`).toString("base64");
  return { Authorization: `Basic ${token}` };
};

type CreateEventPayload = {
  name: string;
  description: string;
  eventId: string;
  guestPassword: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  allowedMimeTypes: string[];
  allowGuestDownload?: boolean;
  allowGuestUpload?: boolean;
  requireUploadFolder?: boolean;
  uploadFolderHint?: string | null;
};

const createEventPayload = (overrides?: Partial<CreateEventPayload>): CreateEventPayload => ({
  name: "API Test Event",
  description: "",
  eventId: getUniqueEventId("e2e-api"),
  guestPassword: "guestpass123",
  adminPassword: "adminpass123",
  adminPasswordConfirm: "adminpass123",
  allowedMimeTypes: [],
  ...overrides,
});

const expectExactKeys = (body: Record<string, unknown>, expectedKeys: string[]) => {
  expect(Object.keys(body).sort()).toEqual(expectedKeys.slice().sort());
};

const expectAppConfigBody = (body: Record<string, unknown>) => {
  expectExactKeys(body, ["allowedDomains", "supportSubdomain", "allowEventCreation"]);
  expect(Array.isArray(body.allowedDomains)).toBe(true);
  expect(typeof body.supportSubdomain).toBe("boolean");
  expect(typeof body.allowEventCreation).toBe("boolean");
};

const expectEventInfoBody = (
  body: Record<string, unknown>,
  expected: {
    eventId: string;
    name: string;
    description: string;
    allowedMimeTypes: string[];
    secured: boolean;
    allowGuestDownload: boolean;
    allowGuestUpload: boolean;
    requireUploadFolder: boolean;
    uploadFolderHint: string | null;
    accessLevel: "unauthenticated" | "guest" | "admin";
  }
) => {
  expect(body).toBeTruthy();
  expectExactKeys(body, [
    "accessLevel",
    "allowedMimeTypes",
    "allowGuestDownload",
    "allowGuestUpload",
    "createdAt",
    "description",
    "eventId",
    "name",
    "requireUploadFolder",
    "secured",
    "uploadFolderHint",
    "uploadMaxFileSizeBytes",
    "uploadMaxTotalSizeBytes",
  ]);
  expect(body.eventId).toBe(expected.eventId);
  expect(body.name).toBe(expected.name);
  expect(body.description).toBe(expected.description);
  expect(body.allowedMimeTypes).toEqual(expected.allowedMimeTypes);
  expect(body.secured).toBe(expected.secured);
  expect(body.allowGuestDownload).toBe(expected.allowGuestDownload);
  expect(body.allowGuestUpload).toBe(expected.allowGuestUpload);
  expect(body.requireUploadFolder).toBe(expected.requireUploadFolder);
  expect(body.uploadFolderHint).toBe(expected.uploadFolderHint);
  expect(body.accessLevel).toBe(expected.accessLevel);
  expect(typeof body.createdAt).toBe("string");
  expect(typeof body.uploadMaxFileSizeBytes).toBe("number");
  expect(typeof body.uploadMaxTotalSizeBytes).toBe("number");
};

const expectUpdateEventBody = (
  body: Record<string, unknown>,
  expected: {
    eventId: string;
    name: string;
    description: string;
    allowedMimeTypes: string[];
    secured: boolean;
    allowGuestDownload: boolean;
    allowGuestUpload: boolean;
    requireUploadFolder: boolean;
    uploadFolderHint: string | null;
    accessLevel: "admin";
  }
) => {
  expectExactKeys(body, [
    "accessLevel",
    "allowedMimeTypes",
    "allowGuestDownload",
    "allowGuestUpload",
    "createdAt",
    "description",
    "eventId",
    "name",
    "ok",
    "requireUploadFolder",
    "secured",
    "uploadFolderHint",
    "uploadMaxFileSizeBytes",
    "uploadMaxTotalSizeBytes",
  ]);
  expect(body.ok).toBe(true);
  expect(body.eventId).toBe(expected.eventId);
  expect(body.name).toBe(expected.name);
  expect(body.description).toBe(expected.description);
  expect(body.allowedMimeTypes).toEqual(expected.allowedMimeTypes);
  expect(body.secured).toBe(expected.secured);
  expect(body.allowGuestDownload).toBe(expected.allowGuestDownload);
  expect(body.allowGuestUpload).toBe(expected.allowGuestUpload);
  expect(body.requireUploadFolder).toBe(expected.requireUploadFolder);
  expect(body.uploadFolderHint).toBe(expected.uploadFolderHint);
  expect(body.accessLevel).toBe(expected.accessLevel);
  expect(typeof body.createdAt).toBe("string");
  expect(typeof body.uploadMaxFileSizeBytes).toBe("number");
  expect(typeof body.uploadMaxTotalSizeBytes).toBe("number");
};

const expectDeleteEventBody = (body: Record<string, unknown>) => {
  expectExactKeys(body, ["message", "ok"]);
  expect(typeof body.message).toBe("string");
  expect(body.ok).toBe(true);
};

const expectListFilesBody = (
  body: Record<string, unknown>,
  expected: { folder: string; files: Array<{ name: string; size: number }>; folders: string[] }
) => {
  expectExactKeys(body, ["files", "folders", "folder"]);
  expect(body.folder).toBe(expected.folder);
  expect(body.folders).toEqual(expected.folders);
  expect(Array.isArray(body.files)).toBe(true);
  expect(body.files).toHaveLength(expected.files.length);
  (body.files as Array<Record<string, unknown>>).forEach((entry, index) => {
    expectExactKeys(entry, ["createdAt", "name", "size"]);
    expect(entry.name).toBe(expected.files[index].name);
    expect(entry.size).toBe(expected.files[index].size);
    expect(typeof entry.createdAt).toBe("string");
  });
};

const expectUploadBody = (
  body: Record<string, unknown>,
  expected: { uploaded: number; rejectedCount: number }
) => {
  expectExactKeys(body, ["message", "rejected", "uploaded"]);
  expect(typeof body.message).toBe("string");
  expect(body.uploaded).toBe(expected.uploaded);
  expect(Array.isArray(body.rejected)).toBe(true);
  expect((body.rejected as Array<unknown>).length).toBe(expected.rejectedCount);
  (body.rejected as Array<Record<string, unknown>>).forEach((entry) => {
    expectExactKeys(entry, ["file", "reason"]);
    expect(typeof entry.file).toBe("string");
    expect(typeof entry.reason).toBe("string");
  });
};

const expectDeleteFileBody = (body: Record<string, unknown>) => {
  expectExactKeys(body, ["message", "ok"]);
  expect(typeof body.message).toBe("string");
  expect(body.ok).toBe(true);
};

const createEvent = async (
  request: import("@playwright/test").APIRequestContext,
  baseURL?: string,
  overrides?: Partial<CreateEventPayload>
) =>
  test.step("create event", async () => {
    const apiBase = getApiBaseUrl(baseURL);
    const payload = createEventPayload(overrides);
    const response = await request.post(`${apiBase}/api/events`, { data: payload });
    expect(response.status()).toBe(200);
    const body = await response.json();
    const guestPassword = payload.guestPassword as string;
    const secured = Boolean(guestPassword);
    const allowGuestDownload = payload.allowGuestDownload === true && secured;
    const allowGuestUpload = payload.allowGuestUpload !== false;
    const requireUploadFolder = payload.requireUploadFolder === true;
    const uploadFolderHint =
      payload.uploadFolderHint == null
        ? null
        : payload.uploadFolderHint.trim()
          ? payload.uploadFolderHint.trim()
          : null;
    const allowedMimeTypes = Array.isArray(payload.allowedMimeTypes)
      ? (payload.allowedMimeTypes as string[])
      : [];
    expectEventInfoBody(body, {
      eventId: payload.eventId as string,
      name: payload.name as string,
      description: payload.description as string,
      allowedMimeTypes,
      secured,
      allowGuestDownload,
      allowGuestUpload,
      requireUploadFolder,
      uploadFolderHint,
      accessLevel: "unauthenticated",
    });
    cleanup.track({
      eventId: payload.eventId as string,
      adminPassword: payload.adminPassword as string,
      baseURL,
    });
    return { response, payload, body };
  });

const uploadFile = async (
  request: import("@playwright/test").APIRequestContext,
  baseURL: string,
  eventId: string,
  auth: Auth,
  file: { name: string; mimeType: string; content: string | Buffer },
  from?: string,
  expected?: { uploaded: number; rejectedCount: number }
) =>
  test.step(`upload file ${file.name}`, async () => {
    const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    const multipart: {
      [key: string]: string | number | boolean | { name: string; mimeType: string; buffer: Buffer };
    } = {
      files: {
        name: file.name,
        mimeType: file.mimeType,
        buffer,
      },
    };
    if (from !== undefined) {
      multipart.from = from;
    }
    const response = await request.post(
      `${baseURL}/api/events/${encodeURIComponent(eventId)}/files`,
      {
        headers: toAuthHeader(auth),
        multipart,
      }
    );
    if (response.status() === 200) {
      const body = await response.json();
      expectUploadBody(body, expected ?? { uploaded: 1, rejectedCount: 0 });
      return { response, body };
    }
    return { response };
  });

const tinyPng = readFileSync("tests/e2e/assets/sample.png");

test.afterEach(async ({ request }) => {
  await cleanup.cleanupAll(request);
});

test.describe("GET /api/config", () => {
  test("returns app configuration", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.get(`${apiBase}/api/config`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectAppConfigBody(body);
  });
});

test.describe("POST /api/events", () => {
  test("creates event", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload, body } = await createEvent(request, baseURL, {
      allowGuestDownload: true,
    });
    expect(body.eventId).toBe(payload.eventId);
    expect(body.secured).toBe(true);
    expect(body.allowGuestDownload).toBe(true);
  });

  test("defaults allowGuestUpload to true", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { body } = await createEvent(request, baseURL, {
      allowGuestDownload: true,
      allowGuestUpload: undefined,
    });
    expect(body.allowGuestUpload).toBe(true);
  });

  test("creates event with guest uploads disabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { body } = await createEvent(request, baseURL, {
      allowGuestUpload: false,
    });
    expect(body.allowGuestUpload).toBe(false);
  });

  test("creates event with required upload folder and hint", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { body } = await createEvent(request, baseURL, {
      requireUploadFolder: true,
      uploadFolderHint: "Bitte einen Ordner angeben.",
    });
    expect(body.requireUploadFolder).toBe(true);
    expect(body.uploadFolderHint).toBe("Bitte einen Ordner angeben.");
  });

  test("stores blank uploadFolderHint as null", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { body } = await createEvent(request, baseURL, {
      uploadFolderHint: "   ",
    });
    expect(body.uploadFolderHint).toBe(null);
  });

  test("rejects uploadFolderHint longer than 512 characters", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const payload = createEventPayload({
      eventId: getUniqueEventId("e2e-upload-hint"),
      uploadFolderHint: "a".repeat(513),
    });
    const response = await request.post(`${apiBase}/api/events`, { data: payload });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("uploadFolderHint");
    expect(body.message).toBe("Upload folder hint can be at most 512 characters.");
  });

  test("rejects uploadFolderHint shorter than 8 characters", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const payload = createEventPayload({
      eventId: getUniqueEventId("e2e-upload-hint-min"),
      uploadFolderHint: "short",
    });
    const response = await request.post(`${apiBase}/api/events`, { data: payload });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("uploadFolderHint");
    expect(body.message).toBe("Upload folder hint must be at least 8 characters.");
  });

  test("rejects create when guest upload and download disabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const payload = createEventPayload({
      eventId: getUniqueEventId("e2e-guest-flags"),
      allowGuestDownload: false,
      allowGuestUpload: false,
    });
    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.post(`${apiBase}/api/events`, { data: payload });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("GUEST_ACCESS_DISABLED");
  });

  test("rejects invalid payload", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.post(`${apiBase}/api/events`, {
      data: { name: "", eventId: "ab", adminPassword: "short", adminPasswordConfirm: "short" },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBeTruthy();
  });

  test("rejects mismatched admin passwords", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const payload = createEventPayload({ adminPasswordConfirm: "different" });
    const response = await request.post(`${apiBase}/api/events`, { data: payload });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.property).toBe("adminPasswordConfirm");
    expect(body.errorKey).toBe("INVALID_INPUT");
  });

  test("rejects short guest password", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const payload = createEventPayload({ guestPassword: "123" });
    const response = await request.post(`${apiBase}/api/events`, { data: payload });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.property).toBe("guestPassword");
    expect(body.errorKey).toBe("INVALID_INPUT");
  });

  test("rejects allowGuestDownload without guest password", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const payload = createEventPayload({ guestPassword: "", allowGuestDownload: true });
    const response = await request.post(`${apiBase}/api/events`, { data: payload });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.property).toBe("allowGuestDownload");
    expect(body.errorKey).toBe("INVALID_INPUT");
  });

  test("rejects duplicate eventId", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.post(`${apiBase}/api/events`, { data: payload });
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.errorKey).toBe("EVENT_ID_TAKEN");
  });

  test("rejects when event creation disabled", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const config = await request.get(`${apiBase}/api/config`);
    const configBody = await config.json();
    expectAppConfigBody(configBody);
    testInfo.skip(configBody.allowEventCreation !== false, "event creation enabled");

    const payload = createEventPayload({ eventId: getUniqueEventId("e2e-disabled") });
    const response = await request.post(`${apiBase}/api/events`, { data: payload });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("EVENT_CREATION_DISABLED");
  });
});

test.describe("GET /api/events/{eventId}", () => {
  test("returns event info with admin auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectEventInfoBody(body, {
      eventId: payload.eventId as string,
      name: payload.name as string,
      description: payload.description as string,
      allowedMimeTypes: payload.allowedMimeTypes as string[],
      secured: true,
      allowGuestDownload: false,
      allowGuestUpload: true,
      requireUploadFolder: false,
      uploadFolderHint: null,
      accessLevel: "admin",
    });
  });

  test("returns event info with guest auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectEventInfoBody(body, {
      eventId: payload.eventId as string,
      name: payload.name as string,
      description: payload.description as string,
      allowedMimeTypes: payload.allowedMimeTypes as string[],
      secured: true,
      allowGuestDownload: false,
      allowGuestUpload: true,
      requireUploadFolder: false,
      uploadFolderHint: null,
      accessLevel: "guest",
    });
  });

  test("rejects missing auth on secured event", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects wrong guest password", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      { headers: toAuthHeader({ user: "guest", password: "wrongpass" }) }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.get(`${apiBase}/api/events/bad_`);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("returns not found for missing event", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(getUniqueEventId("missing"))}`
    );
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.errorKey).toBe("EVENT_NOT_FOUND");
  });
});

test.describe("PATCH /api/events/{eventId}", () => {
  test("updates event settings with admin auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: {
          name: "Updated Name",
          description: "Updated description",
          allowedMimeTypes: ["image/png"],
          allowGuestDownload: true,
        },
      }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectUpdateEventBody(body, {
      eventId: payload.eventId as string,
      name: "Updated Name",
      description: "Updated description",
      allowedMimeTypes: ["image/png"],
      secured: true,
      allowGuestDownload: true,
      allowGuestUpload: true,
      requireUploadFolder: false,
      uploadFolderHint: null,
      accessLevel: "admin",
    });
  });

  test("rejects missing auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      { data: { name: "No Auth" } }
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects guest auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }),
        data: { name: "Guest Update" },
      }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects wrong admin password", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: "wrongpass" }),
        data: { name: "Wrong Admin" },
      }
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects invalid guest password length", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { guestPassword: "123" },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("guestPassword");
  });

  test("rejects allowGuestDownload without guest password", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { guestPassword: "" });

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { allowGuestDownload: true },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("allowGuestDownload");
  });

  test("rejects invalid mime type", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { allowedMimeTypes: ["not a mime"] },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("allowedMimeTypes.0");
  });

  test("rejects empty name", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { name: "" },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("name");
  });

  test("rejects name longer than 48 characters", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { name: "a".repeat(60) },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("name");
  });

  test("rejects description longer than 2048 characters", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { description: "b".repeat(2100) },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("description");
  });

  test("allows enabling guest downloads when guest password provided", async ({
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { guestPassword: "" });

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { guestPassword: "guest1234", allowGuestDownload: true },
      }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectUpdateEventBody(body, {
      eventId: payload.eventId as string,
      name: payload.name as string,
      description: payload.description as string,
      allowedMimeTypes: payload.allowedMimeTypes as string[],
      secured: true,
      allowGuestDownload: true,
      allowGuestUpload: true,
      requireUploadFolder: false,
      uploadFolderHint: null,
      accessLevel: "admin",
    });
  });

  test("updates allowGuestUpload flag", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { allowGuestUpload: false },
      }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectUpdateEventBody(body, {
      eventId: payload.eventId as string,
      name: payload.name as string,
      description: payload.description as string,
      allowedMimeTypes: payload.allowedMimeTypes as string[],
      secured: true,
      allowGuestDownload: true,
      allowGuestUpload: false,
      requireUploadFolder: false,
      uploadFolderHint: null,
      accessLevel: "admin",
    });
  });

  test("updates requireUploadFolder and uploadFolderHint", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { requireUploadFolder: true, uploadFolderHint: "Bitte Album angeben." },
      }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectUpdateEventBody(body, {
      eventId: payload.eventId as string,
      name: payload.name as string,
      description: payload.description as string,
      allowedMimeTypes: payload.allowedMimeTypes as string[],
      secured: true,
      allowGuestDownload: true,
      allowGuestUpload: true,
      requireUploadFolder: true,
      uploadFolderHint: "Bitte Album angeben.",
      accessLevel: "admin",
    });
  });

  test("clears uploadFolderHint with blank value", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, {
      allowGuestDownload: true,
      uploadFolderHint: "Vorheriger Hinweis",
    });

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { uploadFolderHint: "   " },
      }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectUpdateEventBody(body, {
      eventId: payload.eventId as string,
      name: payload.name as string,
      description: payload.description as string,
      allowedMimeTypes: payload.allowedMimeTypes as string[],
      secured: true,
      allowGuestDownload: true,
      allowGuestUpload: true,
      requireUploadFolder: false,
      uploadFolderHint: null,
      accessLevel: "admin",
    });
  });

  test("rejects uploadFolderHint longer than 512 characters", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { uploadFolderHint: "b".repeat(513) },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("uploadFolderHint");
    expect(body.message).toBe("Upload folder hint can be at most 512 characters.");
  });

  test("rejects uploadFolderHint shorter than 8 characters", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { uploadFolderHint: "short" },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("uploadFolderHint");
    expect(body.message).toBe("Upload folder hint must be at least 8 characters.");
  });

  test("rejects patch when guest upload and download disabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { allowGuestDownload: false, allowGuestUpload: false },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("GUEST_ACCESS_DISABLED");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.patch(`${apiBase}/api/events/bad_`, { data: { name: "x" } });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("returns not found for missing event", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(getUniqueEventId("missing"))}`,
      {
        headers: toAuthHeader({ user: "admin", password: "adminpass123" }),
        data: { name: "x" },
      }
    );
    expect(response.status()).toBe(404);
  });
});

test.describe("DELETE /api/events/{eventId}", () => {
  test("deletes event with admin auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectDeleteEventBody(body);

    const check = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(check.status()).toBe(404);
  });

  test("rejects missing auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects guest auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects wrong admin password", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);

    const apiBase = getApiBaseUrl(baseURL);
    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}`,
      { headers: toAuthHeader({ user: "admin", password: "wrongpass" }) }
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.delete(`${apiBase}/api/events/bad_`);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("returns not found for missing event", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(getUniqueEventId("missing"))}`,
      {
        headers: toAuthHeader({ user: "admin", password: "adminpass123" }),
      }
    );
    expect(response.status()).toBe(404);
  });
});

test.describe("GET /api/events/{eventId}/files", () => {
  test("lists files with admin auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectListFilesBody(body, { folder: "", folders: [], files: [] });
  });

  test("lists files with guest auth when downloads enabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectListFilesBody(body, { folder: "", folders: [], files: [] });
  });

  test("rejects missing auth on secured event", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files`
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects guest access when downloads disabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: false });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("GUEST_DOWNLOADS_DISABLED");
  });

  test("rejects invalid folder query", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files?folder=bad/`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FOLDER");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.get(`${apiBase}/api/events/bad_/files`);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("returns not found for missing event", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(getUniqueEventId("missing"))}/files`
    );
    expect(response.status()).toBe(404);
  });
});

test.describe("PATCH /api/events/{eventId}/folders/{folder}", () => {
  test("renames folder and preserves other folders", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);
    const sourceFolder = "album-a";
    const targetFolder = "album-renamed";
    const otherFolder = "album-b";
    const firstContent = "alpha";
    const secondContent = "bravo";
    const otherContent = "charlie";

    await test.step("upload files into folders", async () => {
      await uploadFile(
        request,
        apiBase,
        payload.eventId as string,
        { user: "guest", password: payload.guestPassword as string },
        { name: "a.txt", mimeType: "text/plain", content: firstContent },
        sourceFolder
      );
      await uploadFile(
        request,
        apiBase,
        payload.eventId as string,
        { user: "guest", password: payload.guestPassword as string },
        { name: "b.txt", mimeType: "text/plain", content: secondContent },
        sourceFolder
      );
      await uploadFile(
        request,
        apiBase,
        payload.eventId as string,
        { user: "guest", password: payload.guestPassword as string },
        { name: "c.txt", mimeType: "text/plain", content: otherContent },
        otherFolder
      );
    });

    await test.step("rename folder", async () => {
      const response = await request.patch(
        `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/folders/${encodeURIComponent(sourceFolder)}`,
        {
          headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
          data: { to: targetFolder },
        }
      );
      expect(response.status()).toBe(200);
      const body = await response.json();
      expectExactKeys(body, ["success"]);
      expect(body.success).toBe(true);
    });

    await test.step("list root folders", async () => {
      const response = await request.get(
        `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files`,
        { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
      );
      expect(response.status()).toBe(200);
      const body = await response.json();
      expectExactKeys(body, ["files", "folders", "folder"]);
      expect(body.folder).toBe("");
      expect(Array.isArray(body.files)).toBe(true);
      expect(body.files).toHaveLength(0);
      expect(body.folders.sort()).toEqual([otherFolder, targetFolder].sort());
    });

    await test.step("list renamed folder files", async () => {
      const response = await request.get(
        `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files?folder=${encodeURIComponent(targetFolder)}`,
        { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
      );
      expect(response.status()).toBe(200);
      const body = await response.json();
      expectExactKeys(body, ["files", "folders", "folder"]);
      expect(body.folder).toBe(targetFolder);
      expect(body.folders).toEqual([]);
      const files = (body.files as Array<Record<string, unknown>>).map((entry) => ({
        name: entry.name as string,
        size: entry.size as number,
      }));
      expect(files.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: "a.txt", size: Buffer.byteLength(firstContent) },
        { name: "b.txt", size: Buffer.byteLength(secondContent) },
      ]);
    });

    await test.step("list other folder files", async () => {
      const response = await request.get(
        `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files?folder=${encodeURIComponent(otherFolder)}`,
        { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
      );
      expect(response.status()).toBe(200);
      const body = await response.json();
      expectExactKeys(body, ["files", "folders", "folder"]);
      expect(body.folder).toBe(otherFolder);
      const files = (body.files as Array<Record<string, unknown>>).map((entry) => ({
        name: entry.name as string,
        size: entry.size as number,
      }));
      expect(files).toEqual([{ name: "c.txt", size: Buffer.byteLength(otherContent) }]);
    });
  });

  test("rejects when target folder already exists", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);
    const sourceFolder = "album-source";
    const targetFolder = "album-existing";

    await test.step("upload files into source and target", async () => {
      await uploadFile(
        request,
        apiBase,
        payload.eventId as string,
        { user: "guest", password: payload.guestPassword as string },
        { name: "source.txt", mimeType: "text/plain", content: "source" },
        sourceFolder
      );
      await uploadFile(
        request,
        apiBase,
        payload.eventId as string,
        { user: "guest", password: payload.guestPassword as string },
        { name: "target.txt", mimeType: "text/plain", content: "target" },
        targetFolder
      );
    });

    await test.step("attempt rename to existing folder", async () => {
      const response = await request.patch(
        `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/folders/${encodeURIComponent(sourceFolder)}`,
        {
          headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
          data: { to: targetFolder },
        }
      );
      expect(response.status()).toBe(409);
      const body = await response.json();
      expect(body.errorKey).toBe("FOLDER_ALREADY_EXISTS");
      expect(body.property).toBe("to");
    });
  });

  test("rejects invalid body", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/folders/album-a`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { to: "bad/" },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FOLDER");
  });

  test("rejects invalid folder path", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/folders/bad!`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        data: { to: "good-folder" },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FOLDER");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);

    const response = await request.patch(`${apiBase}/api/events/bad_/folders/album-a`, {
      headers: toAuthHeader({ user: "admin", password: "adminpass123" }),
      data: { to: "album-b" },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("returns not found for missing event", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);

    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(getUniqueEventId("missing"))}/folders/album-a`,
      {
        headers: toAuthHeader({ user: "admin", password: "adminpass123" }),
        data: { to: "album-b" },
      }
    );
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.errorKey).toBe("EVENT_NOT_FOUND");
  });

  test("rejects missing auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/folders/album-a`,
      {
        data: { to: "album-b" },
      }
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects guest auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.patch(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/folders/album-a`,
      {
        headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }),
        data: { to: "album-b" },
      }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });
});

test.describe("POST /api/events/{eventId}/files", () => {
  test("uploads files with guest auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const { response: uploadResponse } = await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "upload.txt", mimeType: "text/plain", content: "hello" }
    );
    expect(uploadResponse.status()).toBe(200);
  });

  test("rejects upload without folder when required", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, {
      requireUploadFolder: true,
      allowGuestDownload: true,
    });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.post(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files`,
      {
        headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }),
        multipart: {
          files: {
            name: "upload.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("hello"),
          },
        },
      }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("UPLOAD_FOLDER_REQUIRED");
    expect(body.property).toBe("from");
    expect(body.message).toBe("Upload folder is required.");
  });

  test("allows upload with folder when required", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, {
      requireUploadFolder: true,
      allowGuestDownload: true,
    });
    const apiBase = getApiBaseUrl(baseURL);

    const { response: uploadResponse } = await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "admin", password: payload.adminPassword as string },
      { name: "upload.txt", mimeType: "text/plain", content: "hello" },
      "album-a"
    );
    expect(uploadResponse.status()).toBe(200);
  });

  test("rejects invalid folder input", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const { response: uploadResponse } = await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "bad.txt", mimeType: "text/plain", content: "hello" },
      "bad/"
    );
    expect(uploadResponse.status()).toBe(400);
    const body = await uploadResponse.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("from");
  });

  test("rejects missing auth on secured event", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const upload = await request.post(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files`,
      {
        multipart: {
          files: {
            name: "upload.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("hello"),
          },
        },
      }
    );
    expect(upload.status()).toBe(401);
    const body = await upload.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects wrong guest password", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const { response: uploadResponse } = await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: "wrongpass" },
      { name: "upload.txt", mimeType: "text/plain", content: "hello" }
    );
    expect(uploadResponse.status()).toBe(403);
    const body = await uploadResponse.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const upload = await request.post(`${apiBase}/api/events/bad_/files`, {
      multipart: {
        files: {
          name: "upload.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("hello"),
        },
      },
    });
    expect(upload.status()).toBe(400);
    const body = await upload.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("returns not found for missing event", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const upload = await request.post(
      `${apiBase}/api/events/${encodeURIComponent(getUniqueEventId("missing"))}/files`,
      {
        multipart: {
          files: {
            name: "upload.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("hello"),
          },
        },
      }
    );
    expect(upload.status()).toBe(404);
    const body = await upload.json();
    expect(body.errorKey).toBe("EVENT_NOT_FOUND");
  });

  test("rejects guest uploads when disabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestUpload: false });
    const apiBase = getApiBaseUrl(baseURL);

    const { response: uploadResponse } = await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "upload.txt", mimeType: "text/plain", content: "hello" }
    );
    expect(uploadResponse.status()).toBe(403);
    const body = await uploadResponse.json();
    expect(body.errorKey).toBe("GUEST_UPLOADS_DISABLED");
  });
});

test.describe("GET /api/events/{eventId}/files/{filename}", () => {
  test("downloads file from folder via query (GET /api/events/{eventId}/files/{filename}?folder=...)", async ({
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);
    const folder = "album-1";

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "folder.txt", mimeType: "text/plain", content: "folder content" },
      folder
    );

    const queryResponse = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/${encodeURIComponent("folder.txt")}?folder=${encodeURIComponent(folder)}`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(queryResponse.status()).toBe(200);
    expect(await queryResponse.text()).toBe("folder content");
  });
});

test.describe("GET /api/events/{eventId}/files/{folder}/{filename}", () => {
  test("downloads file from folder via path (GET /api/events/{eventId}/files/{folder}/{filename})", async ({
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);
    const folder = "album-1";

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "folder.txt", mimeType: "text/plain", content: "folder content" },
      folder
    );

    const pathResponse = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/${encodeURIComponent(folder)}/${encodeURIComponent("folder.txt")}`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(pathResponse.status()).toBe(200);
    expect(await pathResponse.text()).toBe("folder content");
  });

  test("downloads file with guest auth when downloads enabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);
    const folder = "album-1";

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "guest.txt", mimeType: "text/plain", content: "guest data" },
      folder
    );

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/${encodeURIComponent(folder)}/${encodeURIComponent("guest.txt")}`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(200);
  });

  test("rejects missing auth on secured event", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album-1/missing.txt`
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects guest download when disabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: false });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album-1/missing.txt`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("GUEST_DOWNLOADS_DISABLED");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.get(`${apiBase}/api/events/bad_/files/album-1/file.txt`);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("rejects invalid filename", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album-1/bad%5Cname`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FILENAME");
  });

  test("rejects invalid folder path", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/bad!/file.txt`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FOLDER");
  });

  test("returns not found for missing file", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album-1/missing.txt`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.errorKey).toBe("FILE_NOT_FOUND");
  });
});

test.describe("GET /api/events/{eventId}/files/{filename}", () => {
  test("downloads file with admin auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "download.txt", mimeType: "text/plain", content: "file content" }
    );

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/download.txt`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe("file content");
    expect(response.headers()["cache-control"]).toContain("max-age=86400");
  });

  test("downloads file with guest auth when downloads enabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "guest.txt", mimeType: "text/plain", content: "guest data" }
    );

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/guest.txt`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(200);
  });

  test("rejects missing auth on secured event", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.txt`
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects guest download when disabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: false });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.txt`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("GUEST_DOWNLOADS_DISABLED");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.get(`${apiBase}/api/events/bad_/files/file.txt`);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("rejects invalid filename", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/bad%5Cname`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FILENAME");
  });

  test("rejects invalid folder query", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.txt?folder=bad/`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FOLDER");
  });

  test("returns not found for missing file", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.txt`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.errorKey).toBe("FILE_NOT_FOUND");
  });
});

test.describe("GET /api/events/{eventId}/files/{filename}/preview", () => {
  test("returns resized preview with cache headers", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    await test.step("upload preview image", async () => {
      const { response: uploadResponse, body: uploadBody } = await uploadFile(
        request,
        apiBase,
        payload.eventId as string,
        { user: "guest", password: payload.guestPassword as string },
        { name: "preview.png", mimeType: "image/png", content: tinyPng }
      );
      expect(uploadResponse.status()).toBe(200);
      expectUploadBody(uploadBody as Record<string, unknown>, { uploaded: 1, rejectedCount: 0 });
    });

    await test.step("wait for uploaded file to be readable", async () => {
      await expect
        .poll(
          async () => {
            const download = await request.get(
              `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/preview.png`,
              {
                headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }),
              }
            );
            if (!download.ok()) return 0;
            const buffer = await download.body();
            return buffer.length;
          },
          { timeout: process.env.CI ? 20000 : 10000, intervals: [250, 500, 1000] }
        )
        .toBeGreaterThan(50);
    });

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/preview.png/preview?w=320&format=jpeg`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/jpeg");
    expect(response.headers()["cache-control"]).toContain("public, max-age=31536000, immutable");
    expect((await response.body()).length).toBeGreaterThan(0);
  });

  test("rejects invalid preview params", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.png/preview?w=0`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("w");
  });

  test("rejects preview width over limit", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.png/preview?w=2000`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("w");
  });
  test("rejects invalid height param", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.png/preview?h=-1`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("h");
  });

  test("rejects invalid quality param", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.png/preview?q=200`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("q");
  });

  test("rejects invalid fit param", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.png/preview?fit=stretch`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("fit");
  });

  test("rejects invalid format param", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.png/preview?format=gif`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_INPUT");
    expect(body.property).toBe("format");
  });

  test("rejects preview for non-image files", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "not-image.txt", mimeType: "text/plain", content: "hello" }
    );

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/not-image.txt/preview`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(415);
    const body = await response.json();
    expect(body.errorKey).toBe("UNSUPPORTED_FILE_TYPE");
    expect(body.property).toBe("filename");
  });
});

test.describe("GET /api/events/{eventId}/files/{folder}/{filename}/preview", () => {
  test("returns resized preview from folder path", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "folder-preview.png", mimeType: "image/png", content: tinyPng },
      "album"
    );

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album/folder-preview.png/preview?w=200`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/jpeg");
    expect(response.headers()["cache-control"]).toContain("public, max-age=31536000, immutable");
  });

  test("rejects invalid folder path", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/bad!/preview.png/preview`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FOLDER");
    expect(body.property).toBe("folder");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);

    const response = await request.get(
      `${apiBase}/api/events/bad_/files/album/preview.png/preview`
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("rejects invalid filename", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album/bad%5Cname/preview`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FILENAME");
    expect(body.property).toBe("filename");
  });
});

test.describe("DELETE /api/events/{eventId}/files/{filename}", () => {
  test("deletes file with admin auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "delete.txt", mimeType: "text/plain", content: "delete me" }
    );

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/delete.txt`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectDeleteFileBody(body);
  });

  test("rejects missing auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.txt`
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects guest auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.txt`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects invalid filename", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/%5Cabc`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FILENAME");
    expect(body.property).toBe("filename");
  });

  test("rejects invalid filename to parent", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/${encodeURIComponent("../file.txt")}`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FILENAME");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.delete(`${apiBase}/api/events/bad_/files/file.txt`, {
      headers: toAuthHeader({ user: "admin", password: "adminpass123" }),
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("returns not found for missing file", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/missing.txt`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.errorKey).toBe("FILE_NOT_FOUND");
  });
});

test.describe("DELETE /api/events/{eventId}/files/{folder}/{filename}", () => {
  test("deletes file with admin auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);
    const folder = "album-1";

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "delete.txt", mimeType: "text/plain", content: "delete me" },
      folder
    );

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/${encodeURIComponent(folder)}/delete.txt`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectDeleteFileBody(body);
  });

  test("rejects missing auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album-1/missing.txt`
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects guest auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album-1/missing.txt`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects invalid filename", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album-1/%5Cabc`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FILENAME");
    expect(body.property).toBe("filename");
  });

  test("rejects invalid filename to parent", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album-1/${encodeURIComponent("../file.txt")}`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FILENAME");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.delete(`${apiBase}/api/events/bad_/files/album-1/file.txt`, {
      headers: toAuthHeader({ user: "admin", password: "adminpass123" }),
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("rejects invalid folder path", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/bad!/file.txt`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FOLDER");
  });

  test("returns not found for missing file", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.delete(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files/album-1/missing.txt`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.errorKey).toBe("FILE_NOT_FOUND");
  });
});

test.describe("GET /api/events/{eventId}/files.zip", () => {
  test("downloads zip with admin auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "zip.txt", mimeType: "text/plain", content: "zip file" }
    );

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files.zip`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/zip");
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("returns no-cache headers for zip downloads", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "zip-cache.txt", mimeType: "text/plain", content: "zip cache" }
    );

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files.zip`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["pragma"]).toContain("no-cache");
    expect(response.headers()["surrogate-control"]).toContain("no-store");
    expect(response.headers()["expires"]).toBe("0");
  });

  test("downloads zip with guest auth when downloads enabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "zip2.txt", mimeType: "text/plain", content: "zip data" }
    );

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files.zip`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(200);
  });

  test("rejects missing auth on secured event", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: true });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files.zip`
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.errorKey).toBe("AUTHORIZATION_REQUIRED");
  });

  test("rejects guest downloads when disabled", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL, { allowGuestDownload: false });
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files.zip`,
      { headers: toAuthHeader({ user: "guest", password: payload.guestPassword as string }) }
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.errorKey).toBe("GUEST_DOWNLOADS_DISABLED");
  });

  test("rejects invalid folder query", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files.zip?folder=bad/`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_FOLDER");
  });

  test("rejects invalid event id", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.get(`${apiBase}/api/events/bad_/files.zip`);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.errorKey).toBe("INVALID_EVENT_ID");
  });

  test("returns not found when no files exist", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const response = await request.get(
      `${apiBase}/api/events/${encodeURIComponent(payload.eventId as string)}/files.zip`,
      { headers: toAuthHeader({ user: "admin", password: payload.adminPassword as string }) }
    );
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.errorKey).toBe("NO_FILES_AVAILABLE");
  });
});
