import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { createEventSchema, updateEventSchema } from "./utils/validation.js";
import { eventIdSchema } from "./routes/events/validators.js";
import { FOLDER_REGEX } from "./config.js";
import { MAX_PREVIEW_SIZE } from "./constants.js";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const ProjectResponseSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  eventId: z.string(),
  allowedMimeTypes: z.array(z.string()),
  secured: z.boolean(),
  allowGuestDownload: z.boolean(),
  allowGuestUpload: z.boolean(),
  requireUploadFolder: z.boolean(),
  uploadFolderHint: z.string().nullable(),
  accessLevel: z.enum(["unauthenticated", "guest", "admin"]),
  uploadMaxFileSizeBytes: z.number(),
  uploadMaxTotalSizeBytes: z.number(),
  createdAt: z.string().optional(),
});

const UpdateProjectResponseSchema = ProjectResponseSchema.extend({
  ok: z.boolean(),
});

const ErrorKeySchema = z.enum([
  "ADMIN_ACCESS_REQUIRED",
  "GUEST_ACCESS_REQUIRED",
  "GUEST_ACCESS_DISABLED",
  "UPLOAD_FOLDER_REQUIRED",
  "INVALID_FILENAME",
  "INVALID_FOLDER",
  "INVALID_INPUT",
  "INVALID_EVENT_ID",
  "FILE_NOT_FOUND",
  "FOLDER_ALREADY_EXISTS",
  "GUEST_UPLOADS_DISABLED",
  "NO_FILES_AVAILABLE",
  "UNSUPPORTED_FILE_TYPE",
  "EVENT_ID_TAKEN",
  "EVENT_NOT_FOUND",
  "EVENT_CONTEXT_MISSING",
  "AUTHORIZATION_REQUIRED",
  "GUEST_DOWNLOADS_DISABLED",
  "EVENT_CREATION_DISABLED",
  "RATE_LIMITED",
]);

const ErrorResponseSchema = z.object({
  message: z.string(),
  errorKey: ErrorKeySchema,
  additionalParams: z.record(z.union([z.string(), z.number(), z.boolean()])),
  property: z.string().optional(),
  secured: z.boolean().optional(),
  eventId: z.string().optional(),
});

const DeleteProjectResponseSchema = z.object({
  message: z.string(),
  ok: z.boolean(),
});

const FileEntrySchema = z.object({
  name: z.string(),
  size: z.number(),
  createdAt: z.string(),
});

const ListFilesResponseSchema = z.object({
  files: z.array(FileEntrySchema),
  folders: z.array(z.string()),
  folder: z.string(),
});

const UploadRejectSchema = z.object({
  file: z.string(),
  reason: z.string(),
});

const UploadResponseSchema = z.object({
  message: z.string(),
  uploaded: z.number(),
  rejected: z.array(UploadRejectSchema).optional(),
});

const DeleteFileResponseSchema = z.object({
  message: z.string(),
});

const RenameFolderResponseSchema = z.object({
  success: z.boolean(),
});

const AppConfigResponseSchema = z.object({
  allowedDomains: z.array(z.string()),
  supportSubdomain: z.boolean(),
  allowEventCreation: z.boolean(),
});

const EventIdParamSchema = eventIdSchema;

const FileParamSchema = EventIdParamSchema.extend({
  filename: z.string().min(1),
});

const FolderedFileParamSchema = EventIdParamSchema.extend({
  folder: z.string().regex(FOLDER_REGEX, "Invalid folder"),
  filename: z.string().min(1),
});

const FolderQuerySchema = z.object({
  folder: z.string().regex(FOLDER_REGEX, "Invalid folder").optional(),
});

const PreviewQuerySchema = z.object({
  w: z.coerce.number().int().positive().max(MAX_PREVIEW_SIZE).optional(),
  h: z.coerce.number().int().positive().optional(),
  q: z.coerce.number().int().min(1).max(100).optional(),
  fit: z.enum(["inside", "cover"]).optional(),
  format: z.enum(["jpeg", "webp", "png"]).optional(),
});

const FileUploadSchema = z.any().openapi({ type: "string", format: "binary" });
const UploadRequestSchema = z.object({
  files: z.array(FileUploadSchema),
  from: z.string().optional(),
});

