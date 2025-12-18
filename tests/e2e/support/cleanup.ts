import type { APIRequestContext } from "@playwright/test";

import { cleanupEvent } from "./api";

type CleanupEntry = {
  eventId: string;
  adminPassword: string;
  baseURL?: string;
};

export const createCleanupTracker = () => {
  const entries: CleanupEntry[] = [];

  return {
    track: (entry: CleanupEntry) => {
      entries.push(entry);
    },
    cleanupAll: async (request: APIRequestContext) => {
      const pending = entries.splice(0, entries.length);
      for (const entry of pending) {
        await cleanupEvent(request, entry.eventId, entry.adminPassword, entry.baseURL);
      }
    },
  };
};
