import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { useAuthUser } from "@/lib/auth-store";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Fingerprint, Clock, Search } from "lucide-react";
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

  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["hr-attendance", currentMonth],
    queryFn: () => api.hr.attendance({ month: currentMonth }),
  });

  const punchMutation = useMutation({
    mutationFn: () => api.hr.punchAttendance(),
    onSuccess: (data) => {
      toast.success(`Successfully punched in/out. Hours: ${data.workHours}`);
      queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to punch attendance");
    }
  });

  const filtered = attendance.filter((a) =>
    a.employeeName.toLowerCase().includes(search.toLowerCase())
  );

  // Check if current user has checked in today and not checked out
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const myTodayRecord = attendance.find(a => a.employeeId === user?.id && a.date === todayStr);
  const isPunchedIn = myTodayRecord && myTodayRecord.checkIn && !myTodayRecord.checkOut;

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
          <Button 
            className="gap-2"
            variant={isPunchedIn ? "destructive" : "default"}
            onClick={() => punchMutation.mutate()}
            disabled={punchMutation.isPending}
          >
            <Fingerprint className="h-4 w-4" /> 
            {punchMutation.isPending ? "Punching..." : isPunchedIn ? "Check Out" : "Check In"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-sm text-muted-foreground font-medium mb-1">Today's Check-ins</div>
          <div className="text-2xl font-bold">
            {attendance.filter(a => a.date === todayStr && a.checkIn).length}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-sm text-muted-foreground font-medium mb-1">On Leave Today</div>
          <div className="text-2xl font-bold">
            {attendance.filter(a => a.date === todayStr && a.status === "on-leave").length}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-sm text-muted-foreground font-medium mb-1">My Monthly Hours</div>
          <div className="text-2xl font-bold">
            {attendance
              .filter(a => a.employeeId === user?.id)
              .reduce((acc, curr) => acc + curr.workHours, 0)
              .toFixed(1)}h
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  Loading attendance...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
