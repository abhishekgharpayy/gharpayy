import { LeadPasteParser } from "@/components/leads/LeadPasteParser";

export function LeadCapturePipPanel() {
  return (
    <div className="bg-background min-h-screen pip-compact">
      <div className="px-3 py-2 border-b bg-muted/30">
        <h2 className="font-semibold text-sm">Paste Lead (PiP)</h2>
      </div>
      <div className="p-3">
        <LeadPasteParser onDone={() => {
          // Could auto-close PIP here, but leaving open is usually preferred for bulk pasting
        }} />
      </div>
    </div>
  );
}