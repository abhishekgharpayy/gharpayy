import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Star, MessageSquarePlus, MessageCircle, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/hr/reviews")({
  component: ReviewsPage,
});

function ReviewsPage() {
  const [cycle, setCycle] = useState("Q3 2026");
  const queryClient = useQueryClient();
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["hr-reviews", cycle],
    queryFn: () => api.hr.reviews({ cycle }),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: () => api.hr.employees(),
  });

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Performance & 360 Reviews</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track performance, peer feedback, and self-evaluations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input 
            placeholder="Review Cycle (e.g. Q3 2026)" 
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            className="w-48"
          />
          <SubmitReviewDialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen} employees={employees} defaultCycle={cycle} />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-3 text-center py-12 text-muted-foreground">Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-muted-foreground">No reviews submitted for {cycle} yet.</div>
        ) : (
          reviews.map(review => (
            <div key={review._id} className="border border-border rounded-xl bg-card p-4 space-y-4 shadow-sm flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">{review.employeeName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Reviewed by {review.reviewerName}</div>
                </div>
                <Badge variant="secondary" className="capitalize text-[10px]">{review.type} Review</Badge>
              </div>

              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(star => (
                  <Star key={star} className={`h-4 w-4 ${star <= review.rating ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`} />
                ))}
                <span className="text-xs font-medium ml-2">{review.rating}/5</span>
              </div>

              <div className="text-sm bg-muted/30 p-3 rounded-lg flex-1 relative group">
                <MessageCircle className="h-4 w-4 absolute top-3 right-3 text-muted-foreground/30" />
                <div className="text-muted-foreground line-clamp-4 group-hover:line-clamp-none transition-all pr-6">
                  "{review.feedback}"
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground text-right pt-2 border-t border-border">
                Submitted {format(new Date(review.createdAt), "MMM d, yyyy")}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SubmitReviewDialog({ open, onOpenChange, employees, defaultCycle }: { open: boolean, onOpenChange: (o: boolean) => void, employees: any[], defaultCycle: string }) {
  const [form, setForm] = useState({ employeeId: "", type: "peer", cycle: defaultCycle, rating: 3, feedback: "" });
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    if (!form.employeeId || !form.feedback) return toast.error("Employee and feedback are required");
    setBusy(true);
    try {
      const cmdType = form.type === "self" ? "cmd.review.submit_self" : "cmd.review.submit_manager";
      const payload: any = { cycleId: form.cycle, rating: form.rating, feedback: form.feedback };
      if (cmdType === "cmd.review.submit_manager") payload.employeeId = form.employeeId;

      await api.command({
        _id: Math.random().toString(36).substring(7),
        type: cmdType,
        payload
      });
      toast.success("Review submitted successfully");
      onOpenChange(false);
      setForm({ ...form, employeeId: "", feedback: "", rating: 3 });
      queryClient.invalidateQueries({ queryKey: ["hr-reviews"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to submit review");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <MessageSquarePlus className="h-4 w-4" /> Submit Review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Performance Review</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Employee</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={form.employeeId} 
                onChange={e => setForm({...form, employeeId: e.target.value})}
              >
                <option value="">Select Employee...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Review Type</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={form.type} 
                onChange={e => setForm({...form, type: e.target.value})}
              >
                <option value="self">Self Evaluation</option>
                <option value="peer">Peer Review</option>
                <option value="manager">Manager Review</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Cycle</label>
              <Input value={form.cycle} onChange={e => setForm({...form, cycle: e.target.value})} placeholder="Q3 2026" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Rating (1-5)</label>
              <Input type="number" min="1" max="5" value={form.rating} onChange={e => setForm({...form, rating: Number(e.target.value)})} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Feedback</label>
            <textarea 
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={form.feedback} 
              onChange={e => setForm({...form, feedback: e.target.value})} 
              placeholder="Provide constructive feedback..." 
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !form.employeeId || !form.feedback}>
            {busy ? "Submitting..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
