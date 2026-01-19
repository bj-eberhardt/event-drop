export type Route = "home" | "new" | "event" | "admin";

export type Availability = "idle" | "invalid" | "checking" | "available" | "taken" | "error";

export type FileEntry = { name: string; size: number; createdAt: string };

export type EventMeta = {
  name: string;
  description?: string;
  allowedMimeTypes: string[];
  eventId: string;
  secured: boolean;
  allowGuestDownload?: boolean;
  uploadMaxFileSizeBytes?: number;
  uploadMaxTotalSizeBytes?: number;
};
