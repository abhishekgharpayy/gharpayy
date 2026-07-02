import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { useAuthUser } from "@/lib/auth-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Search, UserPlus, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/hr/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const user = useAuthUser((s) => s.user);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["hr-onboarding"],
    queryFn: () => api.hr.onboarding(),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: () => api.hr.employees(),
  });

  const completeMutation = useMutation({
    mutationFn: (vars: { planId: string; taskId: string }) =>
      api.command({
        _id: crypto.randomUUID(),
        type: "cmd.onboarding.complete_task",
        payload: { planId: vars.planId, taskId: vars.taskId },
      }),
    onSuccess: () => {
      toast.success("Task marked as complete");
      queryClient.invalidateQueries({ queryKey: ["hr-onboarding"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to complete task"),
  });

  const filtered = plans.filter((p) =>
    p.employeeName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Onboarding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign and track new hire onboarding plans.
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
            <AssignPlanDialog open={isAssignOpen} onOpenChange={setIsAssignOpen} employees={employees} />
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-y-auto pb-6">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            Loading plans...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            No onboarding plans found.
          </div>
        ) : (
          filtered.map((plan) => {
            const completedCount = plan.tasks.filter((t: any) => t.status === "completed").length;
            const progress = (completedCount / plan.tasks.length) * 100;

            return (
              <div key={plan._id} className="border border-border rounded-xl bg-card p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{plan.employeeName}</h3>
                    <p className="text-xs text-muted-foreground">Started {format(new Date(plan.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{completedCount} / {plan.tasks.length}</div>
                    <div className="text-xs text-muted-foreground">Tasks Completed</div>
                  </div>
                </div>

                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>

                <div className="space-y-2 mt-4">
                  {plan.tasks.map((task: any) => (
                    <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                      <button
                        onClick={() => {
                          if (task.status !== "completed") {
                            completeMutation.mutate({ planId: plan._id, taskId: task.id });
                          }
                        }}
                        disabled={task.status === "completed" || completeMutation.isPending}
                        className="mt-0.5 shrink-0"
                      >
                        {task.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                          {task.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</div>
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                        Due: {format(new Date(task.dueDate), "MMM d")}
                      </div>
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

const DEFAULT_TASKS = [
  { id: "1", title: "Sign Contract", description: "Review and sign the employment agreement.", daysOffset: 1 },
  { id: "2", title: "Submit Documents", description: "Upload ID proof and tax forms.", daysOffset: 2 },
  { id: "3", title: "IT Setup", description: "Setup email, slack, and requested software.", daysOffset: 3 },
  { id: "4", title: "Meet the Team", description: "Schedule a 1:1 with your manager and team.", daysOffset: 5 },
];

function AssignPlanDialog({ open, onOpenChange, employees }: { open: boolean, onOpenChange: (o: boolean) => void, employees: any[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    if (!employeeId) return toast.error("Select an employee");
    setBusy(true);
    try {
      const now = new Date();
      const tasks = DEFAULT_TASKS.map(t => {
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + t.daysOffset);
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          dueDate: dueDate.toISOString(),
        };
      });

      await api.command({
        _id: crypto.randomUUID(),
        type: "cmd.onboarding.assign",
        payload: {
          employeeId,
          tasks,
        },
      });
      toast.success("Onboarding plan assigned");
      onOpenChange(false);
      setEmployeeId("");
      queryClient.invalidateQueries({ queryKey: ["hr-onboarding"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to assign plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" /> Assign Plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Onboarding Plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">New Employee</label>
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
            <p className="text-xs text-muted-foreground mt-1">
              This will assign the standard 4-step onboarding checklist to the employee.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !employeeId}>
            {busy ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
