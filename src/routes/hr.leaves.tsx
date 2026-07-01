import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { useAuthUser } from "@/lib/auth-store";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarPlus, Search, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import type { LeaveEntity } from "@/contracts";

export const Route = createFileRoute("/hr/leaves")({
  component: LeavesPage,
});

function LeavesPage() {
  const [search, setSearch] = useState("");
  const user = useAuthUser((s) => s.user);
  const queryClient = useQueryClient();
  const [isRequestOpen, setIsRequestOpen] = useState(false);

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ["hr-leaves"],
    queryFn: () => api.hr.leaves(),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; patch: { status: string; managerNote?: string } }) => 
      api.hr.updateLeave(vars.id, vars.patch),
    onSuccess: () => {
      toast.success("Leave status updated");
      queryClient.invalidateQueries({ queryKey: ["hr-leaves"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update leave");
    }
  });

  const filtered = leaves.filter((l) =>
    l.employeeName.toLowerCase().includes(search.toLowerCase()) ||
    l.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Leave Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and manage employee time-off requests.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or type..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <RequestLeaveDialog open={isRequestOpen} onOpenChange={setIsRequestOpen} />
        </div>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Employee</TableHead>
              <TableHead>Leave Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                  Loading leaves...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                  No leaves found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l) => (
                <TableRow key={l._id}>
                  <TableCell>
                    <div className="font-medium">{l.employeeName}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {l.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(l.startDate), "MMM d")} - {format(new Date(l.endDate), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{l.days}</TableCell>
                  <TableCell>
                    <div className="text-xs truncate max-w-[200px]" title={l.reason}>
                      {l.reason}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}
                      className={l.status === "approved" ? "bg-success hover:bg-success" : ""}
                    >
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {l.status === "pending" && (user?.role === "hr" || user?.role === "super_admin") && (
                        <>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-success hover:text-success hover:bg-success/10"
                            onClick={() => updateMutation.mutate({ id: l._id, patch: { status: "approved" } })}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              const note = window.prompt("Reason for rejection?");
                              if (note !== null) {
                                updateMutation.mutate({ id: l._id, patch: { status: "rejected", managerNote: note } });
                              }
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {l.status === "pending" && l.employeeId === user?.id && (
                         <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (window.confirm("Are you sure you want to cancel this leave request?")) {
                              updateMutation.mutate({ id: l._id, patch: { status: "cancelled" } });
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RequestLeaveDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const [type, setType] = useState("casual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    if (!startDate || !endDate || !reason) return toast.error("Please fill all fields");
    setBusy(true);
    try {
      await api.hr.requestLeave({
        type,
        startDate,
        endDate,
        days: parseFloat(days),
        reason
      });
      toast.success("Leave requested successfully");
      onOpenChange(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["hr-leaves"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to request leave");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <CalendarPlus className="h-4 w-4" /> Apply Leave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Time Off</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">Leave Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Casual Leave</SelectItem>
                <SelectItem value="sick">Sick Leave</SelectItem>
                <SelectItem value="earned">Earned Leave</SelectItem>
                <SelectItem value="unpaid">Unpaid Leave (LWP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Start Date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">End Date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Total Days</label>
            <Input type="number" step="0.5" min="0.5" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Reason</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Provide a brief reason..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !startDate || !endDate || !reason}>
            {busy ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
