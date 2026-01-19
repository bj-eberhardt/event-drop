import type { Response } from "express";
import type { ErrorAdditionalParams, ErrorKey, ErrorResponse } from "../types.js";

type ErrorPayload = {
  message: string;
  errorKey: ErrorKey;
  property?: string;
  additionalParams?: ErrorAdditionalParams;
  eventId?: string;
};

export const buildErrorResponse = (payload: ErrorPayload): ErrorResponse => ({
  ...payload,
  additionalParams: payload.additionalParams ?? {},
});

export const sendError = (res: Response, status: number, payload: ErrorPayload) =>
  res.status(status).type("application/json").json(buildErrorResponse(payload));
