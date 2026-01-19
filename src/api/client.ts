import { apiBase } from "../constants";
import i18n from "../i18n";
import type {
  ApiErrorResponse,
  CreateEventRequest,
  CreateEventResponse,
  DeleteEventResponse,
  DownloadFileRequest,
  PreviewFileRequest,
  DeleteFileRequest,
  DeleteFileResponse,
  ListFilesRequest,
  ListFilesResponse,
  EventInfo,
  UpdateEventRequest,
  UpdateEventResponse,
  UploadFilesRequest,
  UploadFilesResponse,
  AppConfigResponse,
  RenameFolderRequest,
  RenameFolderResponse,
} from "./types";

/**
 * Error type that includes HTTP status and optional response body
 */
export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Network error type for upload retries
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * API Client
 * Handles all API calls to the backend
 */
export class ApiClient {
  private readonly guestToken?: string;
  private readonly adminToken?: string;

  constructor(guestToken?: string, adminToken?: string) {
    this.guestToken = guestToken;
    this.adminToken = adminToken;
  }

  /**
   * Create a client with guest token
   */
  static withGuestToken(token: string): ApiClient {
    return new ApiClient(token, undefined);
  }

  /**
   * Create a client with admin token
   */
  static withAdminToken(token: string): ApiClient {
    return new ApiClient(undefined, token);
  }

  /**
   * Create a client without authentication
   */
  static anonymous(): ApiClient {
    return new ApiClient(undefined, undefined);
  }

