const rawApiBase = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(
  /\/$/,
  ""
);

export const apiBase = (() => {
  if (!rawApiBase) return "";
  if (typeof window === "undefined") return rawApiBase;

  try {
    const url = new URL(rawApiBase);
    const currentHost = window.location.hostname;
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const isNonLocalClientHost =
      currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1";

    if (isLocalhost && isNonLocalClientHost) {
      const portPart = url.port ? `:${url.port}` : "";
      return `${url.protocol}//${currentHost}${portPart}`;
    }
  } catch {
    // ignore invalid URLs and keep env value as-is
  }

  return rawApiBase;
})();

const parseNumberEnv = (value?: string) => {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

export const APP_CONFIG_TTL_MS =
  parseNumberEnv(import.meta.env.VITE_APP_CONFIG_TTL_MS as string | undefined) ?? 5 * 60 * 1000;

export const UI_FEEDBACK_TIMEOUT_MS = 3000;

export const EVENTNAME_REGEX = /^[a-zA-Z0-9-]+$/;
export const SUBDOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)$/;
export const NOT_ALLOWED_EVENTNAMES_REGEX =
  /^(?!\b(admin|login|logout|api|docs|static|public|uploads)\b).+$/i;
export const FOLDER_REGEX = /^[A-Za-z0-9 -]+$/;
