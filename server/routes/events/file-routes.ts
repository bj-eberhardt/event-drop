import express, { NextFunction, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { DATA_ROOT_PATH } from "../../config.js";
import { FILES_DIR_NAME } from "../../constants.js";
import { createZipArchive, filesDir, listFiles, moveUploadedFiles } from "../../services/files.js";
import { parseFolder, isSafeFilename } from "../../utils/validation.js";
import { ensureGuestDownloadsEnabled, loadEvent, verifyAccess } from "./middleware.js";
import { upload, cleanupUploadedFilesFromRequest, cleanupUploadedFiles } from "./upload.js";
import {
  eventFileInFolderParamsSchema,
  eventFileParamsSchema,
  eventIdSchema,
  uploadFilesBodySchema,
  validateRequest,
  ValidatedReq,
} from "./validators.js";
import { DeleteFileResult, ErrorResponse, FileEntry } from "../../types.js";

export const registerFileRoutes = (router: express.Router) => {
  router.get(
    "/:eventId/files",
    validateRequest({ params: eventIdSchema }, { errorKey: "INVALID_EVENT_ID" }),
    loadEvent,
    verifyAccess(["admin", "guest"]),
    ensureGuestDownloadsEnabled,
    async (
      req: ValidatedReq<{
        params: typeof eventIdSchema;
      }>,
      res: Response<{ files: FileEntry[]; folders: string[]; folder: string } | ErrorResponse>,
      next: NextFunction
    ) => {
      try {
        const folder = parseFolder((req.query.folder as string) || "");
        if (folder === null) {
          return res.status(400).json({
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
            additionalParams: {},
          });
        }

        const event = req.event!;

        const dir = filesDir(event.eventId, folder);
        const { files, folders } = await listFiles(dir);

        res.status(200).json({ files, folders, folder: folder || "" });
      } catch (error) {
        next(error);
      }
    }
  );

  //eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const addFileUploadCleanupHook = (req: ValidatedReq<{}>, res: Response, next: NextFunction) => {
    const onFinish = async () => {
      try {
        // If final status is not 200, remove any temporary uploaded files
        if (res.statusCode !== 200) {
          await cleanupUploadedFilesFromRequest(req).catch(() => {});
        }
      } finally {
        res.removeListener("finish", onFinish);
      }
    };
    res.once("finish", onFinish);
    next();
  };

  const ensureFileUploadsClearedOnError = (
    err: unknown,
    req: ValidatedReq<{
      body: typeof uploadFilesBodySchema;
    }>,
    res: Response,
    next: NextFunction
  ) => {
    (async () => {
      try {
        await cleanupUploadedFilesFromRequest(req).catch(() => {});
      } finally {
        // forward to the next error handler
        next(err);
      }
    })();
  };
  router.post(
    "/:eventId/files",
    validateRequest(
      {
        params: eventIdSchema,
        body: uploadFilesBodySchema,
      },
      { errorKey: { params: "INVALID_EVENT_ID", body: "INVALID_INPUT" } }
    ),
    loadEvent,
    verifyAccess(["admin", "guest"]),

    addFileUploadCleanupHook,
    upload.array("files"),
    validateRequest(
      {
        body: uploadFilesBodySchema,
      },
      { errorKey: "INVALID_INPUT" }
    ),
    async (
      req: ValidatedReq<{
        params: typeof eventIdSchema;
        body: typeof uploadFilesBodySchema;
      }>,
      res: Response<
        | {
            message: string;
            uploaded: number;
            rejected?: { file: string; reason: string }[];
          }
        | ErrorResponse
      >,
      next: NextFunction
    ) => {
      try {
        const folder = parseFolder(req.body.from || "");
        if (folder === null) {
          return res.status(400).json({
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "from",
            additionalParams: {},
          });
        }

        const project = req.event!;

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
        const rejectedFiles = uploads.filter((file) => !matchesMime(file.mimetype || ""));

        // the rejected files are removed from the upload folder
        await cleanupUploadedFiles(rejectedFiles).catch(() => {});

        await moveUploadedFiles(project.eventId, folder, accepted);

        return res.status(200).json({
          message: "Files uploaded successfully.",
          uploaded: accepted.length,
          rejected: rejectedFiles.map((file) => ({
            file: file.originalname,
            reason: "File type not allowed.",
          })),
        });
      } catch (error) {
        next(error);
      }
    },
    // route-level error handler: cleans up uploaded files and forwards the error
    ensureFileUploadsClearedOnError
  );

  router.get(
    "/:eventId/files/:filename",
    validateRequest(
      { params: eventFileParamsSchema },
      {
        errorKey: ({ part, issue, defaultKey }) => {
          if (part !== "params") return defaultKey;
          const field = issue.path[0];
          if (field === "eventId") return "INVALID_EVENT_ID";
          if (field === "filename") return "INVALID_FILENAME";
          return defaultKey;
        },
      }
    ),
    loadEvent,
    verifyAccess(["admin", "guest"]),
    ensureGuestDownloadsEnabled,
    async (
      req: ValidatedReq<{ params: typeof eventFileParamsSchema }>,
      res: Response<ErrorResponse | Buffer>,
      next: NextFunction
    ) => {
      try {
        const folder = parseFolder((req.query.folder as string) || "");
        if (folder === null) {
          return res.status(400).json({
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
            additionalParams: {},
          });
        }

        const filename = req.params.filename || "";
        if (!isSafeFilename(filename)) {
          return res.status(400).json({
            message: "Invalid file name.",
            errorKey: "INVALID_FILENAME",
            property: "filename",
            additionalParams: {},
          });
        }

        const filePath = path.resolve(
          DATA_ROOT_PATH,
          req.params.eventId,
          FILES_DIR_NAME,
          folder || "",
          filename
        );
        try {
          const stats = await fs.promises.stat(filePath);
          if (!stats.isFile()) {
            return res.status(404).json({
              message: "File not found.",
              errorKey: "FILE_NOT_FOUND",
              property: "filename",
              additionalParams: {},
            });
          }
        } catch (error) {
          const err = error as NodeJS.ErrnoException;
          if (err?.code === "ENOENT") {
            return res.status(404).json({
              message: "File not found.",
              errorKey: "FILE_NOT_FOUND",
              property: "filename",
              additionalParams: {},
            });
          }
          throw error;
        }
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.sendFile(filePath);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/:eventId/files/:folder/:filename",
    validateRequest(
      { params: eventFileInFolderParamsSchema },
      {
        errorKey: ({ part, issue, defaultKey }) => {
          if (part !== "params") return defaultKey;
          const field = issue.path[0];
          if (field === "eventId") return "INVALID_EVENT_ID";
          if (field === "folder") return "INVALID_FOLDER";
          if (field === "filename") return "INVALID_FILENAME";
          return defaultKey;
        },
      }
    ),
    loadEvent,
    verifyAccess(["admin", "guest"]),
    ensureGuestDownloadsEnabled,
    async (
      req: ValidatedReq<{ params: typeof eventFileInFolderParamsSchema }>,
      res: Response<ErrorResponse | void>,
      next: NextFunction
    ) => {
      try {
        const folder = parseFolder(req.params.folder || "");
        if (!folder) {
          return res.status(400).json({
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
            additionalParams: {},
          });
        }

        const filename = req.params.filename || "";
        if (!isSafeFilename(filename)) {
          return res.status(400).json({
            message: "Invalid file name.",
            errorKey: "INVALID_FILENAME",
            property: "filename",
            additionalParams: {},
          });
        }

        const filePath = path.resolve(
          DATA_ROOT_PATH,
          req.params.eventId,
          FILES_DIR_NAME,
          folder,
          filename
        );
        try {
          const stats = await fs.promises.stat(filePath);
          if (!stats.isFile()) {
            return res.status(404).json({
              message: "File not found.",
              errorKey: "FILE_NOT_FOUND",
              property: "filename",
              additionalParams: {},
            });
          }
        } catch (error) {
          const err = error as NodeJS.ErrnoException;
          if (err?.code === "ENOENT") {
            return res.status(404).json({
              message: "File not found.",
              errorKey: "FILE_NOT_FOUND",
              property: "filename",
              additionalParams: {},
            });
          }
          throw error;
        }

        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.sendFile(filePath);
      } catch (error) {
        next(error);
      }
    }
  );

  const deleteFileAtPath = async (
    filePath: string,
    res: Response<DeleteFileResult | ErrorResponse>
  ) => {
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        return res.status(404).json({
          message: "File not found.",
          errorKey: "FILE_NOT_FOUND",
          property: "filename",
          additionalParams: {},
        });
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") {
        return res.status(404).json({
          message: "File not found.",
          errorKey: "FILE_NOT_FOUND",
          property: "filename",
          additionalParams: {},
        });
      }
      throw error;
    }

    await fs.promises.unlink(filePath);
    return res.status(200).json({ ok: true, message: "File deleted." });
  };

  router.delete(
    "/:eventId/files/:folder/:filename",
    validateRequest(
      { params: eventFileInFolderParamsSchema },
      {
        errorKey: ({ part, issue, defaultKey }) => {
          if (part !== "params") return defaultKey;
          const field = issue.path[0];
          if (field === "eventId") return "INVALID_EVENT_ID";
          if (field === "folder") return "INVALID_FOLDER";
          if (field === "filename") return "INVALID_FILENAME";
          return defaultKey;
        },
      }
    ),
    loadEvent,
    verifyAccess(["admin"]),
    async (
      req: ValidatedReq<{ params: typeof eventFileInFolderParamsSchema }>,
      res: Response<DeleteFileResult | ErrorResponse>,
      next: NextFunction
    ) => {
      try {
        const folder = parseFolder(req.params.folder || "");
        if (!folder) {
          return res.status(400).json({
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
            additionalParams: {},
          });
        }

        const filename = req.params.filename || "";
        if (filename.includes("..")) {
          return res.status(400).json({
            message: "Invalid file name.",
            errorKey: "INVALID_FILENAME",
            property: "filename",
            additionalParams: {},
          });
        }

        const filePath = path.resolve(
          DATA_ROOT_PATH,
          req.params.eventId,
          FILES_DIR_NAME,
          folder,
          filename
        );
        return await deleteFileAtPath(filePath, res);
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    "/:eventId/files/:filename",
    validateRequest(
      { params: eventFileParamsSchema },
      {
        errorKey: ({ part, issue, defaultKey }) => {
          if (part !== "params") return defaultKey;
          const field = issue.path[0];
          if (field === "eventId") return "INVALID_EVENT_ID";
          if (field === "filename") return "INVALID_FILENAME";
          return defaultKey;
        },
      }
    ),
    loadEvent,
    verifyAccess(["admin"]),
    async (
      req: ValidatedReq<{ params: typeof eventFileParamsSchema }>,
      res: Response<DeleteFileResult | ErrorResponse>,
      next: NextFunction
    ) => {
      try {
        const folder = parseFolder((req.query.folder as string) || "");
        if (folder === null) {
          return res.status(400).json({
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
            additionalParams: {},
          });
        }

        const filename = req.params.filename || "";
        if (filename.includes("..")) {
          return res.status(400).json({
            message: "Invalid file name.",
            errorKey: "INVALID_FILENAME",
            property: "filename",
            additionalParams: {},
          });
        }

        const filePath = path.resolve(
          DATA_ROOT_PATH,
          req.params.eventId,
          FILES_DIR_NAME,
          folder || "",
          filename
        );
        return await deleteFileAtPath(filePath, res);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/:eventId/files.zip",
    validateRequest({ params: eventIdSchema }, { errorKey: "INVALID_EVENT_ID" }),
    loadEvent,
    verifyAccess(["admin", "guest"]),
    ensureGuestDownloadsEnabled,
    async (
      req: ValidatedReq<{ params: typeof eventIdSchema }>,
      res: Response<ErrorResponse | void>,
      next: NextFunction
    ) => {
      try {
        const folder = parseFolder((req.query.folder as string) || "");
        if (folder === null) {
          return res.status(400).json({
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
            additionalParams: {},
          });
        }

        const dir = filesDir(req.params.eventId, folder);
        if (!fs.existsSync(dir)) {
          return res.status(404).json({
            message: "No files available.",
            errorKey: "NO_FILES_AVAILABLE",
            property: "folder",
            additionalParams: {},
          });
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${req.params.eventId}-files.zip"`
        );
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");

        const archive = createZipArchive(dir);
        archive.on("error", (err: Error) => next(err));
        archive.pipe(res);
        await archive.finalize();
      } catch (error) {
        next(error);
      }
    }
  );
};
