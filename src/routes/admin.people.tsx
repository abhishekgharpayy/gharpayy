import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useLiveSupremeMetrics } from "@/admin/lib/use-live-supreme";
import { useAuthUser } from "@/lib/auth-store";

export const Route = createFileRoute("/admin/people")(
  {
    beforeLoad: () => {
      const role = useAuthUser.getState().user?.role;
      if (role !== "super_admin") throw redirect({ to: "/" });
    },
    component: AdminPeople,
  }
);

interface TcmStats {
  id: string;
  name: string;
  zone: string;
  leads: number;
  hot: number;
  visits: number;
  booked: number;
  lost: number;
  closed: number;
  convPct: number;
  lastTouch: number;
}

function AdminPeople() {
  const { rows, isLoading, isError } = useLiveSupremeMetrics();

  const stats = useMemo(() => {
    const map = new Map<string, TcmStats>();

    rows.forEach((r) => {
      const tcmId = r.lead.assignedTcmId || "unassigned";
      const tcmName = r.tcm?.name || "Unassigned";
      const tcmZone = (r.tcm as any)?.zone || "—";

      if (!map.has(tcmId)) {
        map.set(tcmId, {
          id: tcmId,
          name: tcmName,
          zone: tcmZone,
          leads: 0,
          hot: 0,
          visits: 0,
          booked: 0,
          lost: 0,
          closed: 0,
          convPct: 0,
          lastTouch: 0,
        });
      }

      const s = map.get(tcmId)!;
      s.leads += 1;
      if (r.probability >= 70) s.hot += 1;
      s.visits += r.visits.length;
      if (r.booked) {
        s.booked += 1;
        s.closed += r.bookings[0]?.amount ?? 0;
      }
      if (r.status === "lost") s.lost += 1;
      if (r.lastTouchTs > s.lastTouch) s.lastTouch = r.lastTouchTs;
    });

    return Array.from(map.values())
      .map((s) => ({
        ...s,
        convPct: s.leads > 0 ? Math.round((s.booked / s.leads) * 100) : 0,
      }))
      .sort((a, b) => b.leads - a.leads);
  }, [rows]);

  const cols = [
    { key: "name", label: "TCM" },
    { key: "zone", label: "Zone" },
    { key: "leads", label: "Leads" },
    { key: "hot", label: "Hot" },
    { key: "visits", label: "Visits" },
    { key: "booked", label: "Booked" },
    { key: "lost", label: "Lost" },
    { key: "closed", label: "₹ Closed" },
    { key: "convPct", label: "Conv %" },
    { key: "lastTouch", label: "Last Touch" },
  ] as const;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">People 360</h1>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
        <div className="p-8 text-center text-muted-foreground animate-pulse">
          Loading TCM performance from MongoDB…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">People 360</h1>
          <p className="text-sm text-muted-foreground">Error</p>
        </div>
        <div className="p-8 text-center text-destructive">Failed to load. Check backend connection.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">People 360</h1>
        <p className="text-sm text-muted-foreground">Live TCM performance — every lead, visit, and booking from MongoDB</p>
      </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Total TCMs", value: stats.filter((s) => s.id !== "unassigned").length },
          { label: "Total Leads", value: rows.length },
          { label: "Total Booked", value: stats.reduce((s, r) => s + r.booked, 0) },
          {
            label: "₹ Closed",
            value: `₹${(stats.reduce((s, r) => s + r.closed, 0) / 100_000).toFixed(1)}L`,
          },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-xl font-display font-semibold text-accent">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {cols.map((c) => (
                <th key={c.key} className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wider">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2">
                  <Link
                    to="/admin/leads"
                    search={{ tcm: row.id }}
                    className="text-accent hover:underline font-medium"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.zone}</td>
                <td className="px-3 py-2 font-mono">{row.leads}</td>
                <td className="px-3 py-2">
                  <span className={row.hot > 0 ? "text-accent font-mono" : "text-muted-foreground font-mono"}>
                    {row.hot}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono">{row.visits}</td>
                <td className="px-3 py-2 font-mono text-success">{row.booked}</td>
                <td className="px-3 py-2 font-mono text-destructive">{row.lost}</td>
                <td className="px-3 py-2 font-mono">₹{Number(row.closed).toLocaleString("en-IN")}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      row.convPct >= 30
                        ? "text-success font-mono"
                        : row.convPct >= 10
                        ? "text-warning font-mono"
                        : "text-muted-foreground font-mono"
                    }
                  >
                    {row.convPct}%
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.lastTouch > 0
                    ? new Date(row.lastTouch).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                    : "—"}
                </td>
              </tr>
            ))}
            {!stats.length && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-8 text-center text-muted-foreground">
                  No TCMs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
