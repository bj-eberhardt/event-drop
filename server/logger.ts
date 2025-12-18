import { LOG_LEVEL } from "./config.js";

type LevelName = "error" | "info" | "debug";

const levelWeights: Record<LevelName, number> = {
  error: 0,
  info: 1,
  debug: 2,
};

const activeWeight =
  LOG_LEVEL === "silent" ? -1 : levelWeights[LOG_LEVEL as LevelName] ?? levelWeights.info;

const shouldLog = (level: LevelName) => activeWeight >= levelWeights[level];

const formatBase = (level: LevelName, message: string, meta?: Record<string, unknown>) => {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${message}`;
  if (!meta || Object.keys(meta).length === 0) return base;
  return `${base} ${JSON.stringify(meta)}`;
};

export const logger = {
  error(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog("error")) return;
    // eslint-disable-next-line no-console
    console.error(formatBase("error", message, meta));
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog("info")) return;
    // eslint-disable-next-line no-console
    console.log(formatBase("info", message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog("debug")) return;
    // eslint-disable-next-line no-console
    console.debug(formatBase("debug", message, meta));
  },
};


