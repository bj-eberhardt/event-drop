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
