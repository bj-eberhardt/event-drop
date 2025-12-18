import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT || 8080);
export const DATA_ROOT_PATH = process.env.DATA_ROOT_PATH || "/data/events";
export const MAIN_DOMAIN =
  process.env.MAIN_DOMAIN || process.env.VITE_MAIN_DOMAIN || "event-upload.test";
export const SUBDOMAIN_REGEX = /^[-a-z0-9]+$/i;
export const FOLDER_REGEX = /^[A-Za-z0-9 ]+$/;
export const DIST_PATH = path.resolve(__dirname, "../dist");
export const JSON_LIMIT = process.env.JSON_LIMIT || "5mb";
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
export const UPLOAD_MAX_FILE_SIZE_BYTES = Number(
  process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 0,
);
export const UPLOAD_MAX_TOTAL_SIZE_BYTES = Number(
  process.env.UPLOAD_MAX_TOTAL_SIZE_BYTES || 0,
);

export type LogLevel = "silent" | "error" | "info" | "debug";

export const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

