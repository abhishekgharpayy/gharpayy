import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useLiveSupremeMetrics } from "@/admin/lib/use-live-supreme";
import { useAuditLog } from "@/lib/crm10x/audit-log";
import { useSendBroadcast, useKillSwitch } from "@/admin/lib/use-live-supreme";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ShieldAlert, Power, Megaphone, Snowflake, Download, UserCheck, RefreshCw } from "lucide-react";
import { useAuthUser } from "@/lib/auth-store";
import { useApp } from "@/lib/store";
import { bulkReassign, flagIntervention } from "@/admin/lib/admin-actions";

export const Route = createFileRoute("/admin/command")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Command Bridge — Admin" }] }),
  component: CommandBridge,
});

function CommandBridge() {
  const { rows, isLoading, refetch } = useLiveSupremeMetrics();
  const { setRole, setCurrentTcmId } = useApp();
  const log = useAuditLog((s) => s.log);

  const sendBroadcast = useSendBroadcast();
  const killSwitch = useKillSwitch();

  const [impersonateId, setImpersonateId] = useState<string>("");
  const [broadcast, setBroadcast] = useState("");
  const [paused, setPaused] = useState<boolean>(false);

  // Derive TCM list from live rows
  const tcms = useMemo(() => {
    const map = new Map<string, { id: string; name: string; zone: string }>();
    rows.forEach((r) => {
      if (r.tcm) map.set(r.tcm.id, { id: r.tcm.id, name: r.tcm.name, zone: (r.tcm as any).zone || "" });
    });
    return Array.from(map.values());
  }, [rows]);

  const dormant = useMemo(() => rows.filter((r) => r.status === "dormant"), [rows]);
  const stuckHot = useMemo(
    () =>
      rows.filter(
        (r) =>
          !r.booked &&
          r.status !== "lost" &&
          r.probability >= 70 &&
          Date.now() - r.lastTouchTs > 2 * 86_400_000,
      ),
    [rows],
  );

  function doImpersonate() {
    if (!impersonateId) return;
    setRole("tcm");
    setCurrentTcmId(impersonateId);
    const t = tcms.find((x) => x.id === impersonateId);
    log({
      actorId: "admin",
      actorName: "Admin",
      entityType: "lead" as any,
      entityId: impersonateId,
      action: "admin.impersonate",
      summary: `Impersonating ${t?.name ?? impersonateId}`,
    });
    toast.warning(`Now impersonating ${t?.name}. Switch back via View As.`);
  }

  async function handleTogglePause() {
    const next = !paused;
    try {
      await killSwitch.mutateAsync({ paused: next });
      setPaused(next);
      toast[next ? "warning" : "success"](next ? "All sequences paused org-wide (persisted)" : "Sequences resumed");
    } catch {
      toast.error("Kill switch failed — check backend connection.");
    }
  }

  async function handleBroadcast() {
    if (!broadcast.trim()) return;
    try {
      const res = await sendBroadcast.mutateAsync({ message: broadcast });
      toast.success(`Broadcast sent to ${res.recipientCount} TCMs · saved to DB`);
      navigator.clipboard?.writeText(broadcast).catch(() => {});
      setBroadcast("");
    } catch {
      toast.error("Broadcast failed — check backend connection.");
    }
  }

  function snapshotNow() {
    const blob = new Blob([JSON.stringify({ ts: Date.now(), rows }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `admin-snapshot-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    log({
      actorId: "admin",
      actorName: "Admin",
      entityType: "tour" as any,
      entityId: "snapshot",
      action: "admin.snapshot",
      summary: `Snapshot of ${rows.length} rows downloaded`,
    });
    toast.info(`Snapshot downloaded · ${rows.length} rows`);
  }

  function rebalanceDormant() {
    if (!dormant.length) return toast.info("No dormant leads to rebalance");
    if (!tcms.length) return;
    const fittest = tcms[0]; // Use first available TCM
    bulkReassign(dormant.map((d) => d.lead.id), fittest.id);
    toast.success(`Reassigned ${dormant.length} dormant leads to ${fittest.name}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Command Bridge</h1>
        <p className="text-sm text-muted-foreground">Broadcast, pause, snapshot — every god-mode lever. Now persisted.</p>
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 animate-pulse">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Loading live data…
        </div>
      )}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Impersonate */}
        <Card icon={<UserCheck className="h-4 w-4" />} title="Impersonate TCM" tone="warn">
          <p className="text-[11px] text-muted-foreground mb-2">
            Sign in as any TCM to debug their desk. Session is logged.
          </p>
          <select
            value={impersonateId}
            onChange={(e) => setImpersonateId(e.target.value)}
            className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 mb-2"
          >
            <option value="">Select TCM…</option>
            {tcms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.zone ? `· ${t.zone}` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={doImpersonate}
            disabled={!impersonateId}
            className="w-full text-xs bg-warning text-warning-foreground rounded py-1.5 font-medium disabled:opacity-40"
          >
            Become this TCM
          </button>
        </Card>

        {/* Kill Switch */}
        <Card icon={<Power className="h-4 w-4" />} title="Kill Switch" tone={paused ? "danger" : "ok"}>
          <p className="text-[11px] text-muted-foreground mb-2">
            Pause every WhatsApp/Email sequence org-wide. Persisted in MongoDB.
          </p>
          <div
            className={cn(
              "text-center py-2 rounded mb-2 font-mono text-xs",
              paused ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
            )}
          >
            {paused ? " PAUSED" : " RUNNING"}
          </div>
          <button
            onClick={handleTogglePause}
            disabled={killSwitch.isPending}
            className={cn(
              "w-full text-xs rounded py-1.5 font-medium disabled:opacity-50",
              paused ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground",
            )}
          >
            {killSwitch.isPending ? "Saving…" : paused ? "Resume sequences" : "Pause all sequences"}
          </button>
        </Card>

        {/* Snapshot */}
        <Card icon={<Download className="h-4 w-4" />} title="Snapshot Now" tone="info">
          <p className="text-[11px] text-muted-foreground mb-2">
            Download current state of every joined admin row as JSON. Use for forensics or BI.
          </p>
          <div className="text-[10px] text-muted-foreground mb-2 font-mono">
            {rows.length} rows · {(JSON.stringify(rows).length / 1024).toFixed(1)} KB
          </div>
          <button
            onClick={snapshotNow}
            className="w-full text-xs bg-info text-info-foreground rounded py-1.5 font-medium"
          >
            Download snapshot
          </button>
        </Card>

        {/* Broadcast */}
        <Card icon={<Megaphone className="h-4 w-4" />} title="Broadcast to All TCMs" tone="info" className="md:col-span-2">
          <textarea
            value={broadcast}
            onChange={(e) => setBroadcast(e.target.value)}
            placeholder="One message — every TCM sees this on next refresh. Saved to DB."
            rows={3}
            className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 mb-2 font-mono"
          />
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground">
              {broadcast.length}/280 · {tcms.length} recipients
            </span>
            <button
              onClick={handleBroadcast}
              disabled={!broadcast.trim() || sendBroadcast.isPending}
              className="text-xs bg-primary text-primary-foreground shadow-sm rounded px-3 py-1.5 font-medium disabled:opacity-40"
            >
              {sendBroadcast.isPending ? "Sending…" : "Send + copy"}
            </button>
          </div>
        </Card>

        {/* Rebalance */}
        <Card icon={<Snowflake className="h-4 w-4" />} title="Rebalance Dormant" tone="warn">
          <p className="text-[11px] text-muted-foreground mb-2">
            Bulk-reassign every dormant lead to the top TCM.
          </p>
          <div className="text-[10px] text-muted-foreground mb-2 font-mono">
            {dormant.length} dormant lead(s)
          </div>
          <button
            onClick={rebalanceDormant}
            className="w-full text-xs bg-warning text-warning-foreground rounded py-1.5 font-medium"
          >
            Rebalance now
          </button>
        </Card>
      </div>

      {/* Intervention Queue */}
      <div className="rounded-xl border border-border bg-card p-3 mt-3">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <div className="text-xs font-semibold">Intervention queue · hot leads going cold</div>
        </div>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-1.5">Lead</th>
              <th className="text-left">TCM</th>
              <th className="text-right">Prob</th>
              <th className="text-right">Stale</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stuckHot.map((r) => (
              <tr key={r.lead.id} className="border-b border-border/60">
                <td className="py-1.5">{r.lead.name}</td>
                <td className="text-muted-foreground">{r.tcm?.name ?? "—"}</td>
                <td className="text-right font-mono text-accent">{r.probability}%</td>
                <td className="text-right font-mono text-warning">
                  {Math.round((Date.now() - r.lastTouchTs) / 86_400_000)}d
                </td>
                <td className="text-right">
                  <button
                    onClick={() => flagIntervention(r.lead.id, "Hot lead stalled · admin escalation")}
                    className="text-[10px] px-2 py-0.5 rounded bg-destructive/15 text-destructive hover:bg-destructive/25"
                  >
                    Flag
                  </button>
                </td>
              </tr>
            ))}
            {!stuckHot.length && (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-4">
                  No hot leads stalled. 
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  tone,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "ok" | "info" | "warn" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  const border = {
    ok: "border-success/40",
    info: "border-info/40",
    warn: "border-warning/40",
    danger: "border-destructive/40",
  }[tone];
  return (
    <div className={cn("rounded-xl border bg-card p-3", border, className)}>
      <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
