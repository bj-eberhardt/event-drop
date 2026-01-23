import { z } from "zod";
import { FOLDER_REGEX, EVENT_REGEX, NOT_ALLOWED_EVENTNAMES_REGEX } from "../config.js";
import { ErrorAdditionalParams, ErrorKey } from "../types.js";

const MIME_TYPE_REGEX = /^[\w.+-]+\/[\w.+*%-]+$/i;

export type ValidationAdditionalParams = ErrorAdditionalParams;

export const buildValidationError = (
  issue: z.ZodIssue | undefined,
  fallbackErrorKey: ErrorKey = "INVALID_INPUT"
): {
  message: string;
  errorKey: ErrorKey;
  additionalParams: ValidationAdditionalParams;
  property?: string;
} => {
  const additionalParams: ValidationAdditionalParams = {};
  if (issue?.code === z.ZodIssueCode.too_big && typeof issue.maximum === "number") {
    additionalParams.MAX_ALLOWED = issue.maximum;
  } else if (issue?.code === z.ZodIssueCode.too_small && typeof issue.minimum === "number") {
    additionalParams.MIN_REQUIRED = issue.minimum;
  }

  const issueErrorKey =
    issue && typeof issue === "object" && "errorKey" in issue
      ? (issue as { errorKey?: ErrorKey }).errorKey
      : undefined;

  return {
    message: issue?.message || "Invalid input.",
    errorKey: issueErrorKey || fallbackErrorKey,
    additionalParams,
    property: Array.isArray(issue?.path) && issue.path.length ? issue.path.join(".") : undefined,
  };
};

export const createEventSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required.")
    .max(48, "Project name can be at most 48 characters."),
  description: z
    .string()
    .trim()
    .max(2048, "Description can be at most 2048 characters.")
    .optional()
    .transform((value) => value || undefined),
  eventId: z
    .string()
    .trim()
    .min(3, "Event ID is required.")
    .max(32, "Event ID can be at most 32 characters.")
    .regex(EVENT_REGEX, "Only letters, numbers, and dashes are allowed.")
    .regex(NOT_ALLOWED_EVENTNAMES_REGEX, "This event ID is not allowed.")
    .transform((value) => value.toLowerCase()),
  guestPassword: z
    .string()
    .optional()
    .transform((value) => value ?? ""),
  adminPassword: z.string().min(8, "Admin password must be at least 8 characters."),
  adminPasswordConfirm: z.string().min(8, "Admin password must be at least 8 characters."),
  allowedMimeTypes: z
    .array(z.string().trim().regex(MIME_TYPE_REGEX, "Invalid MIME type."))
    .optional()
    .default([]),
  allowGuestDownload: z.boolean().optional(),
  allowGuestUpload: z.boolean().optional(),
  requireUploadFolder: z.boolean().optional(),
  uploadFolderHint: z
    .string()
    .trim()
    .max(512, "Upload folder hint can be at most 512 characters.")
    .optional()
    .transform((value) => value || undefined),
});

export const updateEventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name is required.")
      .max(48, "Project name can be at most 48 characters.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(2048, "Description can be at most 2048 characters.")
      .optional()
      .transform((value) => (value === undefined ? undefined : value || "")),
    guestPassword: z
      .string()
      .optional()
      .transform((value) => (value === undefined ? undefined : value.trim())),
    allowGuestDownload: z.boolean().optional(),
    allowedMimeTypes: z
      .array(z.string().trim().regex(MIME_TYPE_REGEX, "Invalid MIME type."))
      .optional(),
    allowGuestUpload: z.boolean().optional(),
    requireUploadFolder: z.boolean().optional(),
    uploadFolderHint: z
      .string()
      .trim()
      .max(512, "Upload folder hint can be at most 512 characters.")
      .optional()
      .transform((value) => (value === undefined ? undefined : value || "")),
  })
  .superRefine((value, ctx) => {
    if (
      value.guestPassword === undefined &&
      value.allowGuestDownload === undefined &&
      value.name === undefined &&
      value.description === undefined &&
      value.allowedMimeTypes === undefined &&
      value.allowGuestUpload === undefined &&
      value.requireUploadFolder === undefined &&
      value.uploadFolderHint === undefined
    ) {
      // TODO translate
      /*ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No changes provided.",
      });*/
    }
    if (value.guestPassword && value.guestPassword.length > 0 && value.guestPassword.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 4,
        inclusive: true,
        type: "string",
        message: "Guest password must be at least 4 characters.",
        path: ["guestPassword"],
      });
    }
  });

export const parseFolder = (raw?: string | null): string | null => {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (!FOLDER_REGEX.test(value)) return null;
  return value;
};

export const isSafeFilename = (name: string) => !name.includes("/") && !name.includes("\\");
