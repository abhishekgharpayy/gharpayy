import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ShieldAlert, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/dlq")({
  component: AdminDlqPage,
});

function AdminDlqPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dlq"],
    queryFn: async () => {
      // Create a temporary fetch since this endpoint isn't fully typed in client.ts
      const res = await fetch("/api/admin/dlq", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load DLQ");
      return res.json() as Promise<{ items: any[]; total: number }>;
    },
    refetchInterval: 10000,
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/dlq/${id}/retry`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to retry job");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Job queued for retry");
      queryClient.invalidateQueries({ queryKey: ["admin-dlq"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <div className="p-8 text-muted-foreground animate-pulse">Loading Dead Letter Queue...</div>;
  }

  const items = data?.items || [];
  const total = data?.total || 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center gap-4 border-b border-border pb-6">
        <div className="p-3 bg-red-500/10 rounded-xl">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Dead Letter Queue</h1>
          <p className="text-muted-foreground mt-1">
            {total} failed background jobs awaiting manual intervention.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="border border-border/50 border-dashed rounded-2xl p-12 text-center bg-card">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-foreground">All clear!</h3>
          <p className="text-muted-foreground">The dead letter queue is currently empty.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((job) => (
            <div key={job._id} className="border border-red-900/30 bg-red-950/10 rounded-xl p-5 hover:bg-red-950/20 transition-colors">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="destructive" className="font-mono">{job.queue || "unknown queue"}</Badge>
                    <Badge variant="outline" className="font-mono text-xs">{job.eventType || job.name}</Badge>
                    <span className="text-xs text-muted-foreground font-mono bg-background/50 px-2 py-1 rounded">ID: {job._id}</span>
                  </div>
                  
                  <div className="bg-background/80 rounded-lg p-3 font-mono text-xs text-red-400 overflow-x-auto border border-red-900/30">
                    {job.error?.message || "Unknown error"}
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium pt-2">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Failed at: {new Date(job.failedAt).toLocaleString()}</span>
                    <span>Attempts: {job.attemptsMade}</span>
                  </div>
                </div>
                
                <div className="flex-shrink-0">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => retryMutation.mutate(job._id)}
                    disabled={retryMutation.isPending}
                    className="border-red-800/50 hover:bg-red-900/30 text-red-300"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
                    Retry Job
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
