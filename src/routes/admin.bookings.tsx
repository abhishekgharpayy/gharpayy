import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminShell } from "@/admin/components/AdminShell";
import { useApp } from "@/lib/store";
import { useAuthUser } from "@/lib/auth-store";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/bookings")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw new Error("Unauthorized");
  },
  component: AdminBookings,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "border-amber-500/40 text-amber-400",
  approved: "border-blue-500/40 text-blue-400",
  active: "border-emerald-500/40 text-emerald-400",
  cancelled: "border-muted-foreground/30 text-muted-foreground",
  expired: "border-destructive/40 text-destructive",
};

function AdminBookings() {
  const { bookings, tenants, tcms, properties } = useApp();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const stats = useMemo(() => {
    const total = bookings.length;
    const active = bookings.filter((b) => b.status === "active").length;
    const pending = bookings.filter((b) => b.status === "pending" || b.status === "approved").length;
    const mrr = bookings.filter((b) => b.status === "active").reduce((s, b) => s + b.amount, 0);
    const depositTotal = bookings.filter((b) => b.status === "active").reduce((s, b) => s + b.deposit, 0);
    return { total, active, pending, mrr, depositTotal };
  }, [bookings]);

  const filtered = useMemo(() => {
    return bookings
      .filter((b) => statusFilter === "all" || b.status === statusFilter)
      .filter((b) => !search || b.tenantName.toLowerCase().includes(search.toLowerCase()) || b.tenantPhone.includes(search))
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [bookings, statusFilter, search]);

  const propName = (id: string) => properties.find((p) => p.id === id)?.name ?? id;
  const tcmName = (id: string) => tcms.find((t) => t.id === id)?.name ?? id;

  return (
    <AdminShell title="Bookings" sub="Manage booking lifecycle — from pending to active tenant">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total bookings", value: stats.total, accent: "text-foreground" },
          { label: "Active tenants", value: stats.active, accent: "text-emerald-400" },
          { label: "Pending approval", value: stats.pending, accent: "text-amber-400" },
          { label: "MRR", value: `₹${(stats.mrr / 1000).toFixed(1)}K`, accent: "text-emerald-400" },
          { label: "Total deposit", value: `₹${(stats.depositTotal / 1000).toFixed(1)}K`, accent: "text-blue-400" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className={`text-xl font-display font-semibold ${k.accent}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card mt-3">
        <div className="p-3 border-b border-border flex items-center gap-3 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="h-8 text-xs rounded-md border border-border bg-background px-2.5 w-64 outline-none focus:border-accent"
          />
          {["all", "active", "approved", "pending", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                statusFilter === s
                  ? "bg-accent text-accent-foreground border-accent"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Tenant</th>
                <th className="text-left px-3 py-2 font-medium">Property</th>
                <th className="text-left px-3 py-2 font-medium">TCM</th>
                <th className="text-right px-3 py-2 font-medium">Rent</th>
                <th className="text-right px-3 py-2 font-medium">Deposit</th>
                <th className="text-right px-3 py-2 font-medium">Status</th>
                <th className="text-right px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Link to="/admin/tenants" className="text-accent hover:underline font-medium">
                      {b.tenantName}
                    </Link>
                    <div className="text-muted-foreground">{b.tenantPhone}</div>
                  </td>
                  <td className="px-3 py-2">{propName(b.propertyId)}</td>
                  <td className="px-3 py-2">{tcmName(b.tcmId)}</td>
                  <td className="px-3 py-2 text-right font-mono">₹{b.amount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 text-right font-mono">₹{b.deposit.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] ${STATUS_STYLES[b.status] || ""}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {new Date(b.ts).toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No bookings found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
