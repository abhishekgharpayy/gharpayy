import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { useAuthUser } from "@/lib/auth-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Search, AlertCircle, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/hr/grievances")({
  component: GrievancesPage,
});

function GrievancesPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const [isRaiseOpen, setIsRaiseOpen] = useState(false);
  const user = useAuthUser((s) => s.user);

  const { data: grievances = [], isLoading } = useQuery({
    queryKey: ["hr-grievances"],
    queryFn: () => api.hr.grievances(),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { grievanceId: string; status: "open" | "investigating" | "resolved" | "dismissed"; hrNotes?: string }) =>
      api.command({
        _id: Math.random().toString(36).substring(7),
        type: "cmd.grievance.update_status",
        payload: vars,
      }),
    onSuccess: () => {
      toast.success("Grievance status updated");
      queryClient.invalidateQueries({ queryKey: ["hr-grievances"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to update grievance"),
  });

  const filtered = grievances.filter((g) =>
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    (g.employeeName && g.employeeName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Grievances</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Confidential reporting and dispute resolution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <RaiseGrievanceDialog open={isRaiseOpen} onOpenChange={setIsRaiseOpen} />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto pb-6">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            Loading grievances...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            No grievances found.
          </div>
        ) : (
          filtered.map((g) => (
            <div key={g._id} className="border border-border rounded-xl bg-card p-5 shadow-sm space-y-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${g.isAnonymous ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive'}`}>
                    {g.isAnonymous ? <ShieldAlert className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="font-semibold text-sm line-clamp-1" title={g.title}>{g.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {g.isAnonymous ? "Anonymous Submission" : g.employeeName}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize text-[10px]">
                  {g.category.replace('_', ' ')}
                </Badge>
                <Badge 
                  variant={g.status === "open" ? "destructive" : g.status === "investigating" ? "default" : "secondary"} 
                  className={`capitalize text-[10px] ${g.status === 'investigating' ? 'bg-orange-500 hover:bg-orange-500/90' : ''}`}
                >
                  {g.status}
                </Badge>
              </div>

              <div className="text-sm bg-muted/30 p-3 rounded-lg text-muted-foreground">
                {g.description}
              </div>

              {g.hrNotes && (
                <div className="text-xs bg-muted/50 p-2 rounded text-muted-foreground italic">
                  HR Note: {g.hrNotes}
                </div>
              )}

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                <div className="text-[10px] text-muted-foreground">
                  Raised {format(new Date(g.createdAt), "MMM d, yyyy")}
                </div>
                {(user?.role === "hr" || user?.role === "super_admin") && (g.status === "open" || g.status === "investigating") && (
                  <div className="flex items-center gap-2">
                    {g.status === "open" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => updateMutation.mutate({ grievanceId: g._id, status: "investigating" })}
                      >
                        Investigate
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-success hover:text-success hover:bg-success/20"
                      title="Resolve"
                      onClick={() => {
                        const note = window.prompt("Resolution notes?");
                        if (note !== null) {
                          updateMutation.mutate({ grievanceId: g._id, status: "resolved", hrNotes: note });
                        }
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/20"
                      title="Dismiss"
                      onClick={() => {
                        const note = window.prompt("Reason for dismissal?");
                        if (note !== null) {
                          updateMutation.mutate({ grievanceId: g._id, status: "dismissed", hrNotes: note });
                        }
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RaiseGrievanceDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("workplace_safety");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    if (!title || !description) return toast.error("Fill all required fields");
    setBusy(true);
    try {
      await api.command({
        _id: Math.random().toString(36).substring(7),
        type: "cmd.grievance.raise",
        payload: {
          title,
          description,
          category: category as any,
          isAnonymous,
        },
      });
      toast.success("Grievance submitted securely");
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setIsAnonymous(false);
      queryClient.invalidateQueries({ queryKey: ["hr-grievances"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to submit grievance");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2" variant="destructive">
          <AlertCircle className="h-4 w-4" /> Report Issue
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">Issue Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workplace_safety">Workplace Safety</SelectItem>
                <SelectItem value="harassment">Harassment</SelectItem>
                <SelectItem value="discrimination">Discrimination</SelectItem>
                <SelectItem value="payroll_issue">Payroll Issue</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary of the issue" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Description</label>
            <textarea 
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Please describe the incident in detail..." 
            />
          </div>
          <div className="flex items-center gap-2 mt-4 p-3 bg-muted/50 rounded-lg border border-border">
            <input 
              type="checkbox" 
              id="anon" 
              checked={isAnonymous} 
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="anon" className="text-sm font-medium cursor-pointer flex-1">
              Submit Anonymously
            </label>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </div>
          {isAnonymous && (
            <p className="text-[10px] text-muted-foreground text-center">
              Your identity will be completely hidden from HR. Note that this may limit their ability to investigate thoroughly.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title || !description} variant={isAnonymous ? "secondary" : "default"}>
            {busy ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
