import path from "node:path";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { DATA_ROOT_PATH } from "../../config.js";
import { EventConfig } from "../../types.js";
import { createStorageError, fail, ok, StorageResult, EventStore } from "../types.js";

const projectPath = (eventId: string) => path.join(DATA_ROOT_PATH, eventId, "project.json");

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  Boolean(error) && typeof error === "object" && "code" in (error as NodeJS.ErrnoException);

export const createFsEventStore = (): EventStore => {
  const ensureBaseDir = async () => {
    await mkdir(DATA_ROOT_PATH, { recursive: true });
  };

  const isEventIdAvailable = async (eventId: string): Promise<StorageResult<boolean>> => {
    try {
      await access(path.join(DATA_ROOT_PATH, eventId));
      return ok(false);
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === "ENOENT") return ok(true);
      throw error;
    }
  };

  const getEvent = async (eventId: string): Promise<StorageResult<EventConfig>> => {
    try {
      const raw = await readFile(projectPath(eventId), "utf8");
      return ok(JSON.parse(raw) as EventConfig);
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        return fail(
          createStorageError({
            message: "Event not found.",
            errorKey: "EVENT_NOT_FOUND",
            property: "eventId",
          })
        );
      }
      throw error;
    }
  };

  const saveEvent = async (project: EventConfig): Promise<StorageResult<EventConfig>> => {
    const partyDir = path.join(DATA_ROOT_PATH, project.eventId);
    const uploadsDir = path.join(partyDir, "uploads");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(projectPath(project.eventId), JSON.stringify(project, null, 2), "utf8");
    return ok(project);
  };

  const createEvent = async (project: EventConfig): Promise<StorageResult<EventConfig>> => {
    const partyDir = path.join(DATA_ROOT_PATH, project.eventId);
    try {
      await mkdir(partyDir, { recursive: false });
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === "EEXIST") {
        return fail(
          createStorageError({
            message: "Event ID is already taken.",
            errorKey: "EVENT_ID_TAKEN",
            property: "eventId",
          })
        );
      }
      throw error;
    }

    await saveEvent(project);
    return ok(project);
  };

  const deleteEvent = async (eventId: string): Promise<StorageResult<void>> => {
    const dir = path.join(DATA_ROOT_PATH, eventId);
    await rm(dir, { recursive: true, force: true });
    return ok(undefined);
  };

  return {
    ensureBaseDir,
    isEventIdAvailable,
    getEvent,
    saveEvent,
    createEvent,
    deleteEvent,
  };
};
