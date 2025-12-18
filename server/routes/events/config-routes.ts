import express, { NextFunction, Response } from "express";
import bcrypt from "bcryptjs";
import { createEventSchema, updateEventSchema } from "../../utils/validation.js";
import {
  createEvent,
  deleteEvent,
  getEvent,
  isEventIdAvailable,
  saveEvent,
  EventAlreadyExistsError,
} from "../../services/events.js";
import { buildEventResponse } from "./response.js";
import { ALLOW_EVENT_CREATION } from "../../config.js";
import { loadEvent, verifyAccess } from "./middleware.js";
import { eventIdSchema, validateRequest, ValidatedReq } from "./validators.js";
import { ErrorResponse, EventConfigResponse } from "../../types.js";

export const registerConfigRoutes = (router: express.Router) => {
  router.get(
    "/:eventId",
    validateRequest({ params: eventIdSchema }, { errorKey: "INVALID_EVENT_ID" }),
    loadEvent,
    verifyAccess(["admin", "guest"]),
    async (
      req: ValidatedReq<{ params: typeof eventIdSchema }>,
      res: Response<EventConfigResponse | ErrorResponse>,
      next: NextFunction
    ) => {
      try {
        return res.status(200).json(buildEventResponse(req.event!));
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/",
    validateRequest({ body: createEventSchema }, { errorKey: "INVALID_INPUT" }),
    async (
      req: ValidatedReq<{ body: typeof createEventSchema }>,
      res: Response<EventConfigResponse | ErrorResponse>,
      next: NextFunction
    ) => {
      try {
        if (!ALLOW_EVENT_CREATION) {
          return res.status(403).json({
            message: "Event creation is disabled.",
            errorKey: "EVENT_CREATION_DISABLED",
            property: "eventId",
            additionalParams: {},
          });
        }
        const {
          name,
          description,
          eventId,
          guestPassword,
          adminPassword,
          adminPasswordConfirm,
          allowedMimeTypes,
          allowGuestDownload,
        } = req.body;

        if (adminPassword !== adminPasswordConfirm) {
          return res.status(400).json({
            message: "Admin passwords must match.",
            errorKey: "INVALID_INPUT",
            property: "adminPasswordConfirm",
            additionalParams: {},
          });
        }

        if (guestPassword && guestPassword.length < 4) {
          return res.status(400).json({
            message: "Guest password must be at least 4 characters.",
            errorKey: "INVALID_INPUT",
            property: "guestPassword",
            additionalParams: { MIN_REQUIRED: 4 },
          });
        }

        const existing = await getEvent(eventId);
        const available = await isEventIdAvailable(eventId);
        if (existing || !available) {
          return res.status(409).json({
            message: "Event ID is already taken.",
            errorKey: "EVENT_ID_TAKEN",
            property: "eventId",
            additionalParams: {},
          });
        }

        if (allowGuestDownload && (!guestPassword || guestPassword.length < 4)) {
          return res.status(400).json({
            message: "Guest downloads require a set guest password.",
            errorKey: "INVALID_INPUT",
            property: "allowGuestDownload",
            additionalParams: {},
          });
        }

        const event = await createEvent({
          name,
          description,
          eventId,
          guestPassword,
          adminPassword,
          allowedMimeTypes,
          allowGuestDownload: Boolean(allowGuestDownload),
        });

        return res.status(200).json(buildEventResponse(event));
      } catch (error) {
        if (error instanceof EventAlreadyExistsError) {
          return res.status(409).json({
            message: "Event ID is already taken.",
            errorKey: "EVENT_ID_TAKEN",
            property: "eventId",
            additionalParams: {},
          });
        }
        next(error);
      }
    }
  );

  router.patch(
    "/:eventId",
    validateRequest({ params: eventIdSchema }, { errorKey: "INVALID_EVENT_ID" }),
    validateRequest({ body: updateEventSchema }, { errorKey: "INVALID_INPUT" }),
    loadEvent,
    verifyAccess(["admin"]),
    async (
      req: ValidatedReq<{ params: typeof eventIdSchema; body: typeof updateEventSchema }>,
      res: Response<({ ok: true } & EventConfigResponse) | ErrorResponse>,
      next: NextFunction
    ) => {
      try {
        const project = req.event!;

        const { guestPassword, allowGuestDownload, name, description, allowedMimeTypes } = req.body;
        const updated = {
          ...project,
          settings: { ...project.settings },
          auth: { ...project.auth },
        };

        if (name !== undefined) {
          updated.name = name.trim();
        }
        if (description !== undefined) {
          updated.description = description.trim();
        }

        if (guestPassword !== undefined) {
          if (guestPassword === "") {
            updated.auth.guestPasswordHash = null;
            updated.settings.allowGuestDownload = false;
          } else {
            updated.auth.guestPasswordHash = await bcrypt.hash(guestPassword, 10);
          }
        }

        if (allowGuestDownload !== undefined) {
          if (allowGuestDownload && !updated.auth.guestPasswordHash) {
            return res.status(400).json({
              message: "Guest downloads require a set guest password.",
              errorKey: "INVALID_INPUT",
              property: "allowGuestDownload",
              additionalParams: {},
            });
          }
          updated.settings.allowGuestDownload = Boolean(allowGuestDownload);
        }

        if (allowedMimeTypes !== undefined) {
          updated.allowedMimeTypes = allowedMimeTypes.map((m) => m.trim());
        }

        await saveEvent(updated);

        return res.status(200).json({ ok: true, ...buildEventResponse(updated) });
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    "/:eventId",
    validateRequest({ params: eventIdSchema }, { errorKey: "INVALID_EVENT_ID" }),
    loadEvent,
    verifyAccess(["admin"]),
    async (
      req: ValidatedReq<{ params: typeof eventIdSchema }>,
      res: Response<{ message: string; ok: boolean } | ErrorResponse>,
      next: NextFunction
    ) => {
      try {
        const event = req.event!;

        await deleteEvent(event.eventId);
        return res.status(200).json({ message: "Event deleted successfully.", ok: true });
      } catch (error) {
        next(error);
      }
    }
  );
};
