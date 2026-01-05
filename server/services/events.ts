import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { DATA_ROOT_PATH } from "../config.js";
import { EventConfig } from "../types.js";
import { storage } from "../storage/index.js";
import { StorageResult } from "../storage/types.js";

export class EventAlreadyExistsError extends Error {
  constructor(eventId: string) {
    super(`Event ${eventId} already exists`);
    this.name = "EventAlreadyExistsError";
  }
}

const normalizeProject = (config: EventConfig): EventConfig => ({
  ...config,
  name: (config.name || "").trim() || config.eventId,
  description: config.description ? config.description.trim() : undefined,
  allowedMimeTypes: Array.isArray(config.allowedMimeTypes)
    ? config.allowedMimeTypes.filter(Boolean).map((m) => m.trim())
    : [],
  settings: {
    rootPath: config.settings?.rootPath || DATA_ROOT_PATH,
    allowGuestDownload: Boolean(config.settings?.allowGuestDownload),
  },
  auth: {
    guestPasswordHash: config.auth?.guestPasswordHash ?? null,
    adminPasswordHash: config.auth?.adminPasswordHash || "",
  },
});

const requireOk = <T>(result: StorageResult<T>): T => {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
};

export const ensureBaseDir = async () => {
  await storage.events.ensureBaseDir();
};

export const isEventIdAvailable = async (eventId: string): Promise<boolean> =>
  requireOk(await storage.events.isEventIdAvailable(eventId));

export const getEvent = async (eventId: string): Promise<EventConfig | null> => {
  const result = await storage.events.getEvent(eventId);
  if (!result.ok) {
    if (result.error.errorKey === "EVENT_NOT_FOUND") return null;
    throw new Error(result.error.message);
  }
  return normalizeProject(result.data);
};

export const saveEvent = async (project: EventConfig) => {
  const normalized = normalizeProject(project);
  requireOk(await storage.events.saveEvent(normalized));
};

export const createEventConfig = async (params: {
  name: string;
  description?: string;
  eventId: string;
  guestPassword: string;
  adminPassword: string;
  allowedMimeTypes?: string[];
  allowGuestDownload?: boolean;
}): Promise<EventConfig> => {
  const {
    name,
    description,
    eventId,
    guestPassword,
    adminPassword,
    allowedMimeTypes,
    allowGuestDownload,
  } = params;
  const mimeTypes = Array.isArray(allowedMimeTypes)
    ? allowedMimeTypes.filter(Boolean).map((m) => m.trim())
    : [];
  return {
    name: name.trim(),
    description: description?.trim() || undefined,
    eventId: eventId,
    createdAt: new Date().toISOString(),
    allowedMimeTypes: mimeTypes,
    settings: {
      rootPath: DATA_ROOT_PATH,
      allowGuestDownload: Boolean(allowGuestDownload),
    },
    auth: {
      guestPasswordHash: guestPassword ? await bcrypt.hash(guestPassword, 10) : null,
      adminPasswordHash: await bcrypt.hash(adminPassword, 10),
    },
  };
};

export const createEvent = async (params: {
  name: string;
  description?: string;
  eventId: string;
  guestPassword: string;
  adminPassword: string;
  allowedMimeTypes?: string[];
  allowGuestDownload?: boolean;
}): Promise<EventConfig> => {
  const event = await createEventConfig(params);
  const result = await storage.events.createEvent(event);
  if (!result.ok) {
    if (result.error.errorKey === "EVENT_ID_TAKEN") {
      throw new EventAlreadyExistsError(event.eventId);
    }
    throw new Error(result.error.message);
  }
  return result.data;
};

export const deleteEvent = async (eventId: string) => {
  requireOk(await storage.events.deleteEvent(eventId));
};

export const findUniqueName = (dir: string, originalName: string) => {
  const parsed = path.parse(originalName);
  let candidate = originalName;
  let counter = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${parsed.name}_${counter++}${parsed.ext}`;
  }
  return candidate;
};
