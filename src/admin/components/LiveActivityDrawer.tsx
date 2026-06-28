import { useEffect, useState } from "react";
import { onEvent } from "@/lib/api/socket";
import type { DomainEvent } from "@/contracts";
import { Activity, Bell } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function LiveActivityDrawer() {
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return onEvent((e) => {
      setEvents((prev) => [e, ...prev].slice(0, 50));
      if (!open) {
        setUnread((u) => u + 1);
      }
    });
  }, [open]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative ml-2 gap-2 text-xs">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span>Live Feed</span>
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-4 border-b border-border bg-card/50 backdrop-blur">
          <SheetTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-success animate-pulse" />
            Live Organization Activity
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-auto p-4 bg-muted/10 space-y-3">
          {events.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-xs border border-dashed rounded-lg border-border/50">
              Waiting for live activities...
            </div>
          ) : (
            events.map((e) => {
              const p = e.payload as any;
              return (
                <div
                  key={e._id}
                  className="text-xs p-3 rounded-lg bg-card border border-border shadow-sm flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2"
                >
                  <div className="flex justify-between items-start text-[10px] text-muted-foreground">
                    <span className="font-mono">
                      {new Date(e.occurredAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="uppercase px-1.5 py-0.5 rounded-sm bg-muted text-foreground font-medium border border-border/50">
                      {e.type.replace("evt.", "").replace(/\./g, " ")}
                    </span>
                  </div>
                  <div className="font-medium text-sm text-foreground">
                    {p?.lead?.name || p?.patch?.name || p?.leadId || "Organization Event"}
                  </div>
                  <div className="flex justify-between items-end mt-1 text-[10px] text-muted-foreground">
                    <span className="truncate pr-2">
                      {p?.patch ? "Properties updated" : p?.reason ? `Reason: ${p.reason}` : "Action logged"}
                    </span>
                    <span className="shrink-0 bg-accent/10 text-accent px-1.5 py-0.5 rounded">User: {e.actor.slice(0, 8)}...</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
