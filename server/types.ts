export interface EventConfig {
  eventId: string;
  name: string;
  description?: string;
  domain: string;
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

export interface EventConfigResponse {
  eventId: string;
  name: string;
  description?: string;
  secured: boolean;
  allowGuestDownload: boolean;
  createdAt: string;
  allowedMimeTypes: string[];
  uploadMaxFileSizeBytes: number;
  uploadMaxTotalSizeBytes: number;
}

export interface AccessResult {
  allowed: boolean;
  secured: boolean;
  subdomain?: string;
  errorMessage?: string;
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
