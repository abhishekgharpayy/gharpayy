import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

function AgreementsLayout() {
  const { location } = useRouterState();
  const isExact = location.pathname === "/admin/agreements";
  if (isExact) return <AgreementsList />;
  return <Outlet />;
}

export const Route = createFileRoute("/admin/agreements")({
  component: AgreementsLayout,
});

function AgreementsList() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    bookingId: "", leadId: "", tenantName: "", tenantPhone: "",
    propertyName: "", propertyAddress: "", roomNumber: "",
    rent: 0, deposit: 0, moveInDate: "", duration: 11, noticePeriod: 30,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["agreements", search],
    queryFn: () => api.agreements.list({ search: search || undefined }),
  });

  const { data: bookings } = useQuery({
    queryKey: ["bookings", "list"],
    queryFn: () => api.bookings.list({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: () => api.agreements.create(form),
    onSuccess: () => {
      toast.success("Agreement created");
      setCreateOpen(false);
      setForm({ bookingId: "", leadId: "", tenantName: "", tenantPhone: "", propertyName: "", propertyAddress: "", roomNumber: "", rent: 0, deposit: 0, moveInDate: "", duration: 11, noticePeriod: 30 });
      queryClient.invalidateQueries({ queryKey: ["agreements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = data?.items ?? [];

  const fillFromBooking = (bookingId: string) => {
    const b = (bookings?.items ?? []).find((x: any) => x._id === bookingId) as any;
    if (b) {
      setForm({
        bookingId: b._id,
        leadId: b.leadId || "",
        tenantName: b.tenantName || "",
        tenantPhone: b.tenantPhone || "",
        propertyName: b.propertyName || b.inventory?.propertyName || "",
        propertyAddress: "",
        roomNumber: b.roomNumber || b.inventory?.roomNumber || "",
        rent: b.amount || 0,
        deposit: b.deposit || 0,
        moveInDate: b.moveInDate || b.moveIn?.date || "",
        duration: b.moveIn?.stayMonths || 11,
        noticePeriod: b.moveIn?.noticeDays || 30,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <FileText size={20} className="text-accent" /> Rental Agreements
          </h1>
          <p className="text-xs text-muted-foreground">Generate, edit, and manage digital rental agreements</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New Agreement
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by tenant or property..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs pl-7" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">Tenant</TableHead>
                <TableHead className="text-muted-foreground">Property</TableHead>
                <TableHead className="text-right text-muted-foreground">Rent</TableHead>
                <TableHead className="text-right text-muted-foreground">Deposit</TableHead>
                <TableHead className="text-center text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Created</TableHead>
                <TableHead className="text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No agreements yet. Create one from a booking.</TableCell></TableRow>
              ) : (
                items.map((a: any) => (
                  <TableRow key={a.id} className="border-border/50">
                    <TableCell className="font-medium">{a.tenantName}</TableCell>
                    <TableCell className="text-muted-foreground">{a.propertyName}</TableCell>
                    <TableCell className="text-right font-mono">₹{a.rent.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right font-mono">₹{a.deposit.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={a.status === "signed" ? "default" : a.status === "sent" ? "secondary" : "outline"} className="text-[10px]">
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to="/admin/agreements/$id" params={{ id: a.id }}>
                        <Button size="sm" variant="ghost" className="h-7 text-[10px]">
                          <FileText size={12} className="mr-1" /> Open
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Rental Agreement</DialogTitle>
            <DialogDescription>Pre-fill from a confirmed booking or enter manually</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Pre-fill from booking</Label>
              <select
                value={form.bookingId}
                onChange={(e) => fillFromBooking(e.target.value)}
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="">Select booking</option>
                {(bookings?.items ?? []).map((b: any) => (
                  <option key={b._id} value={b._id}>{b.tenantName} — {b.propertyName}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Tenant Name</Label><Input value={form.tenantName} onChange={(e) => setForm({...form, tenantName: e.target.value})} className="h-8 text-xs" /></div>
              <div><Label className="text-xs">Tenant Phone</Label><Input value={form.tenantPhone} onChange={(e) => setForm({...form, tenantPhone: e.target.value})} className="h-8 text-xs" /></div>
            </div>
            <div><Label className="text-xs">Property Name</Label><Input value={form.propertyName} onChange={(e) => setForm({...form, propertyName: e.target.value})} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Property Address</Label><Input value={form.propertyAddress} onChange={(e) => setForm({...form, propertyAddress: e.target.value})} className="h-8 text-xs" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Room / Unit</Label><Input value={form.roomNumber} onChange={(e) => setForm({...form, roomNumber: e.target.value})} className="h-8 text-xs" /></div>
              <div><Label className="text-xs">Move-in Date</Label><Input type="date" value={form.moveInDate} onChange={(e) => setForm({...form, moveInDate: e.target.value})} className="h-8 text-xs" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Rent (₹)</Label><Input type="number" value={form.rent || ""} onChange={(e) => setForm({...form, rent: parseInt(e.target.value) || 0})} className="h-8 text-xs" /></div>
              <div><Label className="text-xs">Deposit (₹)</Label><Input type="number" value={form.deposit || ""} onChange={(e) => setForm({...form, deposit: parseInt(e.target.value) || 0})} className="h-8 text-xs" /></div>
              <div><Label className="text-xs">Duration (mo)</Label><Input type="number" value={form.duration} onChange={(e) => setForm({...form, duration: parseInt(e.target.value) || 11})} className="h-8 text-xs" /></div>
            </div>
            <div><Label className="text-xs">Notice Period (days)</Label><Input type="number" value={form.noticePeriod} onChange={(e) => setForm({...form, noticePeriod: parseInt(e.target.value) || 30})} className="h-8 text-xs" /></div>
            <Button className="w-full text-xs" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.tenantName || !form.propertyName}>
              {createMutation.isPending ? "Creating..." : "Create Agreement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
