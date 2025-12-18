import bcrypt from "bcryptjs";
import { EventConfig } from "../types.js";
import { Request } from "express";
import { logger } from "../logger.js";

export type AllowedUserRole = "admin" | "guest";

export type AuthCredentials = { user: string; password: string };

export const parseBasicAuth = (req: Request): AuthCredentials => {
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
  } catch (error) {
    logger.debug("Failed to decode basic auth header", { path: req.path, error });
    return { user: "", password: "" };
  }
};

const hasAccess = async (
  req: Request,
  eventId: string,
  expectedUser: AllowedUserRole,
  expectedHash: string,
  credentials: AuthCredentials
): Promise<boolean> => {
  const { user, password } = credentials;
  if (user !== expectedUser) {
    return false;
  }
  const passwordMatches = await bcrypt.compare(password, expectedHash);

  if (!passwordMatches) {
    logger.debug(`${expectedUser} access denied. Wrong password submitted.`, {
      path: req.path,
      user,
      eventId,
      ip: req.ip,
    });
    return false;
  }
  return true;
};

export const hasGuestAccess = async (
  req: Request,
  eventConfig: EventConfig,
  credentials: AuthCredentials
): Promise<boolean> => {
  const secured = Boolean(eventConfig.auth.guestPasswordHash);
  if (!secured) return true;

  return hasAccess(
    req,
    eventConfig.eventId,
    "guest",
    eventConfig.auth.guestPasswordHash!,
    credentials
  );
};

export const hasAdminAccess = async (
  req: Request,
  eventConfig: EventConfig,
  credentials: AuthCredentials
): Promise<boolean> => {
  return hasAccess(
    req,
    eventConfig.eventId,
    "admin",
    eventConfig.auth.adminPasswordHash,
    credentials
  );
};
