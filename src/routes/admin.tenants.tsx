import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import { api } from "@/lib/api/client";
import { useAuthUser, isLocalMode } from "@/lib/auth-store";
import { useApp } from "@/lib/store";
import { useLiveSupremeMetrics } from "@/admin/lib/use-live-supreme";
import { Users, AlertTriangle, TrendingDown, Clock, Building2, CheckCircle2, ShieldAlert, ArrowUpRight, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function TenantsLayout() {
  const { location } = useRouterState();
  const isExact = location.pathname === "/admin/tenants";
  if (isExact) return <TenantControlTower />;
  return <Outlet />;
}

export const Route = createFileRoute("/admin/tenants")({
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
  const queryClient = useQueryClient();

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

  const supremeData = useLiveSupremeMetrics();

  const isLoading = !localMode && (loadingTenants || loadingPayments);

  const rawTenantsBase = localMode ? appState.tenants : (tenantsData?.items ?? []);
  
  // Inject Impact Queue (booked leads)
  const impactTenants = useMemo(() => {
    if (!supremeData?.rawData?.leads) return [];
    return supremeData.rawData.leads
      .filter((l: any) => l.stage === "booked")
      .map((l: any) => {
        const booking = supremeData.rawData.bookings?.find((b: any) => b.leadId === (l._id || l.id));
        const prop = supremeData.rawData.properties?.find((p: any) => p._id === booking?.propertyId || p.id === booking?.propertyId);
        
        return {
          id: l._id || l.id,
          name: l.name || l.fullName || "Impact Queue Lead",
          phone: l.phone || "N/A",
          status: "active",
          rent: booking?.amount || l.budget || 0,
          propertyName: prop?.name || l.preferredArea || "Unassigned",
          propertyId: "impact_queue",
          createdAt: l.createdAt || new Date().toISOString(),
        };
      });
  }, [supremeData]);

  const rawTenants = [...impactTenants, ...rawTenantsBase];
  const rawPayments = localMode ? appState.payments : (paymentsData?.items ?? []);
  const rawProperties = localMode ? appState.properties : (propertiesData?.items ?? []);

  const stats = useMemo(() => {
    return rawTenants.map((t) => {
      const prop = rawProperties.find(p => p.id === t.propertyId || p._id === t.propertyId);
      // Give Impact Queue tenants a perfect score since they just arrived
      const healthScore = t.propertyId === "impact_queue" ? 100 : calculateHealthScore(t, rawPayments);
      
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
        propertyName: t.propertyId === "impact_queue" ? t.propertyName : (prop?.name || "Unassigned"),
        healthScore,
        healthGrade,
        healthColor,
        isLate,
        openRentAmount,
        moveOutDate: t.moveOutDate,
        createdAt: t.createdAt,
        isImpactLead: t.propertyId === "impact_queue",
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
    <div className="space-y-6 w-full px-4 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-semibold flex items-center gap-2">
            <Users className="w-8 h-8 text-primary" />
            Tenant Control Tower
          </h1>
          <p className="text-muted-foreground">Monitor tenant health, catch delinquencies, and manage move-outs.</p>
        </div>
        <div className="relative w-full md:w-auto flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search name, phone, or property..." 
              className="pl-9 bg-card border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <AddTenantModal onAdded={() => queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] })} />
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
                    <button 
                      onClick={() => {
                        if (s.isImpactLead) {
                          useApp.getState().selectLead(s.id);
                        } else {
                          toast.info("Full tenant profiles coming soon!");
                        }
                      }}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                    >
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

function AddTenantModal({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", phone: "", rent: "", propertyName: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) return toast.error("Name and Phone are required.");
    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        phone: formData.phone,
        rent: Number(formData.rent) || 0,
        propertyId: "unassigned",
        propertyName: formData.propertyName || "Unassigned",
        status: "active",
        createdAt: new Date().toISOString(),
      };
      await api.tenants.create(payload);
      toast.success("Tenant added successfully!");
      setOpen(false);
      setFormData({ name: "", phone: "", rent: "", propertyName: "" });
      onAdded();
    } catch (err) {
      toast.error("Failed to add tenant.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9">
          <Plus className="w-4 h-4 mr-2" />
          Add Tenant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Tenant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Full Name</label>
            <Input
              required
              placeholder="e.g. Rahul Sharma"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
            <Input
              required
              placeholder="e.g. +91 9876543210"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Monthly Rent (₹)</label>
            <Input
              type="number"
              placeholder="e.g. 15000"
              value={formData.rent}
              onChange={(e) => setFormData({ ...formData, rent: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Property Name</label>
            <Input
              placeholder="e.g. Gharpayy Villa"
              value={formData.propertyName}
              onChange={(e) => setFormData({ ...formData, propertyName: e.target.value })}
            />
          </div>
          <div className="pt-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Adding..." : "Add Tenant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
