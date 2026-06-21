import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BusinessConfigTab() {
  const [openingTime, setOpeningTime] = useState("09:00");
  const [closingTime, setClosingTime] = useState("20:00");

  const handleSave = () => {
    alert("Business Configuration saved!");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Business Configuration</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your organization's core details and operating hours.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border p-4 bg-card">
        <h3 className="text-sm font-semibold border-b pb-2">Branding</h3>
        <div className="grid gap-2">
          <label className="text-sm font-medium">Company Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/50">
              <span className="text-xs text-muted-foreground">Upload</span>
            </div>
            <Button variant="outline" size="sm">Choose File</Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Recommended size: 256x256px. PNG or SVG.</p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border p-4 bg-card">
        <h3 className="text-sm font-semibold border-b pb-2">Operating Hours</h3>
        <p className="text-xs text-muted-foreground mb-3">Auto-assignment will only route leads to TCMs during these hours.</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Opening Time</label>
            <input 
              type="time" 
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={openingTime}
              onChange={(e) => setOpeningTime(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Closing Time</label>
            <input 
              type="time" 
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={closingTime}
              onChange={(e) => setClosingTime(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Button onClick={handleSave}>Save Configuration</Button>
    </div>
  );
}
