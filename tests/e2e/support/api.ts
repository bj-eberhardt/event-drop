import type { APIRequestContext } from "@playwright/test";

type CreateEventPayload = {
  name: string;
  description?: string;
  eventId: string;
  guestPassword?: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  allowedMimeTypes?: string[];
  allowGuestDownload?: boolean;
  allowGuestUpload?: boolean;
};

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

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 300): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
};

export const createEvent = async (
  request: APIRequestContext,
  payload: CreateEventPayload,
  baseURL?: string
) => {
  const apiBase = getApiBaseUrl(baseURL);
  const response = await withRetry(() => request.post(`${apiBase}/api/events`, { data: payload }));
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to create event: ${response.status()} ${body}`);
  }
  return response.json();
};

export const deleteEvent = async (
  request: APIRequestContext,
  eventId: string,
  adminPassword: string,
  baseURL?: string
) => {
  const apiBase = getApiBaseUrl(baseURL);
  const response = await withRetry(() =>
    request.delete(`${apiBase}/api/events/${encodeURIComponent(eventId)}`, {
      headers: {
        Authorization: toBasicAuth("admin", adminPassword),
      },
    })
  );
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to delete event: ${response.status()} ${body}`);
  }
};

export const isEventAvailable = async (
  request: APIRequestContext,
  eventId: string,
  baseURL?: string
) => {
  const apiBase = getApiBaseUrl(baseURL);
  const response = await withRetry(() =>
    request.get(`${apiBase}/api/events/${encodeURIComponent(eventId)}`)
  );
  return response.status() === 404;
};

export const getEvent = async (
  request: APIRequestContext,
  eventId: string,
  baseURL?: string,
  auth?: { type: "guest" | "admin"; password: string }
) => {
  const apiBase = getApiBaseUrl(baseURL);
  const headers = auth ? { Authorization: toBasicAuth(auth.type, auth.password) } : undefined;
  return withRetry(() =>
    request.get(`${apiBase}/api/events/${encodeURIComponent(eventId)}`, { headers })
  );
};

export const listFiles = async (
  request: APIRequestContext,
  eventId: string,
  baseURL?: string,
  auth?: { type: "guest" | "admin"; password: string }
) => {
  const apiBase = getApiBaseUrl(baseURL);
  const headers = auth ? { Authorization: toBasicAuth(auth.type, auth.password) } : undefined;
  return withRetry(() =>
    request.get(`${apiBase}/api/events/${encodeURIComponent(eventId)}/files`, { headers })
  );
};

export const uploadFile = async (
  request: APIRequestContext,
  eventId: string,
  file: { name: string; mimeType: string; content: string | Buffer },
  baseURL?: string,
  auth?: { type: "guest" | "admin"; password: string },
  folder?: string
) => {
  const apiBase = getApiBaseUrl(baseURL);
  const headers = auth ? { Authorization: toBasicAuth(auth.type, auth.password) } : undefined;
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
  if (folder !== undefined) {
    multipart.from = folder;
  }
  const response = await withRetry(() =>
    request.post(`${apiBase}/api/events/${encodeURIComponent(eventId)}/files`, {
      headers,
      multipart,
    })
  );
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to upload file: ${response.status()} ${body}`);
  }
  return response;
};

export const cleanupEvent = async (
  request: APIRequestContext,
  eventId: string,
  adminPassword: string,
  baseURL?: string
) => {
  try {
    const available = await isEventAvailable(request, eventId, baseURL);
    if (!available) {
      await deleteEvent(request, eventId, adminPassword, baseURL);
    }
  } catch {
    // ignore cleanup failures (transient network issues)
  }
};
