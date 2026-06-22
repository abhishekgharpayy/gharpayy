import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { IndianRupee, CheckCircle, Clock, AlertTriangle, Plus, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuthUser } from "@/lib/auth-store";

export const Route = createFileRoute("/admin/rents")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw new Error("Unauthorized");
  },
  component: AdminRents,
});

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString("en-IN", { year: "numeric", month: "short" });
}

function AdminRents() {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [statusFilter, setStatusFilter] = useState("all");
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordForm, setRecordForm] = useState({
    tenantId: "",
    tenantName: "",
    month: currentMonth(),
    amount: 0,
    method: "" as "" | "UPI" | "Cash" | "Bank" | "Card",
    ref: "",
    notes: "",
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["payments", "stats"],
    queryFn: () => api.payments.stats(),
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ["payments", "list", selectedMonth, statusFilter],
    queryFn: () =>
      api.payments.list({
        month: selectedMonth,
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        limit: 200,
      }),
  });

  const { data: tenantsData } = useQuery({
    queryKey: ["tenants", "list"],
    queryFn: () => api.tenants.list({ status: "active", limit: 200 }),
  });

  const payments = paymentsData?.items ?? [];
  const tenants = tenantsData?.items ?? [];

  const filtered = useMemo(() => {
    return payments.sort((a: any, b: any) => {
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (b.status === "overdue" && a.status !== "overdue") return 1;
      if (a.status === "pending" && b.status === "paid") return -1;
      if (b.status === "pending" && a.status === "paid") return 1;
      return (b.tenantName ?? "").localeCompare(a.tenantName ?? "");
    });
  }, [payments]);

  const recordMutation = useMutation({
    mutationFn: (input: typeof recordForm) =>
      api.payments.record({
        tenantId: input.tenantId,
        tenantName: input.tenantName,
        month: input.month,
        amount: input.amount,
        method: (input.method || null) as any,
        ref: input.ref || null,
        notes: input.notes,
        paidAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      setRecordOpen(false);
      setRecordForm({ tenantId: "", tenantName: "", month: currentMonth(), amount: 0, method: "", ref: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ id, method }: { id: string; method: string }) =>
      api.payments.update(id, { status: "paid", method, paidAt: new Date().toISOString() }),
    onSuccess: () => {
      toast.success("Marked as paid");
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateMutation = useMutation({
    mutationFn: (month: string) => api.payments.generateRents(month),
    onSuccess: (data) => {
      toast.success(`Generated ${data.generated} rent records for ${data.total} active tenants`);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.payments.remove(id),
    onSuccess: () => {
      toast.success("Payment deleted");
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const monthOptions = useMemo(() => {
    const months: string[] = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      d.setMonth(d.getMonth() - 1);
    }
    return months;
  }, []);

  const openRecordForTenant = (tenant: any) => {
    setRecordForm({
      tenantId: tenant._id,
      tenantName: tenant.name,
      month: selectedMonth,
      amount: tenant.rent,
      method: "",
      ref: "",
      notes: "",
    });
    setRecordOpen(true);
  };

  const totalExpected = stats?.totalExpected ?? 0;
  const totalCollected = stats?.totalCollected ?? 0;
  const collectionRate = stats?.collectionRate ?? 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <IndianRupee size={20} className="text-accent" /> Rent Collection
        </h1>
        <p className="text-xs text-muted-foreground">Track rent payments, generate monthly ledgers, and monitor collection rates</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Expected", value: `₹${(totalExpected / 1000).toFixed(1)}K`, icon: IndianRupee, color: "text-foreground" },
          { label: "Collected", value: `₹${(totalCollected / 1000).toFixed(1)}K`, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Collection %", value: `${collectionRate}%`, icon: RefreshCw, color: collectionRate >= 80 ? "text-emerald-400" : collectionRate >= 50 ? "text-amber-400" : "text-destructive" },
          { label: "Pending", value: stats?.pendingCount ?? 0, icon: Clock, color: "text-amber-400" },
          { label: "Overdue", value: stats?.overdueCount ?? 0, icon: AlertTriangle, color: "text-destructive" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <k.icon size={10} /> {k.label}
            </div>
            <div className={`text-xl font-display font-semibold ${k.color}`}>
              {statsLoading ? "..." : k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">{formatMonth(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          {["all", "pending", "paid", "overdue"].map((s) => (
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

        <div className="flex-1" />

        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1"
          onClick={() => generateMutation.mutate(selectedMonth)}
          disabled={generateMutation.isPending}
        >
          <RefreshCw size={12} className={generateMutation.isPending ? "animate-spin" : ""} />
          Generate Rents
        </Button>

        <Button size="sm" className="text-xs gap-1" onClick={() => {
          setRecordForm({ tenantId: "", tenantName: "", month: selectedMonth, amount: 0, method: "", ref: "", notes: "" });
          setRecordOpen(true);
        }}>
          <Plus size={12} /> Record Payment
        </Button>
      </div>

      {/* Collection rate bar */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Collection Rate — {formatMonth(selectedMonth)}</span>
          <span className="text-xs font-mono font-medium">{collectionRate}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, collectionRate)}%`,
              background: collectionRate >= 80 ? "#10b981" : collectionRate >= 50 ? "#f59e0b" : "#ef4444",
            }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>₹{totalCollected.toLocaleString("en-IN")} collected</span>
          <span>₹{totalExpected.toLocaleString("en-IN")} expected</span>
        </div>
      </div>

      {/* Payment table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">Tenant</TableHead>
                <TableHead className="text-muted-foreground">Month</TableHead>
                <TableHead className="text-right text-muted-foreground">Amount</TableHead>
                <TableHead className="text-muted-foreground">Method</TableHead>
                <TableHead className="text-muted-foreground">Ref</TableHead>
                <TableHead className="text-center text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentsLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No payments for this month. Click "Generate Rents" to create monthly rent records.
                </TableCell></TableRow>
              ) : (
                filtered.map((p: any) => (
                  <TableRow key={p.id} className="border-border/50">
                    <TableCell className="font-medium">{p.tenantName}</TableCell>
                    <TableCell className="text-muted-foreground">{formatMonth(p.month)}</TableCell>
                    <TableCell className="text-right font-mono">₹{p.amount.toLocaleString("en-IN")}</TableCell>
                    <TableCell>{p.method ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[120px]">{p.ref || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={p.status === "paid" ? "default" : p.status === "overdue" ? "destructive" : "secondary"} className="text-[10px]">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status !== "paid" && (
                        <div className="flex gap-1 justify-end">
                          {(["UPI", "Cash", "Bank", "Card"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => markPaidMutation.mutate({ id: p.id, method: m })}
                              className="text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                              title={`Mark paid via ${m}`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Quick-add tenants without payments this month */}
      {tenants.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Active tenants without rent record for {formatMonth(selectedMonth)}
          </div>
          <div className="flex flex-wrap gap-2">
            {tenants
              .filter((t: any) => !payments.find((p: any) => p.tenantId === t._id))
              .map((t: any) => (
                <button
                  key={t._id}
                  onClick={() => openRecordForTenant(t)}
                  className="text-[10px] px-2.5 py-1 rounded-full border border-dashed border-border hover:border-accent hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t.name} — ₹{t.rent.toLocaleString("en-IN")}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Record Payment Dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Log a rent or deposit payment for a tenant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!recordForm.tenantId && (
              <div>
                <Label className="text-xs">Tenant</Label>
                <Select
                  value={recordForm.tenantId}
                  onValueChange={(val) => {
                    const t = tenants.find((x: any) => x._id === val);
                    if (t) setRecordForm({ ...recordForm, tenantId: t._id, tenantName: t.name, amount: t.rent });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                  <SelectContent>
                    {tenants.map((t: any) => (
                      <SelectItem key={t._id} value={t._id} className="text-xs">{t.name} — ₹{t.rent.toLocaleString("en-IN")}/mo</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {recordForm.tenantId && (
              <div className="rounded-md bg-muted/20 px-3 py-2 text-xs">
                <span className="font-medium">{recordForm.tenantName}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Month</Label>
                <Input value={recordForm.month} onChange={(e) => setRecordForm({ ...recordForm, month: e.target.value })} placeholder="YYYY-MM" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Amount (₹)</Label>
                <Input type="number" value={recordForm.amount || ""} onChange={(e) => setRecordForm({ ...recordForm, amount: parseInt(e.target.value, 10) || 0 })} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Method</Label>
                <Select value={recordForm.method} onValueChange={(v) => setRecordForm({ ...recordForm, method: v as any })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["UPI", "Cash", "Bank", "Card"].map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Reference</Label>
                <Input value={recordForm.ref} onChange={(e) => setRecordForm({ ...recordForm, ref: e.target.value })} placeholder="UPI txn ID / cash receipt" className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={recordForm.notes} onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })} placeholder="Optional notes" className="h-8 text-xs" />
            </div>
            <Button
              className="w-full text-xs"
              onClick={() => recordMutation.mutate(recordForm)}
              disabled={recordMutation.isPending || !recordForm.tenantId || !recordForm.amount}
            >
              {recordMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
