import express, { NextFunction, Response } from "express";
import sharp from "sharp";
import { ensureGuestDownloadsEnabled, loadEvent, verifyAccess } from "./middleware.js";
import {
  eventFileInFolderParamsSchema,
  eventFileParamsSchema,
  validateRequest,
  ValidatedReq,
  previewQuerySchema,
} from "./validators.js";
import { ErrorResponse } from "../../types.js";
import { logger } from "../../logger.js";
import { storage } from "../../storage/index.js";
import { sendStorageError } from "./storage-response.js";
import { sendError } from "../../utils/error-response.js";

export const registerPreviewRoutes = (router: express.Router) => {
  const handlePreview = async (
    req: ValidatedReq<{
      params: typeof eventFileParamsSchema | typeof eventFileInFolderParamsSchema;
      query: typeof previewQuerySchema;
    }>,
    res: Response<ErrorResponse | Buffer>,
    next: NextFunction,
    folderValue: string
  ) => {
    try {
      const filename = req.params.filename;
      const width = req.query.w;
      const height = req.query.h;
      const fit = req.query.fit;
      const format = req.query.format ?? "jpeg";

      const lowerName = filename.toLowerCase();
      const isImage =
        lowerName.endsWith(".jpg") ||
        lowerName.endsWith(".jpeg") ||
        lowerName.endsWith(".png") ||
        lowerName.endsWith(".webp");

      if (!isImage) {
        return sendError(res, 415, {
          message: "Preview not available for this file type.",
          errorKey: "UNSUPPORTED_FILE_TYPE",
          property: "filename",
        });
      }

      const fileResult = await storage.files.getFileBuffer(
        req.params.eventId,
        folderValue || "",
        filename
      );
      if (!fileResult.ok) {
        return sendStorageError(res, fileResult.error);
      }

      try {
        let pipeline = sharp(fileResult.data.buffer).rotate();
        if (width || height) {
          pipeline = pipeline.resize({
            width: width ?? undefined,
            height: height ?? undefined,
            fit: fit ?? "inside",
            withoutEnlargement: true,
          });
        }

        if (format === "jpeg") {
          pipeline = pipeline.jpeg({ quality: req.query.q ?? 80 });
          res.type("image/jpeg");
        } else if (format === "webp") {
          pipeline = pipeline.webp({ quality: req.query.q ?? 80 });
          res.type("image/webp");
        } else {
          pipeline = pipeline.png();
          res.type("image/png");
        }

        const buffer = await pipeline.toBuffer();
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.status(200).send(buffer);
      } catch (err) {
        logger.error(
          "Error generating preview for file",
          { eventId: req.params.eventId, folder: folderValue, filename },
          err
        );
        return sendError(res, 400, {
          message: "Preview not available for this file.",
          errorKey: "INVALID_INPUT",
          property: "filename",
        });
      }
    } catch (error) {
      next(error);
    }
  };

  router.get(
    "/:eventId/files/:filename/preview",
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
    validateRequest({ query: previewQuerySchema }, { errorKey: "INVALID_INPUT" }),
    verifyAccess(["admin", "guest"]),
    ensureGuestDownloadsEnabled,
    async (
      req: ValidatedReq<{ params: typeof eventFileParamsSchema }>,
      res: Response<ErrorResponse | Buffer>,
      next: NextFunction
    ) => {
      await handlePreview(req, res, next, "");
    }
  );

  router.get(
    "/:eventId/files/:folder/:filename/preview",
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
    validateRequest({ query: previewQuerySchema }, { errorKey: "INVALID_INPUT" }),
    verifyAccess(["admin", "guest"]),
    ensureGuestDownloadsEnabled,
    async (
      req: ValidatedReq<{ params: typeof eventFileInFolderParamsSchema }>,
      res: Response<ErrorResponse | Buffer>,
      next: NextFunction
    ) => {
      await handlePreview(req, res, next, req.params.folder || "");
    }
  );
};
