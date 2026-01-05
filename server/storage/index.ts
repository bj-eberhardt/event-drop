import { createFsEventStore } from "./fs/event-store.js";
import { createFsFileStore } from "./fs/file-store.js";

export const storage = {
  events: createFsEventStore(),
  files: createFsFileStore(),
};

export type Storage = typeof storage;
