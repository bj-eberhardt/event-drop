import express from "express";
import { registerConfigRoutes } from "./config-routes.js";
import { registerFileRoutes } from "./file-routes.js";

export const registerEventRoutes = (app: express.Application) => {
  const router = express.Router();

  registerConfigRoutes(router);
  registerFileRoutes(router);

  app.use("/api/events", router);
};
