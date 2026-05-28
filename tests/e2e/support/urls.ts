export type E2EMode = "subdomain" | "path";

export const getMode = (): E2EMode =>
  (process.env.E2E_MODE ?? "subdomain").toLowerCase() === "path" ? "path" : "subdomain";

export const getEventId = () => process.env.E2E_EVENT_ID ?? "partytest";

export const buildEventUrl = (baseURL: string, mode: E2EMode, eventId: string, admin = false) => {
  const base = new URL(baseURL);
  const port = base.port ? `:${base.port}` : "";
  if (mode === "subdomain") {
    const suffix = admin ? "/admin" : "/";
    return `${base.protocol}//${eventId}.${base.hostname}${port}${suffix}`;
  }
  const adminSuffix = admin ? "/admin" : "";
  return `${base.protocol}//${base.hostname}${port}/${eventId}${adminSuffix}`;
};

export const withQuery = (url: string, query: Record<string, string | undefined>): string => {
  const u = new URL(url);
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    u.searchParams.set(key, value);
  });
  return u.toString();
};

export const encodeUploadPresetToken = (folder: string): string => {
  const json = JSON.stringify({ v: 1, f: folder.trim() });
  const base64 = Buffer.from(json, "utf8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
