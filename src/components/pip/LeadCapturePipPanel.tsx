import { LeadPasteParser } from "@/components/leads/LeadPasteParser";
import { toast } from "sonner";
import { usePip } from "./PipProvider";

export function LeadCapturePipPanel() {
  const { close } = usePip();

  return (
    <div className="bg-background min-h-screen pip-compact">
      <div className="px-3 py-2 border-b bg-muted/30">
        <h2 className="font-semibold text-sm">Paste Lead (PiP)</h2>
      </div>
      <div className="p-3">
        <LeadPasteParser onDone={() => {
          toast.success("Lead added to Inbox. Closing PiP.");
          window.setTimeout(close, 650);
        }} />
      </div>
    </div>
  );
}
