import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { createEventSchema, isSafeFilename, parseFolder, updateEventSchema } from "../utils/validation.js";
import {
  createEventConfig,
  deleteEvent,
  findUniqueName,
  getEvent,
  isEventIdAvailable,
  saveEvent,
} from "../services/projects.js";
import { requireAdminAccess, requireGuestAccess } from "../services/auth.js";
import {
  createZipArchive,
  ensureFilesDir,
  filesDir,
  listFiles,
  moveUploadedFiles,
} from "../services/files.js";
import {
  DATA_ROOT_PATH,
  UPLOAD_MAX_FILE_SIZE_BYTES,
  UPLOAD_MAX_TOTAL_SIZE_BYTES,
} from "../config.js";
import { FILES_DIR_NAME } from "../constants.js";
import {EventConfig, EventConfigResponse} from "../types.js";

const uploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const eventId = (req.params as { eventId?: string }).eventId || "";
    try {
      const target = ensureFilesDir(eventId);
      cb(null, target);
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[/\\]/g, "_");
    const dest = (file as any).destination || "";
    const candidate = findUniqueName(dest, safeName);
    cb(null, candidate);
  },
});

const multerOptions: multer.Options = { storage: uploadStorage };

if (UPLOAD_MAX_FILE_SIZE_BYTES > 0) {
  multerOptions.limits = { fileSize: UPLOAD_MAX_FILE_SIZE_BYTES };
}

const upload = multer(multerOptions);

const validateEventId = (eventId: string) =>
  createEventSchema.shape.eventId.safeParse(eventId.trim().toLowerCase());

const buildEventResponse = (event: EventConfig): EventConfigResponse => {
  const secured = Boolean(event.auth.guestPasswordHash);
  const allowGuestDownload = Boolean(event.settings.allowGuestDownload && secured);
  return {
    eventId: event.eventId,
    allowedMimeTypes: event.allowedMimeTypes || [],
    name: event.name,
    description: event.description || "",
    secured,
    allowGuestDownload,
    uploadMaxFileSizeBytes: UPLOAD_MAX_FILE_SIZE_BYTES,
    uploadMaxTotalSizeBytes: UPLOAD_MAX_TOTAL_SIZE_BYTES,
    createdAt: event.createdAt,
  };
};

