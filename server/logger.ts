import { LOG_LEVEL } from "./config.js";

type LevelName = "error" | "warn" | "info" | "debug";

const levelWeights: Record<LevelName, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const activeWeight =
  LOG_LEVEL === "silent" ? -1 : (levelWeights[LOG_LEVEL as LevelName] ?? levelWeights.info);

const shouldLog = (level: LevelName) => activeWeight >= levelWeights[level];

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  if (typeof error === "number" || typeof error === "boolean" || error === null) {
    return { message: String(error) };
  }
  if (typeof error === "object") {
    return { message: "Unknown error", ...error };
  }
  return { message: "Unknown error" };
};

const normalizeMeta = (meta?: Record<string, unknown>) => {
  if (!meta) return meta;
  const normalized = { ...meta };
  if ("error" in normalized) {
    normalized.error = normalizeError(normalized.error);
  }
  return normalized;
};

const formatBase = (level: LevelName, message: string, meta?: Record<string, unknown>) => {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${message}`;
  const normalizedMeta = normalizeMeta(meta);
  if (!normalizedMeta || Object.keys(normalizedMeta).length === 0) return base;
  return `${base} ${JSON.stringify(normalizedMeta)}`;
};

export const logger = {
  error(message: string, metaOrError?: Record<string, unknown> | unknown, error?: unknown) {
    if (!shouldLog("error")) return;
    let meta: Record<string, unknown> | undefined;
    if (metaOrError && typeof metaOrError === "object" && !(metaOrError instanceof Error)) {
      meta = metaOrError as Record<string, unknown>;
      if (error !== undefined) meta = { ...meta, error };
    } else if (metaOrError !== undefined) {
      meta = { error: metaOrError };
    } else if (error !== undefined) {
      meta = { error };
    }
    console.error(formatBase("error", message, meta));
  },
  warn(message: string, metaOrError?: Record<string, unknown> | unknown, error?: unknown) {
    if (!shouldLog("warn")) return;
    let meta: Record<string, unknown> | undefined;
    if (metaOrError && typeof metaOrError === "object" && !(metaOrError instanceof Error)) {
      meta = metaOrError as Record<string, unknown>;
      if (error !== undefined) meta = { ...meta, error };
    } else if (metaOrError !== undefined) {
      meta = { error: metaOrError };
    } else if (error !== undefined) {
      meta = { error };
    }
    console.warn(formatBase("warn", message, meta));
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog("info")) return;
    console.log(formatBase("info", message, meta));
  },
  debug(message: string, metaOrError?: Record<string, unknown> | unknown, error?: unknown) {
    if (!shouldLog("debug")) return;
    let meta: Record<string, unknown> | undefined;
    if (metaOrError && typeof metaOrError === "object" && !(metaOrError instanceof Error)) {
      meta = metaOrError as Record<string, unknown>;
      if (error !== undefined) meta = { ...meta, error };
    } else if (metaOrError !== undefined) {
      meta = { error: metaOrError };
    } else if (error !== undefined) {
      meta = { error };
    }
    console.debug(formatBase("debug", message, meta));
  },
};
