import { createFileRoute, redirect } from "@tanstack/react-router";

import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/lib/auth-store";
import { useSystemDiagnostics } from "@/admin/lib/use-live-supreme";
import { RefreshCw, CheckCircle2, AlertTriangle, Activity, Database, Users, Clock } from "lucide-react";
import type { Role } from "@/lib/types";

export const Route = createFileRoute("/admin/settings")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  component: AdminSettings,
});

function AdminSettings() {
  const { role, setRole } = useApp();
  const authRole = useAuthUser((s) => s.user?.role);
  const { data: diag, isLoading, isError, refetch, isFetching } = useSystemDiagnostics();

  const uptimeStr = diag
    ? (() => {
        const h = Math.floor(diag.uptime / 3600);
        const m = Math.floor((diag.uptime % 3600) / 60);
        const s = diag.uptime % 60;
        return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
      })()
    : "—";

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {/* ── System Diagnostics ── */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <span className="text-xs font-semibold uppercase tracking-wider">System Diagnostics</span>
              {diag && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-mono">
                  Live
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {isLoading && (
            <div className="text-xs text-muted-foreground animate-pulse">
              Pinging MongoDB…
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Cannot reach diagnostics endpoint. Ensure the Fastify server is running.
            </div>
          )}

          {diag && (
            <>
              {/* DB Counts */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground mb-2">
                  <Database className="h-3 w-3" />
                  MongoDB Collection Counts
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {Object.entries(diag.counts).map(([key, val]) => (
                    <div key={key} className="bg-muted/30 rounded-lg p-2.5">
                      <div className="text-[10px] text-muted-foreground capitalize">{key}</div>
                      <div className="text-lg font-display font-semibold font-mono text-accent">{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Server Health */}
              <div className="grid md:grid-cols-3 gap-3">
                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground mb-1.5">
                    <Clock className="h-3 w-3" />
                    Server Uptime
                  </div>
                  <div className="text-sm font-mono font-semibold text-success">{uptimeStr}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {diag.serverTime && !isNaN(new Date(diag.serverTime).getTime()) ? new Date(diag.serverTime).toLocaleString("en-IN") : "—"}
                  </div>
                </div>

                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground mb-1.5">
                    <Activity className="h-3 w-3" />
                    Sequence Status
                  </div>
                  <div className={`text-sm font-mono font-semibold flex items-center gap-1 ${diag.sequencesPaused ? "text-destructive" : "text-success"}`}>
                    {diag.sequencesPaused ? (
                      <>⛔ PAUSED</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4" /> RUNNING</>
                    )}
                  </div>
                  {diag.pausedAt && !isNaN(new Date(diag.pausedAt).getTime()) && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Since {new Date(diag.pausedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>

                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground mb-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    Errors (last 24h)
                  </div>
                  <div className={`text-sm font-mono font-semibold ${diag.recentErrors.length > 0 ? "text-destructive" : "text-success"}`}>
                    {diag.recentErrors.length === 0 ? "✅ None" : `${diag.recentErrors.length} error(s)`}
                  </div>
                </div>
              </div>

              {/* Recent Errors */}
              {diag.recentErrors.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-2">Recent Error Events</div>
                  <ul className="space-y-1 text-[11px] font-mono max-h-40 overflow-auto">
                    {(diag.recentErrors as any[]).map((e, i) => (
                      <li key={i} className="bg-destructive/10 text-destructive rounded px-2 py-1 truncate">
                        {e.action} — {e.summary ?? JSON.stringify(e).slice(0, 80)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Role & Session ── */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider">Session & Role</span>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Current Role</div>
            <div className="text-sm font-mono bg-muted/30 px-3 py-2 rounded-lg">{(authRole ?? role) as string}</div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-2">Switch to Role (dev only)</div>
            <div className="flex gap-2 flex-wrap">
              {(["hr", "flow-ops", "tcm", "owner"] as Role[]).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={role === r ? "default" : "outline"}
                  onClick={() => setRole(r)}
                  className="text-xs"
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Maintenance ── */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maintenance</div>

          <div>
            <div className="text-xs text-muted-foreground mb-2">Saved Views</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                localStorage.removeItem("admin.views");
                location.reload();
              }}
              className="text-xs"
            >
              Clear saved views &amp; reload
            </Button>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-2">Kill Switch Cache</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                localStorage.removeItem("admin.kill.sequences");
                location.reload();
              }}
              className="text-xs"
            >
              Clear local kill-switch state
            </Button>
          </div>

          <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
            Role switching is local-only. All admin actions (broadcast, kill switch) are persisted to MongoDB and logged to the Audit trail.
          </div>
        </div>
      </div>
    </div>
  );
}
