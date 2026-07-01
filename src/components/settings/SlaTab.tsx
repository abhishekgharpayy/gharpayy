import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SlaTab() {
  const [ghostAlert, setGhostAlert] = useState("6");
  const [firstResponse, setFirstResponse] = useState("1");
  const [postTour, setPostTour] = useState("24");

  const handleSave = () => {
    alert("SLA Policies saved globally!");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Global SLA Policies</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure when the system triggers alerts and God Mode breach warnings.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border p-4 bg-card">
        <div className="grid gap-2">
          <label className="text-sm font-medium">Ghost Follow-up Alert (hours)</label>
          <input 
            type="number" 
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={ghostAlert}
            onChange={(e) => setGhostAlert(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">Hours after a visit completes before flagging as "Ghost follow-up".</p>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">First Response SLA (hours)</label>
          <input 
            type="number" 
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={firstResponse}
            onChange={(e) => setFirstResponse(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">Hours allowed before a new lead must be contacted.</p>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Post-Tour SLA (hours)</label>
          <input 
            type="number" 
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={postTour}
            onChange={(e) => setPostTour(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">Hours allowed before a tour outcome must be logged.</p>
        </div>
      </div>

      <Button onClick={handleSave}>Save SLA Policies</Button>
    </div>
  );
}
