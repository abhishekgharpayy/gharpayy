import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { useAuthUser } from "@/lib/auth-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Search, BookOpen, CheckCircle2, FilePlus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/hr/policies")({
  component: PoliciesPage,
});

function PoliciesPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const user = useAuthUser((s) => s.user);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["hr-policies"],
    queryFn: () => api.hr.policies(),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (vars: { policyId: string }) =>
      api.command({
        _id: Math.random().toString(36).substring(7),
        type: "cmd.policy.acknowledge",
        payload: { policyId: vars.policyId, employeeId: user?.id! },
      }),
    onSuccess: () => {
      toast.success("Policy acknowledged");
      queryClient.invalidateQueries({ queryKey: ["hr-policies"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to acknowledge policy"),
  });

  const filtered = policies.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Policies & Handbooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Company guidelines and required acknowledgements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search policies..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {(user?.role === "hr" || user?.role === "super_admin") && (
            <PublishPolicyDialog open={isPublishOpen} onOpenChange={setIsPublishOpen} />
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto pb-6">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            Loading policies...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            No active policies found.
          </div>
        ) : (
          filtered.map((policy) => {
            const hasAcknowledged = policy.acknowledgedBy?.includes(user?.id);
            const effectiveDateStr = format(new Date(policy.effectiveDate), "MMM d, yyyy");
            
            return (
              <div key={policy._id} className="border border-border rounded-xl bg-card p-5 shadow-sm space-y-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm line-clamp-1" title={policy.title}>{policy.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Effective: {effectiveDateStr}</div>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground line-clamp-3 flex-1">
                  {policy.description}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
                  <Button variant="outline" size="sm" asChild>
                    <a href={policy.pdfUrl} target="_blank" rel="noreferrer">Read PDF</a>
                  </Button>
                  
                  {hasAcknowledged ? (
                    <Badge variant="secondary" className="bg-success/20 text-success gap-1 hover:bg-success/20">
                      <CheckCircle2 className="h-3 w-3" /> Acknowledged
                    </Badge>
                  ) : (
                    <Button 
                      size="sm" 
                      onClick={() => acknowledgeMutation.mutate({ policyId: policy._id })}
                      disabled={acknowledgeMutation.isPending}
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PublishPolicyDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    if (!title || !description || !pdfUrl || !effectiveDate) return toast.error("Fill all fields");
    setBusy(true);
    try {
      await api.command({
        _id: Math.random().toString(36).substring(7),
        type: "cmd.policy.publish",
        payload: {
          title,
          description,
          pdfUrl,
          effectiveDate,
        },
      });
      toast.success("Policy published");
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setPdfUrl("");
      setEffectiveDate("");
      queryClient.invalidateQueries({ queryKey: ["hr-policies"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to publish policy");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <FilePlus className="h-4 w-4" /> Publish Policy
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish New Policy</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">Policy Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Remote Work Policy 2026" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Description</label>
            <textarea 
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Brief summary of the policy..." 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Effective Date</label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">PDF Document URL</label>
              <Input type="url" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title || !description || !pdfUrl || !effectiveDate}>
            {busy ? "Publishing..." : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
