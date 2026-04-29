import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, MapPin, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, type ManagedRole, type ManagedUser } from "@/lib/api/client";

export function AddUserForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    fullName: "", email: "", phone: "", password: "",
    role: "" as ManagedRole | "",
    managerId: "", adminId: "",
  });
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [managers, setManagers] = useState<ManagedUser[]>([]);
  const [admins, setAdmins] = useState<ManagedUser[]>([]);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.zones.list().then(setZones).catch(() => undefined);
    api.managers.list().then((m) => setManagers(m)).catch(() => undefined);
    api.admins.list().then(setAdmins).catch(() => undefined);
  }, []);

  const submit = async () => {
    if (!form.fullName || !form.email || !form.password || !form.role) {
      toast.error("Name, email, password, role are required");
      return;
    }
    if ((form.role === "admin" || form.role === "member") && selectedZones.length === 0) {
      toast.error("Assign at least one zone");
      return;
    }
    if (form.role === "admin" && !form.managerId) {
      toast.error("Select a parent manager");
      return;
    }
    if (form.role === "member" && !form.adminId) {
      toast.error("Select a parent admin");
      return;
    }
    setBusy(true);
    try {
      await api.users.create({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        role: form.role,
        zones: selectedZones,
        managerId: form.managerId || null,
        adminId: form.adminId || null,
      });
      toast.success("User created");
      onSuccess();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Full Name *</Label>
          <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Jane Doe" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email *</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@gharpayy.com" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91…" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Initial Password *</Label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="pr-9"
              placeholder="min 8 chars"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              tabIndex={-1}
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Role *</Label>
        <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as ManagedRole })}>
          <SelectTrigger><SelectValue placeholder="Select role…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {form.role === "admin" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Parent Manager *</Label>
          <Select value={form.managerId} onValueChange={(v) => setForm({ ...form, managerId: v })}>
            <SelectTrigger><SelectValue placeholder="Pick manager…" /></SelectTrigger>
            <SelectContent>
              {managers.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.fullName} · {m.email}</SelectItem>
              ))}
              {managers.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No managers yet</div>}
            </SelectContent>
          </Select>
        </div>
      )}

      {form.role === "member" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Parent Admin *</Label>
          <Select value={form.adminId} onValueChange={(v) => setForm({ ...form, adminId: v })}>
            <SelectTrigger><SelectValue placeholder="Pick admin…" /></SelectTrigger>
            <SelectContent>
              {admins.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.fullName} · {a.email}</SelectItem>
              ))}
              {admins.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No admins yet</div>}
            </SelectContent>
          </Select>
        </div>
      )}

      {(form.role === "admin" || form.role === "member") && (
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5"><MapPin size={12} /> Assign Zones *</Label>
          <div className="grid grid-cols-2 gap-2">
            {zones.map((z) => (
              <label key={z.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedZones.includes(z.name)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedZones([...selectedZones, z.name]);
                    else setSelectedZones(selectedZones.filter((x) => x !== z.name));
                  }}
                  className="rounded"
                />
                {z.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <Button className="w-full gap-1.5" disabled={busy} onClick={submit}>
        <UserPlus size={14} /> {busy ? "Creating…" : "Create user"}
      </Button>
    </div>
  );
}
