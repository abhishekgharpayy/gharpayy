import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { joinAdmin, type AdminLeadRow, type JoinSources } from "./selectors";
import { API_URL } from "@/lib/api/client";

async function authedFetch(path: string, opts?: RequestInit) {
  const token =
    localStorage.getItem("gharpayy.access_token") ||
    localStorage.getItem("auth_token") ||
    localStorage.getItem("token") || "";
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Supreme Metrics ──────────────────────────────────────────────────────────
export function useLiveSupremeMetrics() {
  const query = useQuery({
    queryKey: ["admin", "supreme", "metrics"],
    queryFn: () => authedFetch("/api/v1/admin/supreme/metrics") as Promise<Partial<JoinSources>>,
    refetchInterval: 60_000,
  });

  const rows: AdminLeadRow[] = query.data
    ? joinAdmin({
        leads: query.data.leads || [],
        tours: query.data.tours || [],
        tcms: query.data.tcms || [],
        bookings: query.data.bookings || [],
        followUps: query.data.followUps || [],
        profiles: {},
        objections: (query.data as any).activities?.filter((a: any) => a.kind === "objection") || [],
        calls: (query.data as any).activities?.filter((a: any) => a.kind === "call") || [],
        visits: {},
        assignments: (query.data as any).activities?.filter((a: any) => a.kind === "assignment") || [],
        coachingNotes: (query.data as any).activities?.filter((a: any) => a.kind === "coaching_note") || [],
        messageOutcomes: (query.data as any).activities?.filter((a: any) => a.kind === "message") || [],
      })
    : [];

  return {
    rows,
    rawData: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── Coaching Notes ────────────────────────────────────────────────────────────
export function useAddCoachingNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, tcmId, note }: { leadId: string; tcmId: string; note: string }) =>
      authedFetch("/api/v1/admin/coaching-notes", {
        method: "POST",
        body: JSON.stringify({ leadId, tcmId, note }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "supreme", "metrics"] }),
  });
}

// ── Server-Side Audit Log ─────────────────────────────────────────────────────
export function useLiveAuditLog(search = "") {
  return useQuery({
    queryKey: ["admin", "audit", search],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "300", q: search });
      return authedFetch(`/api/v1/admin/audit?${params}`) as Promise<{
        entries: AuditEntry[];
        total: number;
      }>;
    },
    refetchInterval: 30_000,
  });
}

export interface AuditEntry {
  _id: string;
  actorId: string;
  actorName: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  ts: number;
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
export function useSendBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ message }: { message: string }) =>
      authedFetch("/api/v1/admin/broadcast", { method: "POST", body: JSON.stringify({ message }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "audit"] }),
  });
}

// ── Kill Switch ───────────────────────────────────────────────────────────────
export function useKillSwitch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paused }: { paused: boolean }) =>
      authedFetch("/api/v1/admin/kill-switch", { method: "POST", body: JSON.stringify({ paused }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "diagnostics"] }),
  });
}

// ── System Diagnostics ────────────────────────────────────────────────────────
export interface DiagnosticsData {
  counts: { leads: number; tours: number; bookings: number; users: number; activities: number };
  sequencesPaused: boolean;
  pausedAt: string | null;
  recentErrors: unknown[];
  serverTime: string;
  uptime: number;
}

export function useSystemDiagnostics() {
  return useQuery({
    queryKey: ["admin", "diagnostics"],
    queryFn: () => authedFetch("/api/v1/admin/diagnostics") as Promise<DiagnosticsData>,
    refetchInterval: 30_000,
  });
}
