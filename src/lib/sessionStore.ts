import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SessionState = {
  guestToken?: string;
  adminToken?: string;
  skipDeleteConfirm?: boolean;
};

type SessionStore = SessionState & {
  setGuestToken: (token?: string | null) => void;
  setAdminToken: (token?: string | null) => void;
  setSkipDeleteConfirm: (value: boolean) => void;
  clear: () => void;
};

const SESSION_KEY = "app:session";
const defaultState: SessionState = {};
const storage = typeof window !== "undefined" ? sessionStorage : undefined;

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      ...defaultState,
      setGuestToken: (token) => set({ guestToken: token || undefined }),
      setAdminToken: (token) => set({ adminToken: token || undefined }),
      setSkipDeleteConfirm: (value) => set({ skipDeleteConfirm: value }),
      clear: () => set({ ...defaultState }),
    }),
    {
      name: SESSION_KEY,
      storage: storage ? createJSONStorage(() => storage) : undefined,
      partialize: (state) => ({
        guestToken: state.guestToken,
        adminToken: state.adminToken,
        skipDeleteConfirm: state.skipDeleteConfirm,
      }),
    }
  )
);
