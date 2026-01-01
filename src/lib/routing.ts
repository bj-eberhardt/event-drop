import type { Route } from "../types";

type ResolveRouteParams = {
  pathname: string;
  hostSubdomain: string | null;
  supportSubdomain: boolean;
};

export const resolveRoute = ({
  pathname,
  hostSubdomain,
  supportSubdomain,
}: ResolveRouteParams): Route => {
  if (hostSubdomain) {
    if (supportSubdomain) {
      return pathname.startsWith("/admin") ? "admin" : "project";
    }
    const parts = pathname.split("/").filter(Boolean);
    return parts[1] === "admin" ? "admin" : "project";
  }
  return pathname.endsWith("/new") ? "new" : "home";
};
