import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus, Search, Mail, Phone, Calendar, FileText, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/hr/hiring")({
  component: HiringPage,
});

const STAGES = [
  { id: "applied", label: "Applied", color: "bg-muted" },
  { id: "screening", label: "Screening", color: "bg-info/20 text-info" },
  { id: "interview", label: "Interview", color: "bg-warning/20 text-warning-foreground" },
  { id: "offer", label: "Offer Extended", color: "bg-accent/20 text-accent" },
  { id: "hired", label: "Hired", color: "bg-success/20 text-success" },
  { id: "rejected", label: "Rejected", color: "bg-destructive/20 text-destructive" },
];

function HiringPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["hr-candidates"],
    queryFn: () => api.hr.candidates(),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; patch: any }) => api.hr.updateCandidate(vars.id, vars.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr-candidates"] }),
    onError: (err: any) => toast.error(err.message || "Failed to update candidate")
  });

  const changeStage = (id: string, newStage: string) => {
    // Optimistic update
    queryClient.setQueryData(["hr-candidates"], (old: any[]) => 
      old.map(c => c._id === id ? { ...c, stage: newStage } : c)
    );
    updateMutation.mutate({ id, patch: { stage: newStage } });
  };

  const filtered = candidates.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.roleAppliedFor.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Applicant Tracking</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your hiring pipeline and candidates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search candidates..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <AddCandidateDialog open={isAddOpen} onOpenChange={setIsAddOpen} />
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading pipeline...</div>
      ) : (
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const columnCands = filtered.filter(c => c.stage === stage.id);
            return (
              <div key={stage.id} className="flex-shrink-0 w-80 flex flex-col bg-muted/30 rounded-xl border border-border">
                <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${stage.color.split(' ')[0]}`} />
                    {stage.label}
                  </div>
                  <Badge variant="secondary" className="text-xs">{columnCands.length}</Badge>
                </div>
                
                <div className="flex-1 p-3 overflow-y-auto space-y-3 min-h-[200px]">
                  {columnCands.map((c) => (
                    <div
                      key={c._id}
                      className="bg-card border border-border rounded-lg p-3 shadow-sm group hover:border-primary/50"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-medium text-sm leading-tight truncate">{c.name}</div>
                      </div>
                      <div className="text-xs text-muted-foreground font-medium mb-3 truncate">
                        {c.roleAppliedFor}
                      </div>
                      
                      <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
                        {c.email && <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> <span className="truncate">{c.email}</span></div>}
                        {c.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {c.phone}</div>}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(c.createdAt), "MMM d")}
                        </div>
                        {c.resumeUrl && (
                          <a href={c.resumeUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline flex items-center gap-1 text-xs">
                            <FileText className="h-3 w-3" /> CV
                          </a>
                        )}
                      </div>

                      {/* Move to next stage dropdown */}
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground">Move to:</span>
                        <select 
                          className="bg-transparent text-xs outline-none border border-border rounded p-1 w-full"
                          value={c.stage}
                          onChange={(e) => changeStage(c._id, e.target.value)}
                        >
                          {STAGES.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                  {columnCands.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground mt-10">No candidates in this stage</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddCandidateDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", roleAppliedFor: "", resumeUrl: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    if (!form.name || !form.email || !form.roleAppliedFor) return toast.error("Name, email, and role are required");
    setBusy(true);
    try {
      await api.hr.addCandidate(form);
      toast.success("Candidate added successfully");
      onOpenChange(false);
      setForm({ name: "", email: "", phone: "", roleAppliedFor: "", resumeUrl: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["hr-candidates"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to add candidate");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" /> Add Candidate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Full Name</label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Role Applied For</label>
              <Input value={form.roleAppliedFor} onChange={e => setForm({...form, roleAppliedFor: e.target.value})} placeholder="Frontend Engineer" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Phone</label>
              <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+91 9876543210" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Resume URL</label>
            <Input type="url" value={form.resumeUrl} onChange={e => setForm({...form, resumeUrl: e.target.value})} placeholder="https://linkedin.com/..." />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Notes</label>
            <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Source, expectations..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !form.name || !form.email || !form.roleAppliedFor}>
            {busy ? "Adding..." : "Add Candidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
