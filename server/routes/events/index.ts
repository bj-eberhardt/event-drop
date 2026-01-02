import express from "express";
import { registerConfigRoutes } from "./config-routes.js";
import { registerFileRoutes } from "./file-routes.js";
import { registerPreviewRoutes } from "./preview-routes.js";

export const registerEventRoutes = (app: express.Application) => {
  const router = express.Router();

  registerConfigRoutes(router);

  registerPreviewRoutes(router);
  registerFileRoutes(router);

  app.use("/api/events", router);
};
