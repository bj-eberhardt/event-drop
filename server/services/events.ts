import path from "node:path";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { DATA_ROOT_PATH } from "../config.js";
import { EventConfig } from "../types.js";

export class EventAlreadyExistsError extends Error {
  constructor(eventId: string) {
    super(`Event ${eventId} already exists`);
    this.name = "EventAlreadyExistsError";
  }
}

const projectPath = (eventFolderName: string) =>
  path.join(DATA_ROOT_PATH, eventFolderName, "project.json");

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

export const ensureBaseDir = async () => {
  await mkdir(DATA_ROOT_PATH, { recursive: true });
};

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  Boolean(error) && typeof error === "object" && "code" in (error as NodeJS.ErrnoException);

export const isEventIdAvailable = async (eventId: string): Promise<boolean> => {
  try {
    await access(path.join(DATA_ROOT_PATH, eventId));
    return false;
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") return true;
    throw error;
  }
};

export const getEvent = async (eventId: string): Promise<EventConfig | null> => {
  try {
    const raw = await readFile(projectPath(eventId), "utf8");
    return normalizeProject(JSON.parse(raw) as EventConfig);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") return null;
    throw error;
  }
};

export const saveEvent = async (project: EventConfig) => {
  const normalized = normalizeProject(project);
  const partyDir = path.join(DATA_ROOT_PATH, project.eventId);
  const uploadsDir = path.join(partyDir, "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(projectPath(project.eventId), JSON.stringify(normalized, null, 2), "utf8");
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
  const partyDir = path.join(DATA_ROOT_PATH, event.eventId);
  try {
    await mkdir(partyDir, { recursive: false });
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "EEXIST") {
      throw new EventAlreadyExistsError(event.eventId);
    }
    throw error;
  }

  await saveEvent(event);
  return event;
};

export const deleteEvent = async (eventId: string) => {
  const dir = path.join(DATA_ROOT_PATH, eventId);
  await rm(dir, { recursive: true, force: true });
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
