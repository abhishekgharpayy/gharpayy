import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { dispatch } from "@/lib/api/command-bus";
import { useApp } from "@/lib/store";
import type { Lead } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { QUICKAD_NEED_OPTIONS, QUICKAD_ROOM_OPTIONS, QUICKAD_TYPE_OPTIONS } from "@/lib/quickad-shared";

export function EditLeadDialog({ open, onOpenChange, lead }: { open: boolean, onOpenChange: (open: boolean) => void, lead: Lead }) {
  const updateLead = useApp((s: any) => s.updateLead);
  const [submitting, setSubmitting] = useState(false);
  
  const [draft, setDraft] = useState({
    name: lead.name,
    phone: lead.phone,
    email: lead.email || "",
    budget: lead.budgetText || lead.budget?.toString() || "",
    moveInDate: lead.moveInDate || "",
    preferredArea: lead.preferredArea || "",
    type: lead.type || "",
    room: lead.room || "",
    need: lead.need || "",
    inBLR: lead.inBLR === undefined ? "" : lead.inBLR === null ? "unknown" : lead.inBLR ? "yes" : "no",
    quality: lead.quality || "",
  });

  useEffect(() => {
    if (open) {
      setDraft({
        name: lead.name,
        phone: lead.phone,
        email: lead.email || "",
        budget: lead.budgetText || lead.budget?.toString() || "",
        moveInDate: lead.moveInDate || "",
        preferredArea: lead.preferredArea || "",
        type: lead.type || "",
        room: lead.room || "",
        need: lead.need || "",
        inBLR: lead.inBLR === undefined ? "" : lead.inBLR === null ? "unknown" : lead.inBLR ? "yes" : "no",
        quality: lead.quality || "",
      });
    }
  }, [open, lead]);

  const save = async () => {
    if (!draft.name.trim() || !draft.phone.trim()) {
      toast.error("Name and Phone are required");
      return;
    }
    
    setSubmitting(true);
    try {
      const budgetNum = parseInt(draft.budget.replace(/\D/g, "")) || 0;
      const inBLRVal = draft.inBLR === "unknown" || draft.inBLR === "" ? null : draft.inBLR === "yes";
      
      const patch = {
        name: draft.name,
        phone: draft.phone,
        email: draft.email,
        budget: budgetNum,
        budgetText: draft.budget,
        moveInDate: draft.moveInDate,
        preferredArea: draft.preferredArea,
        type: draft.type,
        room: draft.room,
        need: draft.need,
        inBLR: inBLRVal,
        quality: (draft.quality || null) as any,
      };

      const result = await dispatch({
        type: "cmd.lead.update",
        payload: {
          leadId: lead.id,
          patch,
        }
      });
      
      if (!result.ok) throw new Error(result.error);
      
      updateLead(lead.id, patch);
      toast.success("Lead updated");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update lead");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-card border-border">
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20">
          <DialogTitle className="text-lg font-semibold text-primary">Edit Lead Info</DialogTitle>
        </DialogHeader>
        
        <div className="p-6 overflow-y-auto max-h-[70vh] grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Full Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({...draft, name: e.target.value})} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Phone</Label>
            <Input value={draft.phone} onChange={(e) => setDraft({...draft, phone: e.target.value})} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Email</Label>
            <Input value={draft.email} onChange={(e) => setDraft({...draft, email: e.target.value})} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Area</Label>
            <Input value={draft.preferredArea} onChange={(e) => setDraft({...draft, preferredArea: e.target.value})} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Budget</Label>
            <Input value={draft.budget} onChange={(e) => setDraft({...draft, budget: e.target.value})} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Move-in Date</Label>
            <Input type="date" value={draft.moveInDate} onChange={(e) => setDraft({...draft, moveInDate: e.target.value})} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Type</Label>
            <Select value={draft.type} onValueChange={(v) => setDraft({...draft, type: v})}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {QUICKAD_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Room Need</Label>
            <Select value={draft.room} onValueChange={(v) => setDraft({...draft, room: v})}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {QUICKAD_ROOM_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Gender Need</Label>
            <Select value={draft.need} onValueChange={(v) => setDraft({...draft, need: v})}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {QUICKAD_NEED_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">In Bangalore</Label>
            <Select value={draft.inBLR} onValueChange={(v) => setDraft({...draft, inBLR: v})}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Quality</Label>
            <Select value={draft.quality} onValueChange={(v) => setDraft({...draft, quality: v})}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hot">🔥 Hot</SelectItem>
                <SelectItem value="good">✅ Good</SelectItem>
                <SelectItem value="bad">❌ Bad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/10">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={submitting} className="min-w-24">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
