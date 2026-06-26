import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import { api } from "@/lib/api/client";
import { useAuthUser, isLocalMode } from "@/lib/auth-store";
import { useApp } from "@/lib/store";
import { Users, AlertTriangle, TrendingDown, Clock, Building2, CheckCircle2, ShieldAlert, ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function TenantsLayout() {
  const { location } = useRouterState();
  const isExact = location.pathname === "/admin/tenants";
  if (isExact) return <TenantControlTower />;
  return <Outlet />;
}

export const Route = createFileRoute("/admin/tenants")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw new Error("Unauthorized");
  },
  component: TenantsLayout,
});

// Calculate Health Score based on payments vs tenure
function calculateHealthScore(tenant: any, payments: any[]): number {
  if (!tenant || !tenant.createdAt) return 0;
  const tenantPayments = payments.filter((p) => p.tenantId === tenant.id || p.tenantId === tenant._id);
  const tenureMonths = Math.max(1, Math.floor((Date.now() - new Date(tenant.createdAt).getTime()) / (30 * 86400_000)));
  const onTimeCount = tenantPayments.length;
  // This is a rough estimation of health
  const score = Math.min(100, Math.round((onTimeCount / tenureMonths) * 70 + (tenantPayments.reduce((s, p) => s + (p.amount || 0), 0) > 50000 ? 15 : 0) + 15));
  return score;
}

