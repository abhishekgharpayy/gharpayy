import { create } from "zustand";
import { api, tokenStore, type AuthUser } from "./api/client";

export const LOCAL_USER: AuthUser = {
  id: "admin-1", username: "admin", email: "admin@local",
  fullName: "Local Admin", phone: "",
  role: "super_admin", status: "active", zones: [], scopes: [],
  name: "Local Admin",
} as AuthUser;

export function isLocalMode(): boolean {
  if (typeof window === "undefined") return false;
  const explicit = localStorage.getItem("gharpayy.force_local") === "1";
  return explicit || !(import.meta.env.VITE_API_URL as string | undefined);
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setUser: (u: AuthUser | null) => void;
  signOut: () => Promise<void>;
}

export const useAuthUser = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  error: null,
  hydrate: async () => {
    if (typeof window === "undefined") return;
    const token = tokenStore.get();

    // If we're in local dev mode (no VITE_API_URL), auto-auth.
    // If we have a mock-local-token (set by login bypass), always honour it.
    if (isLocalMode() || token === "mock-local-token") {
      tokenStore.set("mock-local-token");
      set({ user: LOCAL_USER, loading: false });
      return;
    }
    if (!token) { set({ user: null }); return; }

    set({ loading: true, error: null });
    try {
      const r = await api.auth.me();
      set({ user: r.user, loading: false });
    } catch (e) {
      tokenStore.clear();
      set({ user: null, loading: false, error: (e as Error).message });
    }
  },
  setUser: (u) => set({ user: u }),
  signOut: async () => {
    await api.logout();
    set({ user: null });
  },
}));
