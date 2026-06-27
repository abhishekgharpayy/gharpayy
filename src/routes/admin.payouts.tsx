import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useAuthUser } from "@/lib/auth-store";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, Search, Building2, TrendingUp, IndianRupee, ArrowRightCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/payouts")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  component: AdminPayouts,
});

function AdminPayouts() {
  const [data, setData] = useState<{
    owners: Record<string, any>;
    properties: Record<string, any>;
    payments: any[];
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  useEffect(() => {
    async function load() {
      try {
        // Fetch properties, users(owners), and payments
        // We'll use existing endpoints
        const [propRes, payRes] = await Promise.all([
          api.properties.list(), // Needs properties API
          api.payments.list({ limit: 10000, type: "rent", status: "paid" }),
        ]);
        
        const propertiesMap = new Map();
        (propRes || []).forEach((p: any) => propertiesMap.set(p.id, p));
        
        setData({
          owners: {}, 
          properties: Object.fromEntries(propertiesMap),
          payments: (payRes as any).items || []
        });
      } catch (err) {
        console.error("Failed to load payouts data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const payoutSummary = useMemo(() => {
    if (!data) return [];
    
    // Group payments by property
    const propTotals = new Map<string, number>();
    for (const p of data.payments) {
      if (p.status !== "paid") continue;
      const amount = Number(p.amount || 0);
      const propName = p.propertyName || "Unknown Property";
      propTotals.set(propName, (propTotals.get(propName) || 0) + amount);
    }
    
    // Calculate commission (10%) and payout (90%)
    const results = [];
    for (const [propName, totalRent] of propTotals.entries()) {
      const commission = totalRent * 0.10;
      const payout = totalRent - commission;
      results.push({
        propertyName: propName,
        ownerName: "Platform Managed", // In a real system, mapped via ownerId
        totalRent,
        commission,
        payout,
      });
    }
    
    return results.sort((a, b) => b.totalRent - a.totalRent);
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return payoutSummary;
    const s = search.toLowerCase();
    return payoutSummary.filter(p => p.propertyName.toLowerCase().includes(s) || p.ownerName.toLowerCase().includes(s));
  }, [payoutSummary, search]);

  const totals = payoutSummary.reduce((acc, row) => {
    acc.rent += row.totalRent;
    acc.commission += row.commission;
    acc.payout += row.payout;
    return acc;
  }, { rent: 0, commission: 0, payout: 0 });

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading Financial Data...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Owner Payouts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automated revenue splitting and settlement forecasting. (Commission: 10%)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20 shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-primary mb-2">
              <IndianRupee className="h-5 w-5" />
              <h3 className="font-semibold">Gross Rent Collected</h3>
            </div>
            <div className="text-3xl font-bold">₹{totals.rent.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-success/5 border-success/20 shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-success mb-2">
              <TrendingUp className="h-5 w-5" />
              <h3 className="font-semibold">Gharpayy Commission</h3>
            </div>
            <div className="text-3xl font-bold">₹{totals.commission.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/5 border-amber-500/20 shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-amber-500 mb-2">
              <Building2 className="h-5 w-5" />
              <h3 className="font-semibold">Net Owner Payouts</h3>
            </div>
            <div className="text-3xl font-bold">₹{totals.payout.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border">
        <div className="p-4 border-b border-border flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              className="pl-9 h-9" 
              placeholder="Search by property or owner..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 text-muted-foreground border-b border-border">
              <tr>
                <th className="p-4 font-semibold">Property Name</th>
                <th className="p-4 font-semibold">Owner</th>
                <th className="p-4 font-semibold text-right">Rent Collected</th>
                <th className="p-4 font-semibold text-right">Commission (10%)</th>
                <th className="p-4 font-semibold text-right">Net Payout</th>
                <th className="p-4 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="p-4 font-medium">{row.propertyName}</td>
                  <td className="p-4 text-muted-foreground">{row.ownerName}</td>
                  <td className="p-4 text-right font-mono">₹{row.totalRent.toLocaleString("en-IN")}</td>
                  <td className="p-4 text-right font-mono text-success">₹{row.commission.toLocaleString("en-IN")}</td>
                  <td className="p-4 text-right font-mono text-amber-500 font-semibold">₹{row.payout.toLocaleString("en-IN")}</td>
                  <td className="p-4 text-right">
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 font-medium rounded-full">Pending</Badge>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">No payout records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
