export const redirectToHome = (domain: string): void => {
  if (typeof window === "undefined") return;
  const { protocol, port } = window.location;
  const portSegment = port ? `:${port}` : "";
  window.location.href = `${protocol}//${domain}${portSegment}/`;
};

export const redirectToAdmin = (eventId: string, domain: string, supportSubdomain = true): void => {
  if (typeof window === "undefined") return;
  const { protocol, port } = window.location;
  const portSegment = port ? `:${port}` : "";
  if (supportSubdomain) {
    window.location.href = `${protocol}//${eventId}.${domain}${portSegment}/admin`;
  } else {
    window.location.href = `${protocol}//${domain}${portSegment}/${eventId}/admin`;
  }
};

export type FileBrowserMode = "admin" | "guest";

const adminBasePath = "/admin";
const guestBasePath = "/";

export const getFileBrowserBasePath = (mode: FileBrowserMode, eventId: string): string => {
  if (typeof window === "undefined") {
    return mode === "admin" ? adminBasePath : guestBasePath;
  }
  const pathname = window.location.pathname;
  const normalized =
    pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;

  if (mode === "admin") {
    const candidate = `/${eventId}/admin`;
    if (normalized === candidate || normalized.startsWith(`${candidate}/`)) return candidate;
    return adminBasePath;
  }

  const candidate = `/${eventId}`;
  if (normalized === candidate || normalized.startsWith(`${candidate}/`)) return candidate;
  return guestBasePath;
};

export const getFolderFromLocation = (mode: FileBrowserMode, eventId: string): string => {
  if (typeof window === "undefined") return "";
  const base = getFileBrowserBasePath(mode, eventId);
  if (!window.location.pathname.startsWith(base)) return "";
  const parts = window.location.pathname.substring(base.length);
  if (!parts) return "";
  const trimmed = parts.startsWith("/") ? parts.slice(1) : parts;
  return trimmed ? decodeURIComponent(trimmed) : "";
};

export const buildFolderPath = (mode: FileBrowserMode, eventId: string, folder: string): string => {
  const base = getFileBrowserBasePath(mode, eventId);
  return folder ? `${base}${base.endsWith("/") ? "" : "/"}${encodeURIComponent(folder)}` : base;
};
