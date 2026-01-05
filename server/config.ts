import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type LogLevel = "silent" | "error" | "info" | "debug";

const appConfigSchema = z.object({
  port: z.number().int().positive().default(8080),
  dataRootPath: z.string().min(1).default("/data/events"),
  uploadTempPath: z.string().min(1).default("/data/uploads"),
  corsOrigin: z.string().default(""),
  jsonLimit: z.string().default("5mb"),
  uploadMaxFileSizeBytes: z.number().nonnegative().default(0),
  uploadMaxTotalSizeBytes: z.number().nonnegative().default(0),
  logLevel: z.enum(["silent", "error", "info", "debug"]).default("info"),
  enableApiDocs: z.boolean().default(false),
  domain: z.string().default(""),
  allowedDomains: z.array(z.string()).default([]),
  supportSubdomain: z.boolean().default(true),
  allowEventCreation: z.boolean().default(true),
  authRateLimitMaxAttempts: z.number().int().nonnegative().default(10),
  authRateLimitWindowMs: z.number().int().positive().default(60_0000),
  authRateLimitBlockMs: z
    .number()
    .int()
    .positive()
    .default(5 * 60 * 1000), // 5 minutes
});

export type AppConfig = z.infer<typeof appConfigSchema>;

const DEFAULT_CONFIG: AppConfig = appConfigSchema.parse({});

const CONFIG_FILE_PATH =
  process.env.SERVER_CONFIG_PATH && process.env.SERVER_CONFIG_PATH.trim().length > 0
    ? path.resolve(process.env.SERVER_CONFIG_PATH)
    : path.resolve("/config/server.config.json");

const parseNumberEnv = (value?: string) => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
};

const parseStringEnv = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const parseStringArrayEnv = (value?: string | null) => {
  const raw = parseStringEnv(value);
  if (!raw) return undefined;
  const list = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
};

const parseBooleanEnv = (value?: string | null) => {
  const raw = parseStringEnv(value);
  if (!raw) return undefined;
  if (raw.toLowerCase() === "true") return true;
  if (raw.toLowerCase() === "false") return false;
  return undefined;
};

const dropUndefined = <T extends Record<string, unknown>>(input: Partial<T>) =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;

const buildConfig = (fileConfig: Partial<AppConfig>, envConfig: Partial<AppConfig>): AppConfig =>
  appConfigSchema.parse({
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
  });

const envOverrides: Partial<AppConfig> = dropUndefined({
  port: parseNumberEnv(process.env.PORT),
  dataRootPath: parseStringEnv(process.env.DATA_ROOT_PATH),
  uploadTempPath: parseStringEnv(process.env.UPLOAD_TEMP_PATH),
  corsOrigin: parseStringEnv(process.env.CORS_ORIGIN),
  jsonLimit: parseStringEnv(process.env.JSON_LIMIT),
  uploadMaxFileSizeBytes: parseNumberEnv(process.env.UPLOAD_MAX_FILE_SIZE_BYTES),
  uploadMaxTotalSizeBytes: parseNumberEnv(process.env.UPLOAD_MAX_TOTAL_SIZE_BYTES),
  logLevel: (parseStringEnv(process.env.LOG_LEVEL) as LogLevel) || undefined,
  enableApiDocs: process.env.ENABLE_API_DOCS === "true" ? true : undefined,
  allowedDomains: parseStringArrayEnv(process.env.ALLOWED_DOMAINS),
  supportSubdomain: parseBooleanEnv(process.env.SUPPORT_SUBDOMAIN),
  allowEventCreation: parseBooleanEnv(process.env.ALLOW_EVENT_CREATION),
  authRateLimitMaxAttempts: parseNumberEnv(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS),
  authRateLimitWindowMs: parseNumberEnv(process.env.AUTH_RATE_LIMIT_WINDOW_MS),
  authRateLimitBlockMs: parseNumberEnv(process.env.AUTH_RATE_LIMIT_BLOCK_MS),
});

let loadedConfig: AppConfig;

try {
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    loadedConfig = buildConfig({}, envOverrides);
    fs.mkdirSync(path.dirname(CONFIG_FILE_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(loadedConfig, null, 2), "utf8");

    console.log(`Created default config file at ${CONFIG_FILE_PATH}`);
  } else {
    const raw = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
    const parsed = raw.trim().length ? (JSON.parse(raw) as Partial<AppConfig>) : {};
    loadedConfig = buildConfig(parsed, envOverrides);
    const normalized = JSON.stringify(loadedConfig, null, 2);
    if (raw.trim() !== normalized.trim()) {
      fs.writeFileSync(CONFIG_FILE_PATH, normalized, "utf8");
      console.log(`Updated config file at ${CONFIG_FILE_PATH}`);
    }
  }
} catch (error) {
  console.error(`Failed to load config file at ${CONFIG_FILE_PATH}`, error);
  throw error;
}

export const CONFIG_FILE_PATH_LOADED = CONFIG_FILE_PATH;

export const CONFIG: AppConfig = loadedConfig;

export const IS_PROD_ENV = (process.env.NODE_ENV || "").toLowerCase() == "production";
export const DOMAIN = CONFIG.domain || "localhost";
export const PORT = CONFIG.port;
export const DATA_ROOT_PATH = CONFIG.dataRootPath;
export const UPLOAD_TEMP_PATH = CONFIG.uploadTempPath;
export const EVENT_REGEX = /^[-a-z0-9]+$/i;
export const NOT_ALLOWED_EVENTNAMES_REGEX =
  /^(?!\b(admin|login|logout|api|docs|static|public|uploads)\b).+$/i;
export const FOLDER_REGEX = /^[A-Za-z0-9 -]+$/;
export const DIST_PATH = path.resolve(__dirname, "../dist");
export const JSON_LIMIT = CONFIG.jsonLimit;
export const CORS_ORIGIN = CONFIG.corsOrigin;
export const UPLOAD_MAX_FILE_SIZE_BYTES = CONFIG.uploadMaxFileSizeBytes;
export const UPLOAD_MAX_TOTAL_SIZE_BYTES = CONFIG.uploadMaxTotalSizeBytes;
export const LOG_LEVEL: LogLevel = CONFIG.logLevel;
export const ENABLE_API_DOCS = CONFIG.enableApiDocs;
export const ALLOWED_DOMAINS = CONFIG.allowedDomains;
export const SUPPORT_SUBDOMAIN = CONFIG.supportSubdomain;
export const ALLOW_EVENT_CREATION = CONFIG.allowEventCreation;
export const AUTH_RATE_LIMIT_MAX_ATTEMPTS = CONFIG.authRateLimitMaxAttempts;
export const AUTH_RATE_LIMIT_WINDOW_MS = CONFIG.authRateLimitWindowMs;
export const AUTH_RATE_LIMIT_BLOCK_MS = CONFIG.authRateLimitBlockMs;
