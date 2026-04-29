import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type ManagedUser } from "@/lib/api/client";

type RoleTab = "managers" | "admins" | "members";

export function RolesTab() {
  const [tab, setTab] = useState<RoleTab>("managers");
  const [managers, setManagers] = useState<(ManagedUser & { admins?: ManagedUser[] })[]>([]);
  const [admins, setAdmins] = useState<ManagedUser[]>([]);
  const [members, setMembers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [m, a, mem] = await Promise.all([
        api.managers.list(),
        api.admins.list(),
        api.members.list(),
      ]);
      setManagers(m);
      setAdmins(a);
      setMembers(mem);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const resetPassword = async (id: string, name: string) => {
    const pw = prompt(`New password for ${name} (min 8 chars):`);
    if (!pw) return;
    if (pw.length < 8) { toast.error("Password too short"); return; }
    try {
      await api.users.resetPassword(id, pw);
      toast.success("Password updated");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-secondary/50 rounded-lg p-1 w-fit">
        {(["managers", "admins", "members"] as RoleTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "px-4 py-1.5 rounded-md text-xs font-medium capitalize " +
              (tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
            }
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {tab === "managers" && managers.map((m) => (
            <div key={m.id} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{m.fullName}</p>
                  <p className="text-xs text-muted-foreground">{m.email} · {m.phone || "no phone"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{m.admins?.length ?? 0} admins</Badge>
                  <Button size="sm" variant="ghost" onClick={() => resetPassword(m.id, m.fullName)}><KeyRound size={12} /></Button>
                </div>
              </div>
              {(m.admins?.length ?? 0) > 0 && (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">Admins</p>
                  {m.admins!.map((a) => (
                    <div key={a.id} className="bg-background rounded-lg p-2 text-xs flex items-center justify-between">
                      <span>{a.fullName} · {a.email}</span>
                      {a.zones.length > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin size={10} />{a.zones.join(", ")}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {tab === "admins" && admins.map((a) => (
            <div key={a.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{a.fullName}</p>
                  <p className="text-xs text-muted-foreground">{a.email} · {a.phone || "no phone"}</p>
                  {a.zones.length > 0 && <p className="text-[10px] text-muted-foreground mt-0.5"><MapPin size={10} className="inline" /> {a.zones.join(", ")}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => resetPassword(a.id, a.fullName)}><KeyRound size={12} /></Button>
              </div>
            </div>
          ))}

          {tab === "members" && members.map((mem) => (
            <div key={mem.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{mem.fullName}</p>
                  <p className="text-xs text-muted-foreground">{mem.email} · {mem.phone || "no phone"}</p>
                  {mem.zones.length > 0 && <p className="text-[10px] text-muted-foreground mt-0.5"><MapPin size={10} className="inline" /> {mem.zones.join(", ")}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => resetPassword(mem.id, mem.fullName)}><KeyRound size={12} /></Button>
              </div>
            </div>
          ))}

          {tab === "managers" && managers.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No managers yet</p>}
          {tab === "admins" && admins.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No admins yet</p>}
          {tab === "members" && members.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No members yet</p>}
        </div>
      )}
    </div>
  );
}
