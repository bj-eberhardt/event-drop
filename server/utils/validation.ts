import { z } from "zod";
import { FOLDER_REGEX, SUBDOMAIN_REGEX } from "../config.js";

const MIME_TYPE_REGEX = /^[\w.+-]+\/[\w.+*%-]+$/i;

export const createEventSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Projektname ist erforderlich.")
    .max(48, "Projektname darf maximal 48 Zeichen lang sein."),
  description: z
    .string()
    .trim()
    .max(2048, "Beschreibung darf maximal 2048 Zeichen lang sein.")
    .optional()
    .transform((value) => value || undefined),
  eventId: z
    .string()
    .trim()
    .min(3, "Event-ID ist erforderlich.")
    .max(32, "Event-ID darf maximal 32 Zeichen haben.")
    .regex(SUBDOMAIN_REGEX, "Nur Buchstaben, Zahlen und Bindestriche sind erlaubt.")
    .transform((value) => value.toLowerCase()),
  guestPassword: z.string().optional().transform((value) => value ?? ""),
  adminPassword: z.string().min(8, "Admin-Passwort muss mindestens 8 Zeichen haben."),
  adminPasswordConfirm: z
    .string()
    .min(8, "Admin-Passwort muss mindestens 8 Zeichen haben."),
  allowedMimeTypes: z
    .array(
      z
        .string()
        .trim()
        .regex(MIME_TYPE_REGEX, "Ungültiger MIME-Type."),
    )
    .optional()
    .default([]),
});

export const updateEventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Projektname ist erforderlich.")
      .max(48, "Projektname darf maximal 48 Zeichen lang sein.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(2048, "Beschreibung darf maximal 2048 Zeichen lang sein.")
      .optional()
      .transform((value) => (value === undefined ? undefined : value || "")),
    guestPassword: z
      .string()
      .optional()
      .transform((value) => (value === undefined ? undefined : value.trim())),
    allowGuestDownload: z.boolean().optional(),
    allowedMimeTypes: z
      .array(
        z
          .string()
          .trim()
          .regex(MIME_TYPE_REGEX, "Ungültiger MIME-Type."),
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.guestPassword === undefined &&
      value.allowGuestDownload === undefined &&
      value.name === undefined &&
      value.description === undefined &&
      value.allowedMimeTypes === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Keine Aenderungen uebermittelt.",
      });
    }
    if (value.guestPassword && value.guestPassword.length > 0 && value.guestPassword.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 4,
        inclusive: true,
        type: "string",
        message: "Gaeste-Passwort muss mindestens 4 Zeichen haben.",
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
