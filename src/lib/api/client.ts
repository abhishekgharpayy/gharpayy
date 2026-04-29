// Frontend API client. Reads VITE_API_URL from env. Sends Bearer token from localStorage.
// Server is hosted on YOUR VPS — set VITE_API_URL to e.g. https://api.gharpayy.com
//
// Falls back to a localStorage adapter when VITE_API_URL is unset or the
// server is unreachable — so todos / activities work end-to-end even before
// the VPS is provisioned. As soon as VITE_API_URL is set and reachable,
// real network mode kicks in automatically.
import { localAdapter, isLocalMode } from "./local-adapter";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

const TOKEN_KEY = "gharpayy.access_token";
export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new ApiError("NO_API_URL", "VITE_API_URL not configured", 0);
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const t = tokenStore.get();
  if (t) headers.set("Authorization", `Bearer ${t}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new ApiError(body?.code ?? "INTERNAL", body?.message ?? res.statusText, res.status, body?.details);
  }
  return body as T;
}
function safeJson(t: string): any {
  try { return JSON.parse(t); } catch { return null; }
}

async function safe<T>(networkFn: () => Promise<T>, localFn: () => T): Promise<T> {
  if (isLocalMode()) return localFn();
  return await networkFn();
}

// ---------- Types shared with Settings UI ----------
export type ManagedRole = "manager" | "admin" | "member";
export type AnyRole = "super_admin" | ManagedRole;
export type UserStatus = "active" | "inactive" | "invited" | "deleted";

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  username: string;
  role: AnyRole;
  status: UserStatus;
  zones: string[];
  managerId?: string | null;
  adminId?: string | null;
  adminIds?: string[];
  memberIds?: string[];
  createdAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone: string;
  role: AnyRole;
  status: UserStatus;
  zones: string[];
  scopes: string[];
}

export const api = {
  apiUrl: API_URL || "(local mode)",
  isLocalMode,

  health: () => request<{ ok: true; ts: string }>("/api/health"),

  signup: (b: { email: string; password: string; name: string; role?: ManagedRole }) =>
    request<{ ok: true; userId: string }>("/api/auth/signup", { method: "POST", body: JSON.stringify(b) }),

  login: async (identifier: string, password: string) => {
    const r = await request<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: identifier, username: identifier, password }),
    });
    tokenStore.set(r.token);
    return r;
  },

  logout: async () => {
    await request("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    tokenStore.clear();
  },

  auth: {
    me: () => request<{ user: AuthUser }>("/api/auth/me"),
    update: (b: { password?: string; phone?: string; fullName?: string }) =>
      request<{ ok: true }>("/api/auth/update", { method: "PATCH", body: JSON.stringify(b) }),
  },

  command: <R = unknown>(cmd: { _id: string; type: string; payload: Record<string, unknown> } & Record<string, unknown>) =>
    safe<R>(
      () => request<R>("/api/commands", {
        method: "POST",
        headers: { "Idempotency-Key": cmd._id },
        body: JSON.stringify(cmd),
      }),
      () => localAdapter.command(cmd) as unknown as R,
    ),

  leads: {
    list: (q: Record<string, string | number> = {}) =>
      safe<{ items: unknown[]; nextCursor: string | null }>(
        () => {
          const qs = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])).toString();
          return request<{ items: unknown[]; nextCursor: string | null }>(`/api/leads${qs ? `?${qs}` : ""}`);
        },
        () => localAdapter.listLeads({ limit: typeof q.limit === "number" ? q.limit : Number(q.limit ?? 100) }),
      ),
    get: (id: string) => request<unknown>(`/api/leads/${id}`),
  },

  todos: {
    list: <T = import("@/contracts").Todo>(q: Record<string, string> = {}) =>
      safe<{ items: T[] }>(
        () => {
          const qs = new URLSearchParams(q).toString();
          return request<{ items: T[] }>(`/api/todos${qs ? `?${qs}` : ""}`);
        },
        () => localAdapter.listTodos(q) as unknown as { items: T[] },
      ),
  },

  activities: {
    list: <T = import("@/contracts").Activity>(q: { entityType: string; entityId: string; kind?: string; limit?: number }) =>
      safe<{ items: T[] }>(
        () => {
          const qs = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])).toString();
          return request<{ items: T[] }>(`/api/activities?${qs}`);
        },
        () => localAdapter.listActivities(q) as unknown as { items: T[] },
      ),
  },

  // ---------- User management (super_admin) ----------
  users: {
    list: (status?: UserStatus) =>
      request<ManagedUser[]>(`/api/users${status ? `?status=${status}` : ""}`),
    listLite: () =>
      safe<{ items: { _id: string; name: string; email: string; role: string }[] }>(
        () => request<{ items: { _id: string; name: string; email: string; role: string }[] }>("/api/users/list"),
        () => localAdapter.listUsers(),
      ),
    get: (id: string) => request<ManagedUser>(`/api/users/${id}`),
    create: (b: {
      fullName: string; email: string; phone?: string; password: string;
      role: ManagedRole; zones?: string[];
    }) => request<ManagedUser>("/api/users", { method: "POST", body: JSON.stringify(b) }),
    update: (id: string, b: Record<string, unknown>) =>
      request<ManagedUser>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(b) }),
    resetPassword: (id: string, password: string) =>
      request<{ ok: true }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ password }) }),
    setStatus: (id: string, action: "activate" | "deactivate" | "delete") =>
      request<{ ok: true }>(`/api/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ action }) }),
  },

  managers: {
    list: () => request<(ManagedUser & { admins: ManagedUser[] })[]>("/api/managers"),
  },
  admins: {
    list: () => request<ManagedUser[]>("/api/admins"),
  },
  members: {
    list: () => request<ManagedUser[]>("/api/members"),
  },
  zones: {
    list: () => request<{ id: string; name: string }[]>("/api/zones"),
    create: (name: string) =>
      request<{ id: string; name: string }>("/api/zones", { method: "POST", body: JSON.stringify({ name }) }),
    update: (id: string, name: string) =>
      request<{ id: string; name: string }>(`/api/zones/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/zones/${id}`, { method: "DELETE" }),
  },

  activity: {
    login: (limit = 100) =>
      request<{ items: { _id: string; type: string; occurredAt: string; payload: Record<string, unknown> }[] }>(
        `/api/activity/login?limit=${limit}`,
      ),
    all: (limit = 200) =>
      request<{ items: { _id: string; type: string; occurredAt: string; payload: Record<string, unknown> }[] }>(
        `/api/activity/all?limit=${limit}`,
      ),
    lead: (leadId: string, limit = 200) =>
      request<{ items: { _id: string; type: string; occurredAt: string; payload: Record<string, unknown> }[] }>(
        `/api/activity/lead?leadId=${encodeURIComponent(leadId)}&limit=${limit}`,
      ),
  },
};
