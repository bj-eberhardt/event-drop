const envMainDomain = (import.meta.env.VITE_MAIN_DOMAIN as string | undefined) ?? "";

const deriveMainDomain = () => {
  if (typeof window === "undefined") return envMainDomain || "";
  const host = window.location.hostname.toLowerCase();
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
};

export const mainDomain = envMainDomain || deriveMainDomain();

export const apiBase =
  ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/$/, "");

export const SUBDOMAIN_REGEX = /^[-a-z0-9]+$/;
