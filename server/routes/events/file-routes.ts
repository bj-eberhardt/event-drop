import express, { NextFunction, Response } from "express";
import path from "node:path";
import { storage } from "../../storage/index.js";
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
import { sendStorageError } from "./storage-response.js";
import { sendError } from "../../utils/error-response.js";

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
          return sendError(res, 400, {
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
          });
        }

        const event = req.event!;

        const listResult = await storage.files.listFiles(event.eventId, folder);
        if (!listResult.ok) {
          return sendStorageError(res, listResult.error);
        }
        const { files, folders } = listResult.data;

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
          return sendError(res, 400, {
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "from",
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

        const moveResult = await storage.files.moveUploadedFiles(project.eventId, folder, accepted);
        if (!moveResult.ok) {
          return sendStorageError(res, moveResult.error);
        }

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
          return sendError(res, 400, {
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
          });
        }

        const filename = req.params.filename || "";
        if (!isSafeFilename(filename)) {
          return sendError(res, 400, {
            message: "Invalid file name.",
            errorKey: "INVALID_FILENAME",
            property: "filename",
          });
        }

        const fileResult = await storage.files.getFileStream(
          req.params.eventId,
          folder || "",
          filename
        );
        if (!fileResult.ok) {
          return sendStorageError(res, fileResult.error);
        }
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.type(path.extname(filename));
        fileResult.data.stream.on("error", (err) => next(err));
        fileResult.data.stream.pipe(res);
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
          return sendError(res, 400, {
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
          });
        }

        const filename = req.params.filename || "";
        if (!isSafeFilename(filename)) {
          return sendError(res, 400, {
            message: "Invalid file name.",
            errorKey: "INVALID_FILENAME",
            property: "filename",
          });
        }

        const fileResult = await storage.files.getFileStream(req.params.eventId, folder, filename);
        if (!fileResult.ok) {
          return sendStorageError(res, fileResult.error);
        }

        res.setHeader("Cache-Control", "public, max-age=86400");
        res.type(path.extname(filename));
        fileResult.data.stream.on("error", (err) => next(err));
        fileResult.data.stream.pipe(res);
      } catch (error) {
        next(error);
      }
    }
  );

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
          return sendError(res, 400, {
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
          });
        }

        const filename = req.params.filename || "";
        if (filename.includes("..")) {
          return sendError(res, 400, {
            message: "Invalid file name.",
            errorKey: "INVALID_FILENAME",
            property: "filename",
          });
        }

        const deleteResult = await storage.files.deleteFile(req.params.eventId, folder, filename);
        if (!deleteResult.ok) {
          return sendStorageError(res, deleteResult.error);
        }
        return res.status(200).json(deleteResult.data);
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
          return sendError(res, 400, {
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
          });
        }

        const filename = req.params.filename || "";
        if (filename.includes("..")) {
          return sendError(res, 400, {
            message: "Invalid file name.",
            errorKey: "INVALID_FILENAME",
            property: "filename",
          });
        }

        const deleteResult = await storage.files.deleteFile(
          req.params.eventId,
          folder || "",
          filename
        );
        if (!deleteResult.ok) {
          return sendStorageError(res, deleteResult.error);
        }
        return res.status(200).json(deleteResult.data);
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
          return sendError(res, 400, {
            message: "Invalid folder name.",
            errorKey: "INVALID_FOLDER",
            property: "folder",
          });
        }

        const zipResult = await storage.files.createZipStream(req.params.eventId, folder);
        if (!zipResult.ok) {
          return sendStorageError(res, zipResult.error);
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

        const archive = zipResult.data.stream;
        archive.on("error", (err: Error) => next(err));
        archive.pipe(res);
        await archive.finalize();
      } catch (error) {
        next(error);
      }
    }
  );
};