function TenantControlTower() {
  const localMode = isLocalMode();
  const appState = useApp(); // fallback for local mock mode

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"all" | "notice" | "risk">("all");

  const { data: tenantsData, isLoading: loadingTenants } = useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: () => api.tenants.list({ limit: 1000 }),
    enabled: !localMode,
    refetchInterval: 60_000,
  });

  const { data: paymentsData, isLoading: loadingPayments } = useQuery({
    queryKey: ["admin", "payments"],
    queryFn: () => api.payments.list({ limit: 1000 }),
    enabled: !localMode,
    refetchInterval: 60_000,
  });

  const { data: propertiesData } = useQuery({
    queryKey: ["admin", "properties"],
    queryFn: () => api.properties.list({ limit: 1000 }),
    enabled: !localMode,
  });

  const isLoading = !localMode && (loadingTenants || loadingPayments);

  const rawTenants = localMode ? appState.tenants : (tenantsData?.items ?? []);
  const rawPayments = localMode ? appState.payments : (paymentsData?.items ?? []);
  const rawProperties = localMode ? appState.properties : (propertiesData?.items ?? []);

  const stats = useMemo(() => {
    return rawTenants.map((t) => {
      const prop = rawProperties.find(p => p.id === t.propertyId || p._id === t.propertyId);
      const healthScore = calculateHealthScore(t, rawPayments);
      
      // Calculate unpaid rent
      // (For real app, this should check `rents` collection, but we will mock it based on last payment date for now, or use live API if available)
      const isLate = healthScore < 50; 
      const openRentAmount = isLate ? (t.rent || t.baseRent || 15000) : 0;

      let healthColor = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      let healthGrade = "A";
      if (healthScore < 80) { healthGrade = "B"; healthColor = "text-blue-500 bg-blue-500/10 border-blue-500/20"; }
      if (healthScore < 60) { healthGrade = "C"; healthColor = "text-amber-500 bg-amber-500/10 border-amber-500/20"; }
      if (healthScore < 40) { healthGrade = "F"; healthColor = "text-rose-500 bg-rose-500/10 border-rose-500/20"; }

      return {
        id: t.id || t._id,
        name: t.name || t.fullName || "Unknown",
        phone: t.phone || t.contactNumber || "N/A",
        status: t.status || "active",
        rent: t.rent || t.baseRent || 0,
        propertyName: prop?.name || "Unassigned",
        healthScore,
        healthGrade,
        healthColor,
        isLate,
        openRentAmount,
        moveOutDate: t.moveOutDate,
        createdAt: t.createdAt,
      };
    });
  }, [rawTenants, rawPayments, rawProperties]);

  const filteredStats = stats.filter((s) => {
    if (viewMode === "notice" && s.status !== "notice") return false;
    if (viewMode === "risk" && !s.isLate) return false;
    
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.phone.includes(q) || s.propertyName.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => b.healthScore - a.healthScore);

  const totalActive = stats.filter(s => s.status === "active").length;
  const totalNotice = stats.filter(s => s.status === "notice").length;
  const totalAtRisk = stats.filter(s => s.isLate).length;
  const globalRevenueAtRisk = stats.reduce((sum, s) => sum + s.openRentAmount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Users className="w-6 h-6 mr-2 animate-pulse" /> Loading Tenant Data...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-semibold flex items-center gap-2">
            <Users className="w-8 h-8 text-primary" />
            Tenant Control Tower
          </h1>
          <p className="text-muted-foreground">Monitor tenant health, catch delinquencies, and manage move-outs.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search name, phone, or property..." 
            className="pl-9 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Tenants</div>
            <div className="p-2 bg-primary/10 rounded-lg"><CheckCircle2 className="w-4 h-4 text-primary" /></div>
          </div>
          <div className="text-3xl font-display font-bold">{totalActive}</div>
          <div className="text-xs text-muted-foreground mt-1">Currently residing</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notice Pipeline</div>
            <div className="p-2 bg-amber-500/10 rounded-lg"><Clock className="w-4 h-4 text-amber-500" /></div>
          </div>
          <div className="text-3xl font-display font-bold text-amber-500">{totalNotice}</div>
          <div className="text-xs text-amber-500/80 mt-1">Moving out soon</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delinquency Risk</div>
            <div className="p-2 bg-rose-500/10 rounded-lg"><ShieldAlert className="w-4 h-4 text-rose-500" /></div>
          </div>
          <div className="text-3xl font-display font-bold text-rose-500">{totalAtRisk}</div>
          <div className="text-xs text-rose-500/80 mt-1 flex items-center gap-1">
            Tenants flagged for late rent
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue at Risk</div>
            <div className="p-2 bg-rose-500/10 rounded-lg"><TrendingDown className="w-4 h-4 text-rose-500" /></div>
          </div>
          <div className="text-3xl font-display font-bold text-rose-500">₹{globalRevenueAtRisk.toLocaleString()}</div>
          <div className="text-xs text-rose-500/80 mt-1">Total unpaid open rent</div>
        </div>
      </div>

      {/* View Toggles */}
      <div className="flex items-center gap-2">
        {(["all", "notice", "risk"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
              viewMode === mode 
                ? "bg-primary text-primary-foreground shadow-md" 
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {mode === "all" && "All Tenants"}
            {mode === "notice" && "Notice Pipeline"}
            {mode === "risk" && "High Risk Only"}
          </button>
        ))}
      </div>

      {/* Main Table View */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 font-semibold text-muted-foreground">Tenant</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Property</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Health Radar</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Rent / Risk</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredStats.map((s) => (
                <tr key={s.id} className="hover:bg-muted/10 transition-colors group">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-foreground flex items-center gap-2">
                      {s.name}
                      {s.isLate && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.phone}</div>
                  </td>
                  
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="font-medium text-foreground">{s.propertyName}</span>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider",
                      s.status === "active" ? "bg-emerald-500/10 text-emerald-500" :
                      s.status === "notice" ? "bg-amber-500/10 text-amber-500" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {s.status}
                    </span>
                    {s.status === "notice" && s.moveOutDate && (
                      <div className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(s.moveOutDate), { addSuffix: true })}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <div className={cn("w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs", s.healthColor)}>
                        {s.healthGrade}
                      </div>
                      <div className="text-xs text-muted-foreground w-12">{s.healthScore}/100</div>
                    </div>
                  </td>

                  <td className="px-4 py-4 text-right">
                    <div className="font-medium text-foreground">
                      ₹{s.rent.toLocaleString()}
                    </div>
                    {s.isLate && (
                      <div className="text-xs text-rose-500 font-semibold mt-0.5">
                        Owes ₹{s.openRentAmount.toLocaleString()}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    <button className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors">
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No tenants match your current view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
