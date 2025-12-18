import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppConfigResponse } from "../api/types";

type AppConfigStore = {
  appConfig: AppConfigResponse | null;
  appConfigLoadedAt: number | null;
  setAppConfig: (config: AppConfigResponse) => void;
  clearAppConfig: () => void;
  isAppConfigExpired: (ttlMs: number) => boolean;
};

const APP_CONFIG_KEY = "app:config";
const storage = typeof window !== "undefined" ? localStorage : undefined;

export const useAppConfigStore = create<AppConfigStore>()(
  persist(
    (set, get) => ({
      appConfig: null,
      appConfigLoadedAt: null,
      setAppConfig: (config) => set({ appConfig: config, appConfigLoadedAt: Date.now() }),
      clearAppConfig: () => set({ appConfig: null, appConfigLoadedAt: null }),
      isAppConfigExpired: (ttlMs) => {
        const { appConfigLoadedAt } = get();
        if (!appConfigLoadedAt) return true;
        if (ttlMs <= 0) return false;
        return Date.now() - appConfigLoadedAt > ttlMs;
      },
    }),
    {
      name: APP_CONFIG_KEY,
      storage: storage ? createJSONStorage(() => storage) : undefined,
      partialize: (state) => ({
        appConfig: state.appConfig,
        appConfigLoadedAt: state.appConfigLoadedAt,
      }),
    }
  )
);
