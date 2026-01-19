/**
 * API Request and Response Types
 */

// event related types
export interface EventInfo {
  name: string;
  description?: string;
  eventId: string;
  allowedMimeTypes: string[];
  secured: boolean;
  allowGuestDownload: boolean;
  accessLevel?: "unauthenticated" | "guest" | "admin";
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
  createdAt?: string;
}

export interface CreateEventRequest {
  name: string;
  description?: string;
  eventId: string;
  allowedMimeTypes?: string[];
  guestPassword: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  allowGuestDownload?: boolean;
}

export interface CreateEventResponse {
  name: string;
  description?: string;
  eventId: string;
  allowedMimeTypes: string[];
  secured: boolean;
  allowGuestDownload: boolean;
  accessLevel?: "unauthenticated" | "guest" | "admin";
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
  createdAt: string;
}

export interface DeleteEventResponse {
  message: string;
  ok: boolean;
}

export interface UpdateEventRequest {
  name?: string;
  description?: string;
  allowedMimeTypes?: string[];
  guestPassword?: string;
  allowGuestDownload?: boolean;
}

export interface UpdateEventResponse {
  ok: boolean;
  name: string;
  description?: string;
  eventId: string;
  allowedMimeTypes: string[];
  secured: boolean;
  allowGuestDownload: boolean;
  accessLevel?: "unauthenticated" | "guest" | "admin";
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
  createdAt?: string;
}

// File-related types
export interface FileEntry {
  name: string;
  size: number;
  createdAt: string;
}

export interface ListFilesRequest {
  folder?: string;
}

export interface ListFilesResponse {
  files: FileEntry[];
  folders: string[];
  folder: string;
}

export interface UploadFilesRequest {
  files: File[];
  from?: string;
}

export interface UploadFilesResponse {
  message: string;
  uploaded: number;
  rejected?: { file: string; reason: string }[];
}

export interface DownloadFileRequest {
  filename: string;
  folder?: string;
}

export interface PreviewFileRequest {
  filename: string;
  folder?: string;
  width?: number;
  height?: number;
  quality?: number;
  fit?: "inside" | "cover";
  format?: "jpeg" | "webp" | "png";
}

export interface DeleteFileRequest {
  filename: string;
  folder?: string;
}

export interface DeleteFileResponse {
  ok: boolean;
  message: string;
}

export interface AppConfigResponse {
  allowedDomains: string[];
  supportSubdomain: boolean;
  allowEventCreation: boolean;
}

// Error response
export interface ApiErrorResponse {
  message: string;
  errorKey: string;
  additionalParams: Record<string, string | number | boolean>;
  property?: string;
  secured?: boolean;
  eventId?: string;
}
