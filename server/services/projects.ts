import path from "node:path";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { MAIN_DOMAIN, DATA_ROOT_PATH } from "../config.js";
import { EventConfig } from "../types.js";

const projectPath = (subdomain: string) =>
  path.join(DATA_ROOT_PATH, subdomain, "project.json");

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

export const isEventIdAvailable = async (subdomain: string): Promise<boolean> => {
  try {
    await access(path.join(DATA_ROOT_PATH, subdomain));
    return false;
  } catch (error: any) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
};

export const getEvent = async (subdomain: string): Promise<EventConfig | null> => {
  try {
    const raw = await readFile(projectPath(subdomain), "utf8");
    return normalizeProject(JSON.parse(raw) as EventConfig);
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
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
}): Promise<EventConfig> => {
  const { name, description, eventId, guestPassword, adminPassword, allowedMimeTypes } = params;
  const mimeTypes = Array.isArray(allowedMimeTypes)
    ? allowedMimeTypes.filter(Boolean).map((m) => m.trim())
    : [];
  return {
    name: name.trim(),
    description: description?.trim() || undefined,
    eventId: eventId,
    domain: `${eventId}.${MAIN_DOMAIN}`,
    createdAt: new Date().toISOString(),
    allowedMimeTypes: mimeTypes,
    settings: {
      rootPath: DATA_ROOT_PATH,
      allowGuestDownload: false,
    },
    auth: {
      guestPasswordHash: guestPassword ? await bcrypt.hash(guestPassword, 10) : null,
      adminPasswordHash: await bcrypt.hash(adminPassword, 10),
    },
  };
};

export const deleteEvent = async (subdomain: string) => {
  const dir = path.join(DATA_ROOT_PATH, subdomain);
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