const RenameFolderRequestSchema = z.object({
  to: z.string().regex(FOLDER_REGEX, "Invalid folder"),
});

const BinaryResponseSchema = z.string().openapi({ type: "string", format: "binary" });

registry.registerPath({
  method: "get",
  path: "/api/config",
  responses: {
    200: {
      description: "App configuration",
      content: { "application/json": { schema: AppConfigResponseSchema } },
    },
    500: {
      description: "Server error",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/events/{eventId}",
  request: { params: EventIdParamSchema },
  responses: {
    200: {
      description: "Event info",
      content: { "application/json": { schema: ProjectResponseSchema } },
    },
    400: {
      description: "Invalid event id",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/events",
  request: {
    body: {
      content: {
        "application/json": { schema: createEventSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Event created",
      content: { "application/json": { schema: ProjectResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "Event id taken",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/events/{eventId}",
  request: {
    params: EventIdParamSchema,
    body: {
      content: {
        "application/json": { schema: updateEventSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Event updated",
      content: { "application/json": { schema: UpdateProjectResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/events/{eventId}",
  request: { params: EventIdParamSchema },
  responses: {
    200: {
      description: "Event deleted",
      content: { "application/json": { schema: DeleteProjectResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/events/{eventId}/files",
  request: {
    params: EventIdParamSchema,
    query: FolderQuerySchema,
  },
  responses: {
    200: {
      description: "List files",
      content: { "application/json": { schema: ListFilesResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/events/{eventId}/files",
  request: {
    params: EventIdParamSchema,
    body: {
      content: {
        "multipart/form-data": { schema: UploadRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Files uploaded",
      content: { "application/json": { schema: UploadResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/events/{eventId}/folders/{folder}",
  request: {
    params: EventIdParamSchema.extend({
      folder: z.string().regex(FOLDER_REGEX, "Invalid folder"),
    }),
    body: {
      content: {
        "application/json": { schema: RenameFolderRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Folder renamed",
      content: { "application/json": { schema: RenameFolderResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "Folder already exists",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/events/{eventId}/files/{filename}",
  request: {
    params: FileParamSchema,
    query: FolderQuerySchema,
  },
  responses: {
    200: {
      description: "File download",
      content: { "application/octet-stream": { schema: BinaryResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/events/{eventId}/files/{filename}/preview",
  request: {
    params: FileParamSchema,
    query: PreviewQuerySchema,
  },
  responses: {
    200: {
      description: "Preview image",
      content: {
        "image/jpeg": { schema: BinaryResponseSchema },
        "image/webp": { schema: BinaryResponseSchema },
        "image/png": { schema: BinaryResponseSchema },
      },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    415: {
      description: "Unsupported file type",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/events/{eventId}/files/{folder}/{filename}/preview",
  request: {
    params: FileParamSchema.extend({ folder: z.string() }),
    query: PreviewQuerySchema,
  },
  responses: {
    200: {
      description: "Preview image",
      content: {
        "image/jpeg": { schema: BinaryResponseSchema },
        "image/webp": { schema: BinaryResponseSchema },
        "image/png": { schema: BinaryResponseSchema },
      },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    415: {
      description: "Unsupported file type",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/events/{eventId}/files/{folder}/{filename}",
  request: {
    params: FolderedFileParamSchema,
  },
  responses: {
    200: {
      description: "File download",
      content: { "application/octet-stream": { schema: BinaryResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/events/{eventId}/files/{filename}",
  request: {
    params: FileParamSchema,
    query: FolderQuerySchema,
  },
  responses: {
    200: {
      description: "File deleted",
      content: { "application/json": { schema: DeleteFileResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/events/{eventId}/files/{folder}/{filename}",
  request: {
    params: FolderedFileParamSchema,
  },
  responses: {
    200: {
      description: "File deleted",
      content: { "application/json": { schema: DeleteFileResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/events/{eventId}/files.zip",
  request: {
    params: EventIdParamSchema,
    query: FolderQuerySchema,
  },
  responses: {
    200: {
      description: "Zip download",
      content: { "application/zip": { schema: BinaryResponseSchema } },
    },
    400: {
      description: "Invalid input",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Authorization required",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Access denied",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const createOpenApiDocument = () => {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "Party Upload API",
      version: "1.0.0",
    },
  });
};
