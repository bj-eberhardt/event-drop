import type { Request } from "express";
import {
  AUTH_RATE_LIMIT_BLOCK_MS,
  AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  AUTH_RATE_LIMIT_WINDOW_MS,
} from "../config.js";

type AuthFailureEntry = {
  count: number;
  firstAttempt: number;
  blockedUntil: number;
};

const authFailureTracker = new Map<string, AuthFailureEntry>();

const getClientIp = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";

const buildAuthKey = (req: Request, eventId: string, user: string) =>
  `${getClientIp(req)}|${eventId}|${user}`;

const pruneAuthEntry = (key: string, entry: AuthFailureEntry, now: number) => {
  if (entry.blockedUntil > now) return entry;
  if (now - entry.firstAttempt > AUTH_RATE_LIMIT_WINDOW_MS) {
    authFailureTracker.delete(key);
    return null;
  }
  return entry;
};

export const isAuthBlocked = (req: Request, eventId: string, user: string) => {
  if (AUTH_RATE_LIMIT_MAX_ATTEMPTS <= 0) return { blocked: false, retryAfter: 0 };
  const key = buildAuthKey(req, eventId, user);
  const existing = authFailureTracker.get(key);
  if (!existing) return { blocked: false, retryAfter: 0 };
  const now = Date.now();
  const entry = pruneAuthEntry(key, existing, now);
  if (!entry) return { blocked: false, retryAfter: 0 };
  if (entry.blockedUntil > now) {
    return {
      blocked: true,
      retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }
  return { blocked: false, retryAfter: 0 };
};

export const recordAuthFailure = (req: Request, eventId: string, user: string) => {
  if (AUTH_RATE_LIMIT_MAX_ATTEMPTS <= 0) return;
  const key = buildAuthKey(req, eventId, user);
  const now = Date.now();
  const existing = authFailureTracker.get(key);
  if (!existing || now - existing.firstAttempt > AUTH_RATE_LIMIT_WINDOW_MS) {
    authFailureTracker.set(key, {
      count: 1,
      firstAttempt: now,
      blockedUntil: 0,
    });
    return;
  }
  const nextCount = existing.count + 1;
  const blockedUntil =
    nextCount >= AUTH_RATE_LIMIT_MAX_ATTEMPTS ? now + AUTH_RATE_LIMIT_BLOCK_MS : 0;
  authFailureTracker.set(key, {
    count: nextCount,
    firstAttempt: existing.firstAttempt,
    blockedUntil,
  });
};
