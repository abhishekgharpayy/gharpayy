import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";

type Sub = "login" | "all";
interface Item {
  _id: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export function ActivityTab() {
  const [tab, setTab] = useState<Sub>("login");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);

  const load = async (which: Sub) => {
    setLoading(true);
    try {
      const r = which === "login" ? await api.activity.login(150) : await api.activity.all(200);
      setItems(r.items as Item[]);
      if ("fallback" in r) setIsFallback(!!r.fallback);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(tab); }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 w-fit">
        {(["login", "all"] as Sub[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "text-[11px] font-medium rounded-full px-3 py-1 transition-colors capitalize " +
              (tab === t
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground")
            }
          >{t === "login" ? "Logins" : "All events"}</button>
        ))}
      </div>
      
      {isFallback && tab === "all" && (
        <div className="bg-destructive/15 text-destructive text-xs p-3 rounded border border-destructive/20 flex items-start gap-2">
          <span>⚠️</span>
          <span>The outbox publisher is currently delayed (Redis might be unavailable). You are viewing raw events from the database which might not have been fully processed by the system yet.</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it._id} className="rounded-lg border bg-card p-3 text-xs flex items-center justify-between">
              <div className="space-y-0.5 min-w-0">
                <p className="font-mono text-foreground">{it.type}</p>
                <p className="text-muted-foreground truncate">{describe(it.payload)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground shrink-0 ml-2">{formatTs(it.occurredAt)}</p>
            </div>
          ))}
          {items.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No activity yet</p>}
        </div>
      )}
    </div>
  );
}

function describe(p: Record<string, unknown>): string {
  if (!p) return "";
  if (typeof p.email === "string") return `${p.email}${p.ip ? ` · ${p.ip}` : ""}`;
  if (typeof p.leadId === "string") return `lead:${p.leadId}`;
  return JSON.stringify(p).slice(0, 120);
}

function formatTs(s: string): string {
  try { return new Date(s).toLocaleString(); } catch { return s; }
}
