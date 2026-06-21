import { createFileRoute, redirect } from "@tanstack/react-router";
import { useApp } from "@/lib/store";
import { useAuthUser } from "@/lib/auth-store";
import { useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, ComposedChart } from "recharts";
import { IndianRupee, TrendingUp, AlertCircle, Percent, CheckCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { normalizeLeadRecord } from "@/lib/lead-helpers";
import { useState, useEffect } from "react";
import type { Lead } from "@/lib/types";

export const Route = createFileRoute("/admin/revenue")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  component: AdminRevenue,
});

const COLORS = {
  primary: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  muted: "#94a3b8",
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);
}

function AdminRevenue() {
  const app = useApp();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await api.leads.list({ limit: 2000 });
        setLeads((res.items as any[]).map(l => normalizeLeadRecord(l)));
      } catch (err) {
        console.error("Failed to fetch leads for revenue", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const data = useMemo(() => {
    let totalExpected = 0;
    let totalPotential = 0;
    let totalRealized = 0;
    
    // Group by stage
    const stageMap: Record<string, { stage: string, potential: number, expected: number, realized: number, count: number }> = {
      "new": { stage: "New", potential: 0, expected: 0, realized: 0, count: 0 },
      "contacted": { stage: "Contacted", potential: 0, expected: 0, realized: 0, count: 0 },
      "tour-scheduled": { stage: "Tour Scheduled", potential: 0, expected: 0, realized: 0, count: 0 },
      "on-tour": { stage: "On Tour", potential: 0, expected: 0, realized: 0, count: 0 },
      "tour-done": { stage: "Tour Done", potential: 0, expected: 0, realized: 0, count: 0 },
      "negotiation": { stage: "Negotiation", potential: 0, expected: 0, realized: 0, count: 0 },
      "quote-sent": { stage: "Quote Sent", potential: 0, expected: 0, realized: 0, count: 0 },
      "booked": { stage: "Booked", potential: 0, expected: 0, realized: 0, count: 0 },
    };

    // Calculate per lead
    leads.forEach(l => {
      const budget = l.budget || 0;
      const conf = (l.confidence || 0) / 100;
      const expected = budget * conf;
      
      totalPotential += budget;
      
      if (l.stage === "booked") {
        totalRealized += budget;
        totalExpected += budget;
      } else if (l.stage !== "dropped") {
        totalExpected += expected;
      }

      if (stageMap[l.stage]) {
        stageMap[l.stage].count++;
        stageMap[l.stage].potential += budget;
        stageMap[l.stage].expected += expected;
        if (l.stage === "booked") stageMap[l.stage].realized += budget;
      }
    });

    const funnelData = Object.values(stageMap).filter(s => s.count > 0);
    
    // Calculate Monthly Trend (Mocked based on leads creation date for demo)
    const months: Record<string, { name: string, expected: number, realized: number }> = {};
    leads.forEach(l => {
       const d = new Date(l.createdAt);
       const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`;
       if (!months[key]) months[key] = { name: key, expected: 0, realized: 0 };
       
       const budget = l.budget || 0;
       const conf = (l.confidence || 0) / 100;
       if (l.stage === "booked") {
           months[key].realized += budget;
       } else if (l.stage !== "dropped") {
           months[key].expected += (budget * conf);
       }
    });

    const trendData = Object.values(months).sort((a,b) => a.name.localeCompare(b.name));

    return { totalExpected, totalPotential, totalRealized, funnelData, trendData };
  }, [leads]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Computing revenue forecasts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Revenue Forecasting</h1>
        <p className="text-muted-foreground mt-1">Predictive analysis based on pipeline confidence & deal stage.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Potential</span>
            <div className="p-2 rounded-full bg-blue-500/10 text-blue-500">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-4xl font-bold text-foreground">{formatCurrency(data.totalPotential)}</div>
            <p className="text-sm text-muted-foreground mt-1">Maximum pipeline value</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between border-t-4 border-t-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Expected Revenue</span>
            <div className="p-2 rounded-full bg-amber-500/10 text-amber-500">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-4xl font-bold text-foreground">{formatCurrency(data.totalExpected)}</div>
            <p className="text-sm text-muted-foreground mt-1">Weighted by confidence scores</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between border-t-4 border-t-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Realized Revenue</span>
            <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-4xl font-bold text-emerald-500">{formatCurrency(data.totalRealized)}</div>
            <p className="text-sm text-muted-foreground mt-1">From successfully booked deals</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border/50 bg-muted/20">
            <h3 className="font-semibold text-lg flex items-center gap-2 uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="w-5 h-5" /> Pipeline Funnel Breakdown
            </h3>
          </div>
          <div className="p-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.funnelData} layout="vertical" margin={{ left: 40, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.muted} opacity={0.2} />
                <XAxis type="number" tickFormatter={(val) => `₹${val/1000}k`} />
                <YAxis dataKey="stage" type="category" width={100} tick={{ fill: COLORS.muted }} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                <Legend />
                <Bar dataKey="potential" name="Potential Value" fill={COLORS.primary} radius={[0, 4, 4, 0]} opacity={0.3} />
                <Bar dataKey="expected" name="Expected Value" fill={COLORS.warning} radius={[0, 4, 4, 0]} />
                <Bar dataKey="realized" name="Realized Value" fill={COLORS.success} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border/50 bg-muted/20">
            <h3 className="font-semibold text-lg flex items-center gap-2 uppercase tracking-wide text-muted-foreground">
              <Percent className="w-5 h-5" /> Revenue Trend (Expected vs Realized)
            </h3>
          </div>
          <div className="p-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.muted} opacity={0.2} />
                <XAxis dataKey="name" tick={{ fill: COLORS.muted }} />
                <YAxis tickFormatter={(val) => `₹${val/1000}k`} tick={{ fill: COLORS.muted }} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Area type="monotone" dataKey="expected" name="Expected" stroke={COLORS.warning} fill={COLORS.warning} fillOpacity={0.1} />
                <Area type="monotone" dataKey="realized" name="Realized" stroke={COLORS.success} fill={COLORS.success} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
