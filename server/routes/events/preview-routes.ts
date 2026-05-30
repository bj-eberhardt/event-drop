import express, { NextFunction, Response } from "express";
import sharp from "sharp";
import heicConvert from "heic-convert";
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
      const isHeic = /\.(heic|heif)$/i.test(filename);

      const fileResult = await storage.files.getFileBuffer(
        req.params.eventId,
        folderValue || "",
        filename
      );
      if (!fileResult.ok) {
        return sendStorageError(res, fileResult.error);
      }

      try {
        const renderWithSharp = async (input: Buffer): Promise<Buffer> => {
          let pipeline = sharp(input).rotate();
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
          } else if (format === "webp") {
            pipeline = pipeline.webp({ quality: req.query.q ?? 80 });
          } else {
            pipeline = pipeline.png();
          }

          return pipeline.toBuffer();
        };

        // Reject non-images early to preserve the expected 415 behavior.
        const meta = await sharp(fileResult.data.buffer)
          .metadata()
          .catch(() => null);
        if (!meta?.format) {
          return sendError(res, 415, {
            message: "Preview not available for this file type.",
            errorKey: "UNSUPPORTED_FILE_TYPE",
            property: "filename",
          });
        }

        let buffer: Buffer;
        try {
          buffer = await renderWithSharp(fileResult.data.buffer);
        } catch (error) {
          if (!isHeic) throw error;

          const converted = await heicConvert({
            // heic-convert accepts Buffer at runtime (it is a Uint8Array),
            // but its published types are stricter than the implementation.
            buffer: fileResult.data.buffer as unknown as ArrayBufferLike,
            format: "PNG",
            quality: 1,
          });
          buffer = await renderWithSharp(Buffer.from(converted));
        }

        if (format === "jpeg") res.type("image/jpeg");
        else if (format === "webp") res.type("image/webp");
        else res.type("image/png");

        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.status(200).send(buffer);
      } catch (err) {
        logger.error(
          "Error generating preview for file",
          { eventId: req.params.eventId, folder: folderValue, filename },
          err
        );
        const status = isHeic ? 415 : 400;
        return sendError(res, status, {
          message: "Preview not available for this file.",
          errorKey: status === 415 ? "UNSUPPORTED_FILE_TYPE" : "INVALID_INPUT",
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
