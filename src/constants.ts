export const apiBase = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(
  /\/$/,
  ""
);

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
