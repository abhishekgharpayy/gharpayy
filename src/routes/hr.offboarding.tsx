import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { useAuthUser } from "@/lib/auth-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Search, LogOut, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/hr/offboarding")({
  component: OffboardingPage,
});

function OffboardingPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const [isInitiateOpen, setIsInitiateOpen] = useState(false);
  const user = useAuthUser((s) => s.user);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["hr-offboarding"],
    queryFn: () => api.hr.offboarding(),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: () => api.hr.employees(),
  });

  const completeMutation = useMutation({
    mutationFn: (vars: { workflowId: string; taskId: string }) =>
      api.command({
        _id: Math.random().toString(36).substring(7),
        type: "cmd.offboarding.complete_task",
        payload: { workflowId: vars.workflowId, taskId: vars.taskId },
      }),
    onSuccess: () => {
      toast.success("Exit task marked as complete");
      queryClient.invalidateQueries({ queryKey: ["hr-offboarding"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to complete task"),
  });

  const filtered = workflows.filter((w) =>
    w.employeeName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Offboarding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage employee exits, asset returns, and final settlements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {(user?.role === "hr" || user?.role === "super_admin") && (
            <InitiateOffboardingDialog open={isInitiateOpen} onOpenChange={setIsInitiateOpen} employees={employees} />
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-y-auto pb-6">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            Loading workflows...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            No active offboarding workflows.
          </div>
        ) : (
          filtered.map((workflow) => {
            const completedCount = workflow.tasks.filter((t: any) => t.status === "completed").length;
            const progress = (completedCount / workflow.tasks.length) * 100;
            const isFullyComplete = completedCount === workflow.tasks.length;

            return (
              <div key={workflow._id} className={`border ${isFullyComplete ? 'border-success/50 bg-success/5' : 'border-border bg-card'} rounded-xl p-5 shadow-sm space-y-4 transition-colors`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      {workflow.employeeName}
                      {isFullyComplete && <Badge variant="secondary" className="bg-success/20 text-success text-[10px]">Exited</Badge>}
                    </h3>
                    <p className="text-xs text-destructive flex items-center gap-1 mt-1 font-medium">
                      <AlertTriangle className="h-3 w-3" /> Last Day: {format(new Date(workflow.lastWorkingDay), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{completedCount} / {workflow.tasks.length}</div>
                    <div className="text-xs text-muted-foreground">Clearance Tasks</div>
                  </div>
                </div>

                <div className="text-sm bg-muted/50 p-2 rounded text-muted-foreground italic mb-2">
                  Reason: {workflow.reason}
                </div>

                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${isFullyComplete ? 'bg-success' : 'bg-destructive/80'}`} style={{ width: `${progress}%` }} />
                </div>

                <div className="space-y-2 mt-4">
                  {workflow.tasks.map((task: any) => (
                    <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-background">
                      <button
                        onClick={() => {
                          if (task.status !== "completed") {
                            completeMutation.mutate({ workflowId: workflow._id, taskId: task.id });
                          }
                        }}
                        disabled={task.status === "completed" || completeMutation.isPending}
                        className="shrink-0"
                      >
                        {task.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground hover:text-destructive transition-colors" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                          {task.title}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {task.department}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const DEFAULT_EXIT_TASKS = [
  { id: "1", title: "Collect Laptop & ID Card", department: "IT & Admin" },
  { id: "2", title: "Revoke System Access", department: "IT" },
  { id: "3", title: "Conduct Exit Interview", department: "HR" },
  { id: "4", title: "Process Full & Final Settlement", department: "Finance" },
];

function InitiateOffboardingDialog({ open, onOpenChange, employees }: { open: boolean, onOpenChange: (o: boolean) => void, employees: any[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    if (!employeeId || !lastWorkingDay || !reason) return toast.error("Fill all fields");
    setBusy(true);
    try {
      await api.command({
        _id: Math.random().toString(36).substring(7),
        type: "cmd.offboarding.initiate",
        payload: {
          employeeId,
          lastWorkingDay,
          reason,
          tasks: DEFAULT_EXIT_TASKS,
        },
      });
      toast.success("Offboarding initiated");
      onOpenChange(false);
      setEmployeeId("");
      setLastWorkingDay("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["hr-offboarding"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to initiate offboarding");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2" variant="destructive">
          <LogOut className="h-4 w-4" /> Initiate Exit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">Initiate Offboarding</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">Employee Resigning/Exiting</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Last Working Day</label>
            <Input type="date" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Reason for Exit</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Better opportunity, Relocation" />
          </div>
          <div className="p-3 bg-muted/50 rounded-lg border border-border">
            <p className="text-xs font-medium mb-2">Standard Clearance Tasks that will be assigned:</p>
            <ul className="text-[10px] text-muted-foreground list-disc list-inside space-y-1">
              {DEFAULT_EXIT_TASKS.map(t => (
                <li key={t.id}>{t.title} ({t.department})</li>
              ))}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !employeeId || !lastWorkingDay || !reason} variant="destructive">
            {busy ? "Initiating..." : "Confirm Exit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
