import { useMemo } from "react";
import { ApiClient } from "../../api/client";
import { useSessionStore } from "../../lib/sessionStore";

export type ApiClientMode = "admin" | "guest" | "anonymous";

export const useApiClient = (mode: ApiClientMode): ApiClient => {
  const { adminToken, guestToken } = useSessionStore();

  return useMemo(() => {
    if (mode === "admin") return ApiClient.withAdminToken(adminToken ?? "");
    if (mode === "guest") return ApiClient.withGuestToken(guestToken ?? "");
    return ApiClient.anonymous();
  }, [adminToken, guestToken, mode]);
};
