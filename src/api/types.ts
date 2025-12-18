/**
 * API Request and Response Types
 */

// Project-related types
export interface ProjectInfo {
  name: string;
  description?: string;
  eventId: string;
  allowedMimeTypes: string[];
  secured: boolean;
  allowGuestDownload: boolean;
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
  createdAt?: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  eventId: string;
  allowedMimeTypes?: string[];
  guestPassword: string;
  adminPassword: string;
  adminPasswordConfirm: string;
}

export interface CreateProjectResponse {
  name: string;
  description?: string;
  eventId: string;
  allowedMimeTypes: string[];
  secured: boolean;
  allowGuestDownload: boolean;
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
  createdAt?: string;
}

export interface DeleteProjectResponse {
  message: string;
  ok: boolean;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  allowedMimeTypes?: string[];
  guestPassword?: string;
  allowGuestDownload?: boolean;
}

export interface UpdateProjectResponse {
  ok: boolean;
  name: string;
  description?: string;
  eventId: string;
  allowedMimeTypes: string[];
  secured: boolean;
  allowGuestDownload: boolean;
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

// Error response
export interface ApiErrorResponse {
  message: string;
  errorKey?: string;
  secured?: boolean;
  eventId?: string;
}
