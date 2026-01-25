import { RequestHandler, Response } from "express";
import {
  AllowedUserRole,
  AuthCredentials,
  hasAdminAccess,
  hasGuestAccess,
  parseBasicAuth,
} from "../../services/auth.js";
import { getEvent } from "../../services/events.js";
import { ErrorResponse, EventConfig } from "../../types.js";
import { DOMAIN } from "../../config.js";
import { isAuthBlocked, recordAuthFailure } from "../../services/auth-rate-limit.js";
import { sendError } from "../../utils/error-response.js";

declare module "express-serve-static-core" {
  interface Request {
    event?: EventConfig;
    user?: { role: AllowedUserRole };
  }
}

type EventRequest = RequestHandler<{ eventId?: string }, ErrorResponse>;

export const loadEvent: EventRequest = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const event = eventId ? await getEvent(eventId) : null;
    if (!event) {
      res.header("X-Domain", DOMAIN);
      return sendError(res, 404, { message: "Event not found.", errorKey: "EVENT_NOT_FOUND" });
    }
    req.event = event;
    next();
  } catch (error) {
    next(error);
  }
};

export const verifyAccess = (
  allowedUsers: AllowedUserRole[]
): RequestHandler<{ eventId?: string }, ErrorResponse> => {
  return async (req, res: Response<ErrorResponse>, next) => {
    try {
      const event = req.event;
      if (!event) {
        return sendError(res, 500, {
          message: "Event context missing.",
          errorKey: "EVENT_CONTEXT_MISSING",
        });
      }

      const credentials: AuthCredentials = parseBasicAuth(req);
      const hasAuthHeader = Boolean(req.headers.authorization);
      if (hasAuthHeader && credentials.user) {
        const blocked = isAuthBlocked(req, event.eventId, credentials.user);
        if (blocked.blocked) {
          res.setHeader("Retry-After", String(blocked.retryAfter));
          return sendError(res, 429, {
            message: "Too many failed authentication attempts. Please wait and try again.",
            errorKey: "RATE_LIMITED",
            eventId: event.eventId,
            additionalParams: { retryAfterSeconds: blocked.retryAfter },
          });
        }
      }

      const adminAllowed = allowedUsers.includes("admin");
      const guestAllowed = allowedUsers.includes("guest");

      if (adminAllowed) {
        if (await hasAdminAccess(req, event, credentials)) {
          req.user = { role: "admin" };
          return next();
        } else if (credentials.user == "admin") {
          if (hasAuthHeader) {
            recordAuthFailure(req, event.eventId, "admin");
          }
          return sendError(res, 401, {
            message: "Authorization required.",
            errorKey: "AUTHORIZATION_REQUIRED",
            eventId: event.eventId,
          });
        }
      }

      if (guestAllowed) {
        if (await hasGuestAccess(req, event, credentials)) {
          req.user = { role: "guest" };
          return next();
        }
      }

      if (!credentials.user || !credentials.password) {
        return sendError(res, 401, {
          message: "Authorization required.",
          errorKey: "AUTHORIZATION_REQUIRED",
          eventId: event.eventId,
        });
      }

      if (hasAuthHeader && credentials.user) {
        recordAuthFailure(req, event.eventId, credentials.user);
      }

      return sendError(res, 403, {
        message: "Authorization required.",
        errorKey: "AUTHORIZATION_REQUIRED",
        eventId: event.eventId,
      });
    } catch (error) {
      next(error);
    }
  };
};

export const ensureGuestDownloadsEnabled: RequestHandler<{ eventId?: string }, ErrorResponse> = (
  req,
  res,
  next
) => {
  const event = req.event;
  if (!event) {
    return sendError(res, 500, {
      message: "Event context missing.",
      errorKey: "EVENT_CONTEXT_MISSING",
    });
  }

  if (req.user?.role === "guest") {
    const guestDownloadsEnabled =
      event.settings.allowGuestDownload && Boolean(event.auth.guestPasswordHash);
    if (!guestDownloadsEnabled) {
      return sendError(res, 403, {
        message: "Guest downloads require a set guest password.",
        errorKey: "GUEST_DOWNLOADS_DISABLED",
        eventId: event.eventId,
      });
    }
  }

  return next();
};

export const ensureGuestUploadsEnabled: RequestHandler<{ eventId?: string }, ErrorResponse> = (
  req,
  res,
  next
) => {
  const event = req.event;
  if (!event) {
    return sendError(res, 500, {
      message: "Event context missing.",
      errorKey: "EVENT_CONTEXT_MISSING",
    });
  }

  if (req.user?.role === "guest") {
    const guestUploadsEnabled = event.settings.allowGuestUpload ?? true;
    if (!guestUploadsEnabled) {
      return sendError(res, 403, {
        message: "Guest uploads are disabled.",
        errorKey: "GUEST_UPLOADS_DISABLED",
        eventId: event.eventId,
      });
    }
  }

  return next();
};

export const ensureUploadFolderRequired: RequestHandler<{ eventId?: string }, ErrorResponse> = (
  req,
  res,
  next
) => {
  const event = req.event;
  if (!event) {
    return sendError(res, 500, {
      message: "Event context missing.",
      errorKey: "EVENT_CONTEXT_MISSING",
    });
  }

  if (event.settings.requireUploadFolder) {
    const rawFolder = typeof req.body?.from === "string" ? req.body.from.trim() : "";
    if (!rawFolder) {
      return sendError(res, 400, {
        message: "Upload folder is required.",
        errorKey: "UPLOAD_FOLDER_REQUIRED",
        property: "from",
      });
    }
  }

  return next();
};
