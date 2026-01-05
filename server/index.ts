import express, { Request, Response } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import swaggerUi from "swagger-ui-express";
import {
  CORS_ORIGIN,
  JSON_LIMIT,
  DATA_ROOT_PATH,
  PORT,
  ENABLE_API_DOCS,
  CONFIG,
  CONFIG_FILE_PATH_LOADED,
  IS_PROD_ENV,
} from "./config.js";
import { ensureBaseDir } from "./services/events.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerAppConfigRoutes } from "./routes/app-config.js";
import { logger } from "./logger.js";
import { createOpenApiDocument } from "./openapi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const openApiDocument = createOpenApiDocument();

app.set("trust proxy", true);

type OriginMatcher =
  | { type: "exact"; value: string }
  | { type: "wildcard"; scheme: string; host: string; port?: string };

const ORIGIN_PATTERN = /^(https?:)\/\/(\*\.)?([^/:]+)(?::(\d+))?$/i;

const corsOriginMatchers: OriginMatcher[] = CORS_ORIGIN
  ? CORS_ORIGIN.split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((entry) => {
        const match = ORIGIN_PATTERN.exec(entry);
        if (!match) {
          return { type: "exact", value: entry };
        }

        const [, scheme, wildcardPrefix, host, port] = match;
        if (wildcardPrefix) {
          return { type: "wildcard", scheme: scheme.toLowerCase(), host: host.toLowerCase(), port };
        }

        const normalized = `${scheme.toLowerCase()}//${host.toLowerCase()}${port ? `:${port}` : ""}`;
        return { type: "exact", value: normalized };
      })
  : [];

const isAllowedOrigin = (origin?: string | null) => {
  if (!CORS_ORIGIN) return true;
  if (!origin) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  const originHost = url.hostname.toLowerCase();
  const originScheme = url.protocol.toLowerCase();
  const originPort = url.port;

  return corsOriginMatchers.some((matcher) => {
    if (matcher.type === "exact") {
      return url.origin.toLowerCase() === matcher.value;
    }

    if (originScheme !== matcher.scheme) return false;
    if (matcher.port && matcher.port !== originPort) return false;
    if (!matcher.port && originPort) return false;
    if (originHost === matcher.host) return false;
    return originHost.endsWith(`.${matcher.host}`);
  });
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json({ limit: JSON_LIMIT }));

// Basic request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url } = req;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    logger.info("HTTP request", {
      method,
      url,
      statusCode,
      durationMs: duration,
      ip: req.ip,
    });
  });

  next();
});

registerEventRoutes(app);
registerAppConfigRoutes(app);
if (ENABLE_API_DOCS) {
  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
}

if (!IS_PROD_ENV) {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "static", "index.html"));
  });
}

app.use((error: Error, _req: Request, res: Response) => {
  console.error("API error:", error);
  res.status(500).json({ message: "Unexpected error." });
});

await ensureBaseDir();
logger.info("Loaded server config", { configFile: CONFIG_FILE_PATH_LOADED, config: CONFIG });
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with DATA_ROOT_PATH=${DATA_ROOT_PATH}`);
});
