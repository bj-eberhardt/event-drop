import type { Response } from "express";
import type { ErrorKey, ErrorResponse } from "../../types.js";

const STATUS_BY_ERROR_KEY: Partial<Record<ErrorKey, number>> = {
  INVALID_EVENT_ID: 400,
  INVALID_FILENAME: 400,
  INVALID_FOLDER: 400,
  INVALID_INPUT: 400,
  EVENT_ID_TAKEN: 409,
  EVENT_NOT_FOUND: 404,
  FILE_NOT_FOUND: 404,
  NO_FILES_AVAILABLE: 404,
  UNSUPPORTED_FILE_TYPE: 415,
  RATE_LIMITED: 429,
};

export const statusForStorageError = (error: ErrorResponse) =>
  STATUS_BY_ERROR_KEY[error.errorKey] ?? 400;

export const sendStorageError = (res: Response, error: ErrorResponse) =>
  res.status(statusForStorageError(error)).json(error);
