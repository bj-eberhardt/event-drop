export interface EventConfig {
  eventId: string;
  name: string;
  description?: string;
  createdAt: string;
  allowedMimeTypes: string[];
  settings: {
    rootPath: string;
    allowGuestDownload: boolean;
  };
  auth: {
    guestPasswordHash: string | null;
    adminPasswordHash: string;
  };
}

export type AccessLevel = "unauthenticated" | "guest" | "admin";

export const ERROR_KEYS = [
  "ADMIN_ACCESS_REQUIRED",
  "GUEST_ACCESS_REQUIRED",
  "INVALID_FILENAME",
  "INVALID_FOLDER",
  "INVALID_INPUT",
  "INVALID_EVENT_ID",
  "FILE_NOT_FOUND",
  "NO_FILES_AVAILABLE",
  "UNSUPPORTED_FILE_TYPE",
  "EVENT_ID_TAKEN",
  "EVENT_NOT_FOUND",
  "EVENT_CONTEXT_MISSING",
  "AUTHORIZATION_REQUIRED",
  "GUEST_DOWNLOADS_DISABLED",
  "EVENT_CREATION_DISABLED",
  "RATE_LIMITED",
] as const;

export type ErrorKey = (typeof ERROR_KEYS)[number];

export type ErrorAdditionalParams = Record<string, string | number | boolean>;

export interface ErrorResponse {
  message: string;
  errorKey: ErrorKey;
  additionalParams: ErrorAdditionalParams;
  property?: string;
  secured?: boolean;
  eventId?: string;
}

export interface EventConfigResponse {
  eventId: string;
  name: string;
  description?: string;
  secured: boolean;
  allowGuestDownload: boolean;
  accessLevel: AccessLevel;
  createdAt: string;
  allowedMimeTypes: string[];
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
}

export interface AppConfigResponse {
  allowedDomains: string[];
  supportSubdomain: boolean;
  allowEventCreation: boolean;
}

export interface FileEntry {
  name: string;
  size: number;
  createdAt: string;
}

export interface ListFilesResult {
  files: FileEntry[];
  folders: string[];
}

export interface MoveUploadedFilesResult {
  moved: number;
}

export interface DeleteFileResult {
  ok: boolean;
  message: string;
}
