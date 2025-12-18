import bcrypt from "bcryptjs";
import { AccessResult, EventConfig } from "../types.js";
import { Request } from "express";
import { logger } from "../logger.js";

const parseBasicAuth = (req: Request) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Basic ") ? authHeader.slice(6) : "";

  if (!token) {
    logger.debug("Basic auth missing", { path: req.path });
    return { user: "", password: "" };
  }

  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const [user, password] = decoded.split(":");
    return { user: user || "", password: password || "" };
  } catch (_error) {
    logger.debug("Failed to decode basic auth header", { path: req.path });
    return { user: "", password: "" };
  }
};

export const requireGuestAccess = async (
  req: Request,
  project: EventConfig,
): Promise<AccessResult> => {
  const secured = Boolean(project.auth.guestPasswordHash);
  if (!secured) return { allowed: true, secured: false };

  const { user, password } = parseBasicAuth(req);
  const passwordMatches =
    user === "guest" && password
      ? await bcrypt.compare(password, project.auth.guestPasswordHash || "")
      : false;

  if (!passwordMatches) {
    logger.debug("Guest access denied", {
      path: req.path,
      user,
      hasPassword: Boolean(password),
      subdomain: project.eventId,
    });
  }

  return {
    allowed: passwordMatches,
    secured: true,
    subdomain: project.eventId,
    errorMessage: "Gaeste-Passwort erforderlich oder ungueltig.",
  };
};

export const requireAdminAccess = async (
  req: Request,
  project: EventConfig,
): Promise<AccessResult> => {
  const { user, password } = parseBasicAuth(req);
  const passwordMatches =
    user === "admin" && password
      ? await bcrypt.compare(password, project.auth.adminPasswordHash || "")
      : false;

  if (!passwordMatches) {
    logger.debug("Admin access denied", {
      path: req.path,
      user,
      hasPassword: Boolean(password),
      subdomain: project.eventId,
    });
  }

  return {
    allowed: passwordMatches,
    secured: true,
    subdomain: project.eventId,
    errorMessage: "Admin-Passwort erforderlich oder ungueltig.",
  };
};

