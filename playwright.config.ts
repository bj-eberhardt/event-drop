import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const mode = (process.env.E2E_MODE ?? "subdomain").toLowerCase();
const supportSubdomain = mode !== "path";
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const allowedDomains = process.env.E2E_ALLOWED_DOMAINS ?? "localhost";
const eventId = process.env.E2E_EVENT_ID ?? "partytest";
const apiPort = process.env.E2E_API_PORT ?? "8080";
const frontendPort = process.env.E2E_FRONTEND_PORT ?? "5173";
const shouldStartServers = process.env.E2E_START_SERVER !== "false";
const jsonReportFile = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;

const webServer = shouldStartServers
  ? [
      {
        command: "npm run dev:api",
        port: Number(apiPort),
        reuseExistingServer: !isCI,
        env: {
          PORT: apiPort,
          ALLOWED_DOMAINS: allowedDomains,
          SUPPORT_SUBDOMAIN: String(supportSubdomain),
          CORS_ORIGIN: `http://localhost:${frontendPort},http://*.localhost:${frontendPort}`,
        },
      },
      {
        command: "npm run dev",
        port: Number(frontendPort),
        reuseExistingServer: !isCI,
        env: {
          VITE_API_BASE_URL: `http://localhost:${apiPort}`,
          VITE_APP_CONFIG_TTL_MS: "0",
        },
      },
    ]
  : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  workers: 5,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: jsonReportFile || "playwright-report/results.json" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    testIdAttribute: "data-testid",
  },
  webServer,
  metadata: {
    mode,
    supportSubdomain,
    eventId,
  },
});
