import express, { NextFunction, Response } from "express";
import { ALLOWED_DOMAINS, SUPPORT_SUBDOMAIN, ALLOW_EVENT_CREATION } from "../config.js";
import type { AppConfigResponse, ErrorResponse } from "../types.js";

export const registerAppConfigRoutes = (app: express.Application) => {
  app.get(
    "/api/config",
    async (
      _req: express.Request,
      res: Response<AppConfigResponse | ErrorResponse>,
      next: NextFunction
    ) => {
      try {
        return res.status(200).json({
          allowedDomains: ALLOWED_DOMAINS || [],
          supportSubdomain: Boolean(SUPPORT_SUBDOMAIN),
          allowEventCreation: Boolean(ALLOW_EVENT_CREATION),
        });
      } catch (error) {
        next(error);
      }
    }
  );
};
