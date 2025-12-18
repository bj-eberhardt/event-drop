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
      return res
        .status(404)
        .header("X-Domain", DOMAIN)
        .json({ message: "Event not found.", errorKey: "EVENT_NOT_FOUND", additionalParams: {} });
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
        return res.status(500).json({
          message: "Event context missing.",
          errorKey: "EVENT_CONTEXT_MISSING",
          additionalParams: {},
        });
      }

      const credentials: AuthCredentials = parseBasicAuth(req);

      const adminAllowed = allowedUsers.includes("admin");
      const guestAllowed = allowedUsers.includes("guest");

      if (adminAllowed) {
        if (await hasAdminAccess(req, event, credentials)) {
          req.user = { role: "admin" };
          return next();
        } else if (credentials.user == "admin") {
          return res.status(401).json({
            message: "Authorization required.",
            errorKey: "AUTHORIZATION_REQUIRED",
            eventId: event.eventId,
            additionalParams: {},
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
        return res.status(401).json({
          message: "Authorization required.",
          errorKey: "AUTHORIZATION_REQUIRED",
          eventId: event.eventId,
          additionalParams: {},
        });
      }

      return res.status(403).json({
        message: "Authorization required.",
        errorKey: "AUTHORIZATION_REQUIRED",
        eventId: event.eventId,
        additionalParams: {},
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
    return res.status(500).json({
      message: "Event context missing.",
      errorKey: "EVENT_CONTEXT_MISSING",
      additionalParams: {},
    });
  }

  if (req.user?.role === "guest") {
    const guestDownloadsEnabled =
      event.settings.allowGuestDownload && Boolean(event.auth.guestPasswordHash);
    if (!guestDownloadsEnabled) {
      return res.status(403).json({
        message: "Guest downloads require a set guest password.",
        errorKey: "GUEST_DOWNLOADS_DISABLED",
        eventId: event.eventId,
        additionalParams: {},
      });
    }
  }

  return next();
};
