import { SUBDOMAIN_REGEX } from "../constants";

export type DomainMatchResult = {
  baseDomain: string | null;
  subdomain: string | null;
};

const normalizeHost = (host: string) => {
  const withoutPort = host.split(":")[0].toLowerCase();
  return withoutPort.startsWith("www.") ? withoutPort.slice(4) : withoutPort;
};

export const matchAllowedDomain = (allowedDomains: string[], host: string): string | null => {
  const normalizedHost = normalizeHost(host);
  for (const domain of allowedDomains) {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) continue;
    if (normalizedHost === normalized || normalizedHost.endsWith(`.${normalized}`)) {
      return normalized;
    }
  }
  return null;
};

export const getSubdomainFromHost = (allowedDomains: string[], host: string): string | null => {
  const normalizedHost = normalizeHost(host);
  const matchedDomain = matchAllowedDomain(allowedDomains, normalizedHost);
  if (!matchedDomain) return null;
  if (normalizedHost === matchedDomain) return null;
  const candidate = normalizedHost.endsWith(`.${matchedDomain}`)
    ? normalizedHost.slice(0, normalizedHost.length - matchedDomain.length - 1)
    : null;
  if (!candidate) return null;
  if (!SUBDOMAIN_REGEX.test(candidate)) return null;
  return candidate;
};

export const getDomainMatchFromHost = (
  allowedDomains: string[],
  host: string
): DomainMatchResult => {
  const baseDomain = matchAllowedDomain(allowedDomains, host);
  if (!baseDomain) return { baseDomain: null, subdomain: null };
  const subdomain = getSubdomainFromHost(allowedDomains, host);
  return { baseDomain, subdomain };
};

type BuildEventUrlParams = {
  eventId: string;
  baseDomain: string;
  supportSubdomain: boolean;
  admin?: boolean;
  protocol?: string;
  port?: string;
};

export const buildEventUrl = ({
  eventId,
  baseDomain,
  supportSubdomain,
  admin = false,
  protocol,
  port,
}: BuildEventUrlParams): string => {
  const safeProtocol = protocol || (typeof window !== "undefined" ? window.location.protocol : "");
  const portSegment =
    typeof port === "string"
      ? port
        ? `:${port}`
        : ""
      : typeof window !== "undefined" && window.location.port
        ? `:${window.location.port}`
        : "";
  const adminSuffix = admin ? "/admin" : "";
  if (supportSubdomain) {
    return `${safeProtocol}//${eventId}.${baseDomain}${portSegment}${adminSuffix}/`;
  }
  return `${safeProtocol}//${baseDomain}${portSegment}/${eventId}${adminSuffix}`;
};
