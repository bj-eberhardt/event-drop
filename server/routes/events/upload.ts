import multer from "multer";
import { UPLOAD_MAX_FILE_SIZE_BYTES, UPLOAD_TEMP_PATH } from "../../config.js";
import { randomUUID } from "crypto";
import fs from "node:fs";
import path from "node:path";
import { ValidatedReq } from "./validators.js";
import { logger } from "../../logger.js";

const uploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const eventId = (req.params as { eventId?: string }).eventId || "";
    try {
      const target = path.join(UPLOAD_TEMP_PATH, eventId);
      fs.mkdirSync(target, { recursive: true });
      cb(null, target);
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: (req, file, cb) => {
    cb(null, randomUUID());
  },
});

const multerOptions: multer.Options = { storage: uploadStorage };

if (UPLOAD_MAX_FILE_SIZE_BYTES > 0) {
  multerOptions.limits = { fileSize: UPLOAD_MAX_FILE_SIZE_BYTES };
}

export const upload = multer(multerOptions);

export async function cleanupUploadedFiles(files: Express.Multer.File[]): Promise<void> {
  const uploads = Array.isArray(files) ? files : [];
  for (const file of uploads) {
    try {
      const filePath = file.path;
      if (typeof filePath === "string" && filePath) {
        logger.debug("Cleanup uploaded temporary file: " + filePath);
        await fs.promises.unlink(filePath).catch(() => {});
      }
    } catch {
      // ignore errors during cleanup
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export async function cleanupUploadedFilesFromRequest(req: ValidatedReq<{}>): Promise<void> {
  const uploads = Array.isArray(req.files) ? req.files : [];
  logger.info(`Cleaning up request upload data... files=${uploads.length}`);
  await cleanupUploadedFiles(uploads);
}