  /**
   * Get authorization header if token is set
   */
  private getAuthHeader(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.adminToken) {
      headers.Authorization = `Basic ${btoa(`admin:${this.adminToken}`)}`;
    } else if (this.guestToken) {
      headers.Authorization = `Basic ${btoa(`guest:${this.guestToken}`)}`;
    }
    return headers;
  }

  /**
   * Handle API response and parse JSON or blob
   */
  private async handleResponse<T>(response: Response, returnBlob = false): Promise<T> {
    if (response.status === 429) {
      throw new ApiError(i18n.t("Errors.rateLimited"), response.status);
    }
    if (returnBlob) {
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: "Request failed" }));
        const message = (errorBody as ApiErrorResponse).message || "Request failed";
        throw new ApiError(message, response.status, errorBody);
      }
      return (await response.blob()) as T;
    }

    const data = await response.json();
    if (!response.ok) {
      const message = (data as ApiErrorResponse).message || "Request failed";
      throw new ApiError(message, response.status, data);
    }
    return data as T;
  }

  /**
   * Get event information
   * Requires guest access if event is secured
   * @throws Error if event doesn't exist (404)
   * @throws Error if authentication fails (403, 401) or other error
   */
  async getEvent(eventId: string): Promise<EventInfo> {
    const response = await fetch(`${apiBase}/api/events/${encodeURIComponent(eventId)}`, {
      headers: this.getAuthHeader(),
    });

    if (response.status === 404) {
      // throw new Error("Event not found.");
    }

    return this.handleResponse<EventInfo>(response);
  }

  /**
   * Check if subdomain is available
   * Returns null if available, ProjectInfo if taken
   */
  async checkSubdomainAvailability(subdomain: string): Promise<boolean> {
    const response = await fetch(`${apiBase}/api/events/${encodeURIComponent(subdomain)}`, {
      headers: this.getAuthHeader(),
    });
    return response.status === 404;
  }

  /**
   * Create a new event
   */
  async createEvent(request: CreateEventRequest): Promise<CreateEventResponse> {
    const response = await fetch(`${apiBase}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeader(),
      },
      body: JSON.stringify(request),
    });

    return this.handleResponse<CreateEventResponse>(response);
  }

  /**
   * Delete an event
   * Requires admin access
   */
  async deleteEvent(eventId: string): Promise<DeleteEventResponse> {
    const response = await fetch(`${apiBase}/api/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: this.getAuthHeader(),
    });

    return this.handleResponse<DeleteEventResponse>(response);
  }

  /**
   * Update an event's configuration
   * Requires admin access
   */
  async updateEvent(eventId: string, request: UpdateEventRequest): Promise<UpdateEventResponse> {
    const response = await fetch(`${apiBase}/api/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeader(),
      },
      body: JSON.stringify(request),
    });

    return this.handleResponse<UpdateEventResponse>(response);
  }

  /**
   * List files of an event
   * Requires admin access or guest access
   */
  async listFiles(eventId: string, request?: ListFilesRequest): Promise<ListFilesResponse> {
    const params = new URLSearchParams();
    if (request?.folder) {
      params.set("folder", request.folder);
    }
    const queryString = params.toString() ? `?${params.toString()}` : "";

    const response = await fetch(
      `${apiBase}/api/events/${encodeURIComponent(eventId)}/files${queryString}`,
      {
        headers: this.getAuthHeader(),
      }
    );

    return this.handleResponse<ListFilesResponse>(response);
  }

  /**
   * Upload files to an event
   * Requires guest access if event is secured
   */
  async uploadFiles(eventId: string, request: UploadFilesRequest): Promise<UploadFilesResponse> {
    const formData = new FormData();
    request.files.forEach((file) => formData.append("files", file));
    if (request.from) {
      formData.append("from", request.from);
    }

    const response = await fetch(`${apiBase}/api/events/${encodeURIComponent(eventId)}/files`, {
      method: "POST",
      headers: this.getAuthHeader(),
      body: formData,
    });

    return this.handleResponse<UploadFilesResponse>(response);
  }

  /**
   * Upload a single file with progress tracking
   */
  async uploadFile(
    eventId: string,
    request: {
      file: File;
      from?: string;
      onProgress?: (progress: { loaded: number; total: number }) => void;
      signal?: AbortSignal;
    }
  ): Promise<UploadFilesResponse> {
    const formData = new FormData();
    formData.append("files", request.file);
    if (request.from) {
      formData.append("from", request.from);
    }

    return new Promise<UploadFilesResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${apiBase}/api/events/${encodeURIComponent(eventId)}/files`);

      const headers = this.getAuthHeader();
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.responseType = "json";

      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable ? event.total : request.file.size;
        request.onProgress?.({ loaded: event.loaded, total });
      };

      xhr.onload = () => {
        const status = xhr.status;
        const response = xhr.response ?? {};
        if (status >= 200 && status < 300) {
          resolve(response as UploadFilesResponse);
          return;
        }
        const message =
          status === 429
            ? i18n.t("Errors.rateLimited")
            : (response as ApiErrorResponse).message || "Request failed";
        reject(new ApiError(message, status, response));
      };

      xhr.onerror = () => {
        reject(new NetworkError("Network error while uploading."));
      };

      xhr.ontimeout = () => {
        reject(new NetworkError("Upload timed out."));
      };

      if (request.signal) {
        request.signal.addEventListener("abort", () => {
          xhr.abort();
          reject(new NetworkError("Upload aborted."));
        });
      }

      xhr.send(formData);
    });
  }

  /**
   * Download a file from an event
   * Requires admin access or guest access
   */
  async downloadFile(eventId: string, request: DownloadFileRequest): Promise<Blob> {
    const folderPath = request.folder ? `/${encodeURIComponent(request.folder)}` : "";
    const response = await fetch(
      `${apiBase}/api/events/${encodeURIComponent(eventId)}/files${folderPath}/${encodeURIComponent(request.filename)}`,
      { headers: this.getAuthHeader() }
    );

    return this.handleResponse<Blob>(response, true);
  }

  /**
   * Download a preview image from an event
   * Requires admin access or guest access
   */
  async downloadPreview(eventId: string, request: PreviewFileRequest): Promise<Blob> {
    const params = new URLSearchParams();
    if (request.width) {
      params.set("w", String(request.width));
    }
    if (request.height) {
      params.set("h", String(request.height));
    }
    if (request.quality) {
      params.set("q", String(request.quality));
    }
    if (request.fit) {
      params.set("fit", request.fit);
    }
    if (request.format) {
      params.set("format", request.format);
    }
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const folderSegment = request.folder ? `/${encodeURIComponent(request.folder)}` : "";

    const response = await fetch(
      `${apiBase}/api/events/${encodeURIComponent(eventId)}/files${folderSegment}/${encodeURIComponent(request.filename)}/preview${queryString}`,
      {
        headers: this.getAuthHeader(),
      }
    );

    return this.handleResponse<Blob>(response, true);
  }

  /**
   * Delete a file from an event
   * Requires admin access
   */
  async deleteFile(eventId: string, request: DeleteFileRequest): Promise<DeleteFileResponse> {
    const folderSegment = request.folder ? `/${encodeURIComponent(request.folder)}` : "";
    const response = await fetch(
      `${apiBase}/api/events/${encodeURIComponent(eventId)}/files${folderSegment}/${encodeURIComponent(request.filename)}`,
      {
        method: "DELETE",
        headers: this.getAuthHeader(),
      }
    );

    return this.handleResponse<DeleteFileResponse>(response);
  }

  /**
   * Rename a folder in the event
   * Requires admin access
   */
  async renameFolder(eventId: string, request: RenameFolderRequest): Promise<RenameFolderResponse> {
    const response = await fetch(
      `${apiBase}/api/events/${encodeURIComponent(eventId)}/folders/${encodeURIComponent(request.folder)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...this.getAuthHeader(),
        },
        body: JSON.stringify({ to: request.to }),
      }
    );

    return this.handleResponse<RenameFolderResponse>(response);
  }

  /**
   * Download all files as a ZIP archive
   * Requires admin access or guest access
   */
  async downloadZip(eventId: string, folder?: string): Promise<Blob> {
    const params = new URLSearchParams();
    if (folder) {
      params.set("folder", folder);
    }
    const queryString = params.toString() ? `?${params.toString()}` : "";

    const response = await fetch(
      `${apiBase}/api/events/${encodeURIComponent(eventId)}/files.zip${queryString}`,
      {
        headers: this.getAuthHeader(),
      }
    );

    return this.handleResponse<Blob>(response, true);
  }

  /**
   * Get global app configuration
   */
  async getAppConfig(): Promise<AppConfigResponse> {
    const response = await fetch(`${apiBase}/api/config`, {
      headers: this.getAuthHeader(),
    });

    return this.handleResponse<AppConfigResponse>(response);
  }
}
