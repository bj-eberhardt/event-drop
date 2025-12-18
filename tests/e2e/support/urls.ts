export type E2EMode = "subdomain" | "path";

export const getMode = (): E2EMode =>
  (process.env.E2E_MODE ?? "subdomain").toLowerCase() === "path" ? "path" : "subdomain";

export const getEventId = () => process.env.E2E_EVENT_ID ?? "partytest";

export const buildEventUrl = (
  baseURL: string,
  mode: E2EMode,
  eventId: string,
  admin = false
) => {
  const base = new URL(baseURL);
  const port = base.port ? `:${base.port}` : "";
  if (mode === "subdomain") {
    const suffix = admin ? "/admin" : "/";
    return `${base.protocol}//${eventId}.${base.hostname}${port}${suffix}`;
  }
  const adminSuffix = admin ? "/admin" : "";
  return `${base.protocol}//${base.hostname}${port}/${eventId}${adminSuffix}`;
};
