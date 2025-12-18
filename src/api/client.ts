import { apiBase } from "../constants";
import type {
  ApiErrorResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  DownloadFileRequest,
  ListFilesRequest,
  ListFilesResponse,
  ProjectInfo,
  UpdateProjectRequest,
  UpdateProjectResponse,
  UploadFilesRequest,
  UploadFilesResponse,
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
 * API Client Builder
 * Allows configuring guestToken or adminToken for authentication
 */
export class ApiClientBuilder {
  private guestToken?: string;
  private adminToken?: string;

  /**
   * Set the guest token for authentication
   */
  withGuestToken(token: string): this {
    this.guestToken = token;
    this.adminToken = undefined; // Only one token type at a time
    return this;
  }

  /**
   * Set the admin token for authentication
   */
  withAdminToken(token: string): this {
    this.adminToken = token;
    this.guestToken = undefined; // Only one token type at a time
    return this;
  }

  /**
   * Build the API client with the configured tokens
   */
  build(): ApiClient {
    return new ApiClient(this.guestToken, this.adminToken);
  }
}

/**
 * API Client
 * Handles all API calls to the backend
 */
export class ApiClient {
  private guestToken?: string;
  private adminToken?: string;

  constructor(guestToken?: string, adminToken?: string) {
    this.guestToken = guestToken;
    this.adminToken = adminToken;
  }

  /**
   * Create a new builder instance
   */
  static builder(): ApiClientBuilder {
    return new ApiClientBuilder();
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
  private async handleResponse<T>(
    response: Response,
    returnBlob = false,
  ): Promise<T> {
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
   * Get project information
   * Requires guest access if project is secured
   * @throws Error with message "Projekt nicht gefunden." if project doesn't exist (404)
   * @throws Error with message from API if authentication fails (403) or other error
   */
  async getProject(eventId: string): Promise<ProjectInfo> {
    const response = await fetch(`${apiBase}/api/events/${encodeURIComponent(eventId)}`, {
      headers: this.getAuthHeader(),
    });

    if (response.status === 404) {
      throw new Error("Projekt nicht gefunden.");
    }

    return this.handleResponse<ProjectInfo>(response);
  }

  /**
   * Check if subdomain is available
   * Returns null if available, ProjectInfo if taken
   */
  async checkSubdomainAvailability(subdomain: string): Promise<ProjectInfo | null> {
    const response = await fetch(`${apiBase}/api/events/${encodeURIComponent(subdomain)}`, {
      headers: this.getAuthHeader(),
    });

    if (response.status === 404) {
      return null; // Available
    }

    if (response.ok) {
      return this.handleResponse<ProjectInfo>(response);
    }

    // Error case
    const error = await response.json();
    throw new Error((error as ApiErrorResponse).message || "Prüfung fehlgeschlagen.");
  }

  /**
   * Create a new project
   */
  async createProject(request: CreateProjectRequest): Promise<CreateProjectResponse> {
    const response = await fetch(`${apiBase}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeader(),
      },
      body: JSON.stringify(request),
    });

    return this.handleResponse<CreateProjectResponse>(response);
  }

  /**
   * Delete a project
   * Requires admin access
   */
  async deleteProject(eventId: string): Promise<DeleteProjectResponse> {
    const response = await fetch(`${apiBase}/api/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: this.getAuthHeader(),
    });

    return this.handleResponse<DeleteProjectResponse>(response);
  }

  /**
   * Update a project configuration
   * Requires admin access
   */
  async updateProject(
    eventId: string,
    request: UpdateProjectRequest,
  ): Promise<UpdateProjectResponse> {
    const response = await fetch(`${apiBase}/api/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeader(),
      },
      body: JSON.stringify(request),
    });

    return this.handleResponse<UpdateProjectResponse>(response);
  }

  /**
   * List files in a project
   * Requires admin access
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
      },
    );

    return this.handleResponse<ListFilesResponse>(response);
  }

  /**
   * Upload files to a project
   * Requires guest access if project is secured
   */
  async uploadFiles(eventId: string, request: UploadFilesRequest): Promise<UploadFilesResponse> {
    const formData = new FormData();
    request.files.forEach((file) => formData.append("files", file));
    if (request.from) {
      formData.append("from", request.from);
    }

    const response = await fetch(
      `${apiBase}/api/events/${encodeURIComponent(eventId)}/files`,
      {
        method: "POST",
        headers: this.getAuthHeader(),
        body: formData,
      },
    );

    return this.handleResponse<UploadFilesResponse>(response);
  }

  /**
   * Download a file from a project
   * Requires admin access
   */
  async downloadFile(eventId: string, request: DownloadFileRequest): Promise<Blob> {
    const params = new URLSearchParams();
    if (request.folder) {
      params.set("folder", request.folder);
    }
    const queryString = params.toString() ? `?${params.toString()}` : "";

    const response = await fetch(
      `${apiBase}/api/events/${encodeURIComponent(eventId)}/files/${encodeURIComponent(request.filename)}${queryString}`,
      {
        headers: this.getAuthHeader(),
      },
    );

    return this.handleResponse<Blob>(response, true);
  }

  /**
   * Download all files as a ZIP archive
   * Requires admin access
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
      },
    );

    return this.handleResponse<Blob>(response, true);
  }
}