export const registerEventRoutes = (app: express.Application) => {
  const router = express.Router();

  /**
   * Get the project configuration (guest or admin access)
   */
  router.get("/:eventId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = validateEventId(req.params.eventId || "");
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0].message,
          errorKey: "INVALID_EVENT_ID",
        });
      }

      const event = await getEvent(parsed.data);
      if (!event) {
        return res
          .status(404)
          .json({ message: "Event nicht gefunden.", errorKey: "EVENT_NOT_FOUND" });
      }

      const adminAccess = await requireAdminAccess(req, event);
      if (!adminAccess.allowed) {
        const guestAccess = await requireGuestAccess(req, event);
        if (!guestAccess.allowed) {
          return res.status(403).json({
            message: guestAccess.errorMessage,
            errorKey: "GUEST_ACCESS_REQUIRED",
            secured: true,
            eventId: event.eventId,
          });
        }
      }

      return res.status(200).json(buildEventResponse(event));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Create a new event
   */
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createEventSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || "Ungueltige Eingabe.";
        return res.status(400).json({ message, errorKey: "INVALID_INPUT" });
      }

      const {
        name,
        description,
        eventId,
        guestPassword,
        adminPassword,
        adminPasswordConfirm,
        allowedMimeTypes,
      } = parsed.data;

      if (adminPassword !== adminPasswordConfirm) {
        return res
          .status(400)
          .json({
            message: "Admin-Passwoerter muessen uebereinstimmen.",
            errorKey: "INVALID_INPUT",
          });
      }

      if (guestPassword && guestPassword.length < 4) {
        return res
          .status(400)
          .json({
            message: "Gaeste-Passwort muss mindestens 4 Zeichen haben.",
            errorKey: "INVALID_INPUT",
          });
      }

      const existing = await getEvent(eventId);
      const available = await isEventIdAvailable(eventId);
      if (existing || !available) {
        return res
          .status(409)
          .json({ message: "Event-ID ist bereits vergeben.", errorKey: "EVENT_ID_TAKEN" });
      }

      const event = await createEventConfig({
        name,
        description,
        eventId,
        guestPassword,
        adminPassword,
        allowedMimeTypes,
      });

      await saveEvent(event);
      res.status(200).json(buildEventResponse(event));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Update event configuration (admin only)
   */
  router.patch("/:eventId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateEventSchema.safeParse(req.body || {});
      if (!body.success) {
        const message = body.error.errors[0]?.message || "Ungueltige Eingabe.";
        return res.status(400).json({ message, errorKey: "INVALID_INPUT" });
      }

      const parsed = validateEventId(req.params.eventId || "");
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0].message,
          errorKey: "INVALID_EVENT_ID",
        });
      }

      const project = await getEvent(parsed.data);
      if (!project) {
        return res
          .status(404)
          .json({ message: "Event nicht gefunden.", errorKey: "EVENT_NOT_FOUND" });
      }

      const authCheck = await requireAdminAccess(req, project);
      if (!authCheck.allowed) {
        return res.status(403).json({
          message: authCheck.errorMessage,
          errorKey: "ADMIN_ACCESS_REQUIRED",
          eventId: project.eventId,
        });
      }

      const { guestPassword, allowGuestDownload, name, description, allowedMimeTypes } = body.data;
      const updated = {
        ...project,
        settings: { ...project.settings },
        auth: { ...project.auth },
      };

      if (name !== undefined) {
        updated.name = name.trim();
      }
      if (description !== undefined) {
        updated.description = description.trim();
      }

      if (guestPassword !== undefined) {
        if (guestPassword === "") {
          updated.auth.guestPasswordHash = null;
          updated.settings.allowGuestDownload = false;
        } else {
          updated.auth.guestPasswordHash = await bcrypt.hash(guestPassword, 10);
        }
      }

      if (allowGuestDownload !== undefined) {
        if (allowGuestDownload && !updated.auth.guestPasswordHash) {
          return res.status(400).json({
            message: "Gaeste-Downloads erfordern ein gesetztes Gaeste-Passwort.",
            errorKey: "INVALID_INPUT",
          });
        }
        updated.settings.allowGuestDownload = Boolean(allowGuestDownload);
      }

      if (allowedMimeTypes !== undefined) {
        updated.allowedMimeTypes = allowedMimeTypes.map((m) => m.trim());
      }

      await saveEvent(updated);

      return res.status(200).json({ ok: true, ...buildEventResponse(updated) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Remove an event
   */
  router.delete("/:eventId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = validateEventId(req.params.eventId || "");
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0].message,
          errorKey: "INVALID_EVENT_ID",
        });
      }

      const project = await getEvent(parsed.data);
      if (!project) {
        return res
          .status(404)
          .json({ message: "Projekt nicht gefunden.", errorKey: "EVENT_NOT_FOUND" });
      }

      const authCheck = await requireAdminAccess(req, project);
      if (!authCheck.allowed) {
        return res.status(403).json({
          message: authCheck.errorMessage,
          errorKey: "ADMIN_ACCESS_REQUIRED",
          eventId: project.eventId,
        });
      }

      await deleteEvent(parsed.data);
      res.status(200).json({ message: "Event erfolgreich gelöscht.", ok: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Get the files from an event
   */
  router.get(
    "/:eventId/files",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const folder = parseFolder((req.query.folder as string) || "");
        if (folder === null) {
          return res.status(400).json({ message: "Ungültiger Ordnername.", errorKey: "INVALID_FOLDER" });
        }

        const parsed = validateEventId(req.params.eventId || "");
        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.errors[0].message,
            errorKey: "INVALID_EVENT_ID",
          });
        }

        const event = await getEvent(parsed.data);
        if (!event) {
          return res
            .status(404)
            .json({ message: "Event nicht gefunden.", errorKey: "EVENT_NOT_FOUND" });
        }

        const guestDownloadsEnabled =
          event.settings.allowGuestDownload && Boolean(event.auth.guestPasswordHash);
        const authCheck = await requireAdminAccess(req, event);
        if (!authCheck.allowed) {
          if (!guestDownloadsEnabled) {
            return res.status(403).json({
              message: authCheck.errorMessage,
              errorKey: "ADMIN_ACCESS_REQUIRED",
              eventId: event.eventId,
            });
          }

          const guestAccess = await requireGuestAccess(req, event);
          if (!guestAccess.allowed) {
            return res.status(403).json({
              message: guestAccess.errorMessage,
              errorKey: "GUEST_ACCESS_REQUIRED",
              secured: true,
              eventId: event.eventId,
            });
          }
        }

        const dir = filesDir(parsed.data, folder);
        const { files, folders } = await listFiles(dir);

        res.status(200).json({ files, folders, folder: folder || "" });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Upload file(s) to an event
   */
  router.post(
    "/:eventId/files",
    upload.array("files"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const folder = parseFolder((req.body?.from as string) || "");
        if (folder === null) {
          return res.status(400).json({ message: "Ungültiger Ordnername.", errorKey: "INVALID_FOLDER" });
        }

        const parsed = validateEventId(req.params.eventId || "");
        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.errors[0].message,
            errorKey: "INVALID_EVENT_ID",
          });
        }

        const project = await getEvent(parsed.data);
        if (!project) {
          return res
            .status(404)
            .json({ message: "Projekt nicht gefunden.", errorKey: "EVENT_NOT_FOUND" });
        }

        const authCheck = await requireGuestAccess(req, project);
        if (!authCheck.allowed) {
          return res.status(403).json({
            message: authCheck.errorMessage,
            errorKey: "GUEST_ACCESS_REQUIRED",
            secured: true,
            eventId: project.eventId,
          });
        }

        const uploads = Array.isArray(req.files) ? req.files : [];
        const allowed = project.allowedMimeTypes || [];
        const matchesMime = (mime: string) => {
          if (!allowed.length) return true;
          return allowed.some((allowedType) => {
            if (!allowedType.includes("*")) return mime === allowedType;
            const [allowedMain] = allowedType.split("/");
            const [main] = mime.split("/");
            return allowedMain && allowedMain === main;
          });
        };

        const accepted = uploads.filter((file) => matchesMime(file.mimetype || ""));
        const rejected = uploads
          .filter((file) => !matchesMime(file.mimetype || ""))
          .map((file) => ({
            file: file.originalname,
            reason: "Dateityp nicht erlaubt.",
          }));

        await moveUploadedFiles(parsed.data, folder, accepted, findUniqueName);

        res.status(200).json({
          message: "Dateien erfolgreich hochgeladen.",
          uploaded: accepted.length,
          rejected,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Download a file from an event
   */
  router.get(
    "/:eventId/files/:filename",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const folder = parseFolder((req.query.folder as string) || "");
        if (folder === null) {
          return res.status(400).json({ message: "Ungültiger Ordnername.", errorKey: "INVALID_FOLDER" });
        }

        const parsed = validateEventId(req.params.eventId || "");
        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.errors[0].message,
            errorKey: "INVALID_EVENT_ID",
          });
        }

        const filename = req.params.filename || "";
        if (!isSafeFilename(filename)) {
          return res.status(400).json({ message: "Ungültiger Dateiname.", errorKey: "INVALID_FILENAME" });
        }

        const event = await getEvent(parsed.data);
        if (!event) {
          return res
            .status(404)
            .json({ message: "Projekt nicht gefunden.", errorKey: "EVENT_NOT_FOUND" });
        }

        const guestDownloadsEnabled =
          event.settings.allowGuestDownload && Boolean(event.auth.guestPasswordHash);
        const authCheck = await requireAdminAccess(req, event);
        if (!authCheck.allowed) {
          if (!guestDownloadsEnabled) {
            return res.status(403).json({
              message: authCheck.errorMessage,
              errorKey: "ADMIN_ACCESS_REQUIRED",
              eventId: event.eventId,
            });
          }

          const guestAccess = await requireGuestAccess(req, event);
          if (!guestAccess.allowed) {
            return res.status(403).json({
              message: guestAccess.errorMessage,
              errorKey: "GUEST_ACCESS_REQUIRED",
              secured: true,
              eventId: event.eventId,
            });
          }
        }

        const filePath = path.resolve(
          DATA_ROOT_PATH,
          parsed.data,
          FILES_DIR_NAME,
          folder || "",
          filename,
        );
        return res.sendFile(filePath);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Download all files from an event as a zip file
   */
  router.get(
    "/:eventId/files.zip",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const folder = parseFolder((req.query.folder as string) || "");
        if (folder === null) {
          return res.status(400).json({ message: "Ungültiger Ordnername.", errorKey: "INVALID_FOLDER" });
        }

        const parsed = validateEventId(req.params.eventId || "");
        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.errors[0].message,
            errorKey: "INVALID_EVENT_ID",
          });
        }

        const event = await getEvent(parsed.data);
        if (!event) {
          return res
            .status(404)
            .json({ message: "Event nicht gefunden.", errorKey: "EVENT_NOT_FOUND" });
        }

        const guestDownloadsEnabled =
          event.settings.allowGuestDownload && Boolean(event.auth.guestPasswordHash);
        const authCheck = await requireAdminAccess(req, event);
        if (!authCheck.allowed) {
          if (!guestDownloadsEnabled) {
            return res.status(403).json({
              message: authCheck.errorMessage,
              errorKey: "ADMIN_ACCESS_REQUIRED",
              eventId: event.eventId,
            });
          }

          const guestAccess = await requireGuestAccess(req, event);
          if (!guestAccess.allowed) {
            return res.status(403).json({
              message: guestAccess.errorMessage,
              errorKey: "GUEST_ACCESS_REQUIRED",
              secured: true,
              eventId: event.eventId,
            });
          }
        }

        const dir = filesDir(parsed.data, folder);
        if (!fs.existsSync(dir)) {
          return res
            .status(404)
            .json({ message: "Keine Dateien vorhanden.", errorKey: "NO_FILES_AVAILABLE" });
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${parsed.data}-files.zip"`,
        );

        const archive = createZipArchive(dir);
        archive.on("error", (err: Error) => next(err));
        archive.pipe(res);
        await archive.finalize();
      } catch (error) {
        next(error);
      }
    },
  );

  app.use("/api/events", router);
};
