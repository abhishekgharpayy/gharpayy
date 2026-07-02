import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { useAuthUser } from "@/lib/auth-store";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Fingerprint, Clock, Search, Pencil, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/hr/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const [search, setSearch] = useState("");
  const user = useAuthUser((s) => s.user);
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [overrideData, setOverrideData] = useState<any>(null);

  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["hr-attendance", currentMonth],
    queryFn: () => api.hr.attendance({ month: currentMonth }),
  });

  const filtered = attendance.filter((a) =>
    a.employeeName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Attendance & Shifts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track daily check-ins, work hours, and availability.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input 
            type="month" 
            value={currentMonth}
            onChange={(e) => setCurrentMonth(e.target.value)}
            className="w-40"
          />
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employee..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-sm text-muted-foreground font-medium mb-1">Today's Check-ins</div>
          <div className="text-2xl font-bold">
            {attendance.filter(a => {
              const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
              return a.date === todayStr && a.checkIn;
            }).length}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-sm text-muted-foreground font-medium mb-1">On Leave Today</div>
          <div className="text-2xl font-bold">
            {attendance.filter(a => {
              const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
              return a.date === todayStr && a.status === "on-leave";
            }).length}
          </div>
        </div>

      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Check In</TableHead>
              <TableHead>Check Out</TableHead>
              <TableHead>Work Hours</TableHead>
              <TableHead>Status</TableHead>
              {(user?.role === "hr" || user?.role === "super_admin") && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                  Loading attendance...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                  No records found for this month.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => (
                <TableRow key={a._id}>
                  <TableCell className="font-medium text-sm">
                    {format(new Date(a.date), "MMM dd, yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{a.employeeName}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.checkIn ? format(new Date(a.checkIn), "hh:mm a") : "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.checkOut ? format(new Date(a.checkOut), "hh:mm a") : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-mono text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {a.workHours.toFixed(1)}h
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        a.status === "present" ? "default" : 
                        a.status === "absent" ? "destructive" : 
                        "secondary"
                      }
                      className={a.status === "present" ? "bg-success hover:bg-success" : ""}
                    >
                      {a.status.replace("-", " ")}
                    </Badge>
                  </TableCell>
                  {(user?.role === "hr" || user?.role === "super_admin") && (
                    <TableCell className="text-right">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() => setOverrideData(a)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <OverrideAttendanceDialog 
        open={!!overrideData} 
        onOpenChange={(o) => !o && setOverrideData(null)} 
        record={overrideData} 
      />
    </div>
  );
}

function OverrideAttendanceDialog({ open, onOpenChange, record }: { open: boolean, onOpenChange: (o: boolean) => void, record: any }) {
  const [form, setForm] = useState({ status: "present", checkIn: "", checkOut: "" });
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  // Load record data into form
  import("react").then(React => {
    React.useEffect(() => {
      if (record) {
        setForm({
          status: record.status || "present",
          checkIn: record.checkIn ? new Date(record.checkIn).toISOString().slice(0, 16) : "",
          checkOut: record.checkOut ? new Date(record.checkOut).toISOString().slice(0, 16) : "",
        });
      }
    }, [record]);
  });

  const submit = async () => {
    if (!record) return;
    setBusy(true);
    try {
      await api.hr.updateAttendance(record._id, {
        status: form.status,
        checkIn: form.checkIn ? new Date(form.checkIn).toISOString() : null,
        checkOut: form.checkOut ? new Date(form.checkOut).toISOString() : null,
      });
      toast.success("Attendance updated successfully");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update attendance");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override Attendance</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">Status</label>
            <select 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={form.status} 
              onChange={e => setForm({...form, status: e.target.value})}
            >
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="half-day">Half Day</option>
              <option value="late">Late</option>
              <option value="on-leave">On Leave</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Check In</label>
              <Input type="datetime-local" value={form.checkIn} onChange={e => setForm({...form, checkIn: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Check Out</label>
              <Input type="datetime-local" value={form.checkOut} onChange={e => setForm({...form, checkOut: e.target.value})} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
