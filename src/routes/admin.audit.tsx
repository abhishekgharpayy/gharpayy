import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useLiveAuditLog, type AuditEntry } from "@/admin/lib/use-live-supreme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, RefreshCw } from "lucide-react";
import { downloadCsv, downloadJson } from "@/admin/lib/exporters/csv";
import { useAuthUser } from "@/lib/auth-store";

export const Route = createFileRoute("/admin/audit")(
  {
    beforeLoad: () => {
      const role = useAuthUser.getState().user?.role;
      if (role !== "super_admin") throw redirect({ to: "/" });
    },
    component: AdminAudit,
  }
);

function AdminAudit() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { data, isLoading, isError, refetch } = useLiveAuditLog(debouncedSearch);

  const entries: AuditEntry[] = data?.entries ?? [];
  const total = data?.total ?? 0;

  // Client-side fine filter on top of server search
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.actorName.toLowerCase().includes(q) ||
        (e.entityId || "").toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q),
    );
  }, [entries, search]);

  const exportData = useMemo(
    () =>
      filtered.map((e) => ({
        time: new Date(e.ts).toLocaleString("en-IN"),
        actor: e.actorName,
        entity: `${e.entityType} #${(e.entityId || "").slice(0, 8)}`,
        action: e.action,
        summary: e.summary,
        before: e.before != null ? String(e.before) : "",
        after: e.after != null ? String(e.after) : "",
      })),
    [filtered],
  );

  const ACTION_COLORS: Record<string, string> = {
    "admin.broadcast": "text-blue-400",
    "admin.kill.on": "text-destructive",
    "admin.kill.off": "text-success",
    "admin.impersonate": "text-yellow-400",
    "admin.snapshot": "text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by actor, action, or summary..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                clearTimeout((window as any).__auditDebounce);
                (window as any).__auditDebounce = setTimeout(() => setDebouncedSearch(e.target.value), 400);
              }}
              className="pl-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(`audit-log-${Date.now()}.csv`, exportData)}
          >
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadJson(`audit-log-${Date.now()}.json`, exportData)}
          >
            <Download className="h-3 w-3 mr-1" />
            JSON
          </Button>
        </div>

        {isError && (
          <div className="text-xs text-destructive bg-destructive/10 rounded p-3 mb-3">
            Failed to load audit log from server. Ensure the backend is running.
          </div>
        )}

        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">Time</th>
                <th className="text-left px-2 py-1.5 font-medium">Actor</th>
                <th className="text-left px-2 py-1.5 font-medium">Entity</th>
                <th className="text-left px-2 py-1.5 font-medium">Action</th>
                <th className="text-left px-2 py-1.5 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-2 py-8 text-center text-muted-foreground animate-pulse">
                    Loading server audit log…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.slice(0, 500).map((e) => (
                <tr key={e._id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-1.5 font-mono text-muted-foreground whitespace-nowrap">
                    {new Date(e.ts).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-2 py-1.5 font-medium">{e.actorName}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {e.entityType} <span className="font-mono">#{(e.entityId || "").slice(0, 8)}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <code className={`bg-muted/40 px-1.5 py-0.5 rounded text-[10px] ${ACTION_COLORS[e.action] ?? ""}`}>
                      {e.action}
                    </code>
                  </td>
                  <td className="px-2 py-1.5 max-w-xs truncate">{e.summary}</td>
                </tr>
              ))}
              {!isLoading && !filtered.length && (
                <tr>
                  <td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">
                    {search ? "No matching entries." : "No audit entries yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 300 && (
          <div className="text-[10px] text-muted-foreground text-center mt-2">
            Showing latest 300 of {total} total entries. Use search to narrow results or export for full data.
          </div>
        )}
      </div>
    </div>
  );
}
