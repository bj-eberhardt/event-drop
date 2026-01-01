import { expect, test } from "@playwright/test";
import { createCleanupTracker } from "./support/cleanup";
import { getUniqueEventId } from "./support/ids";

type Auth = { user: "admin" | "guest"; password: string };

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

const toAuthHeader = (auth?: Auth) => {
  if (!auth) return undefined;
  const token = Buffer.from(`${auth.user}:${auth.password}`).toString("base64");
  return { Authorization: `Basic ${token}` };
};

const createEventPayload = (overrides?: Partial<Record<string, unknown>>) => ({
  name: "API Test Event",
  description: "",
  eventId: getUniqueEventId("e2e-api"),
  guestPassword: "guestpass123",
  adminPassword: "adminpass123",
  adminPasswordConfirm: "adminpass123",
  allowedMimeTypes: [],
  ...overrides,
});

const createEvent = async (
  request: import("@playwright/test").APIRequestContext,
  baseURL?: string,
  overrides?: Partial<Record<string, unknown>>
) => {
  const apiBase = getApiBaseUrl(baseURL);
  const payload = createEventPayload(overrides);
  const response = await request.post(`${apiBase}/api/events`, { data: payload });
  expect(response.status()).toBe(200);
  cleanup.track({
    eventId: payload.eventId as string,
    adminPassword: payload.adminPassword as string,
    baseURL,
  });
  return { response, payload };
};

const uploadFile = async (
  request: import("@playwright/test").APIRequestContext,
  baseURL: string,
  eventId: string,
  auth: Auth,
  file: { name: string; mimeType: string; content: string },
  from?: string
) => {
  const multipart: {
    [key: string]: string | number | boolean | { name: string; mimeType: string; buffer: Buffer };
  } = {
    files: {
      name: file.name,
      mimeType: file.mimeType,
      buffer: Buffer.from(file.content),
    },
  };
  if (from !== undefined) {
    multipart.from = from;
  }
  return request.post(`${baseURL}/api/events/${encodeURIComponent(eventId)}/files`, {
    headers: toAuthHeader(auth),
    multipart,
  });
};

test.afterEach(async ({ request }) => {
  await cleanup.cleanupAll(request);
});

test.describe("GET /api/config", () => {
  test("returns app configuration", async ({ request }, testInfo) => {
    const apiBase = getApiBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const response = await request.get(`${apiBase}/api/config`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.allowedDomains)).toBe(true);
    expect(typeof body.supportSubdomain).toBe("boolean");
    expect(typeof body.allowEventCreation).toBe("boolean");
  });
});

test.describe("POST /api/events", () => {
  test("creates event", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { response, payload } = await createEvent(request, baseURL, {
      allowGuestDownload: true,
    });
    const body = await response.json();
    expect(body.eventId).toBe(payload.eventId);
    expect(body.secured).toBe(true);
    expect(body.allowGuestDownload).toBe(true);
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
    expect(body.ok).toBe(true);
    expect(body.name).toBe("Updated Name");
    expect(body.description).toBe("Updated description");
    expect(body.allowGuestDownload).toBe(true);
    expect(body.allowedMimeTypes).toContain("image/png");
    expect(body.eventId).toBe(payload.eventId);
    expect(body.secured).toBe(true);
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
    expect(body.allowGuestDownload).toBe(true);
    expect(body.secured).toBe(true);
    expect(body.eventId).toBe(payload.eventId);
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
    expect(body.files).toEqual([]);
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

test.describe("POST /api/events/{eventId}/files", () => {
  test("uploads files with guest auth", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const upload = await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "upload.txt", mimeType: "text/plain", content: "hello" }
    );
    expect(upload.status()).toBe(200);
    const body = await upload.json();
    expect(body.uploaded).toBe(1);
  });

  test("rejects invalid folder input", async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    const { payload } = await createEvent(request, baseURL);
    const apiBase = getApiBaseUrl(baseURL);

    const upload = await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: payload.guestPassword as string },
      { name: "bad.txt", mimeType: "text/plain", content: "hello" },
      "bad/"
    );
    expect(upload.status()).toBe(400);
    const body = await upload.json();
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

    const upload = await uploadFile(
      request,
      apiBase,
      payload.eventId as string,
      { user: "guest", password: "wrongpass" },
      { name: "upload.txt", mimeType: "text/plain", content: "hello" }
    );
    expect(upload.status()).toBe(403);
    const body = await upload.json();
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
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.errorKey).toBe("FILE_NOT_FOUND");
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
