import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import path from "node:path";
import swaggerUi from "swagger-ui-express";
import { CORS_ORIGIN, DIST_PATH, JSON_LIMIT, DATA_ROOT_PATH, PORT } from "./config.js";
import { ensureBaseDir } from "./services/projects.js";
import { registerEventRoutes } from "./routes/events.js";
import { logger } from "./logger.js";
import { createOpenApiDocument } from "./openapi.js";

const app = express();
const openApiDocument = createOpenApiDocument();

type OriginMatcher = { type: "exact"; value: string } | { type: "wildcard"; scheme: string; host: string; port?: string };

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
  }),
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
    });
  });

  next();
});

registerEventRoutes(app);
if (process.env.ENABLE_API_DOCS === "true") {
  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
}

app.use(express.static(DIST_PATH));

app.get("*", (_req, res) => {
  res.sendFile(path.join(DIST_PATH, "index.html"));
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("API error:", error);
  res.status(500).json({ message: "Unerwarteter Fehler." });
});

await ensureBaseDir();
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server laeuft auf Port ${PORT}. DATA_ROOT_PATH=${DATA_ROOT_PATH}`);
});
