import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save, User, Shield, BellRing, Moon, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api/client";
import { useAuthUser } from "@/lib/auth-store";

export function ProfileTab() {
  const user = useAuthUser((s) => s.user);
  const hydrate = useAuthUser((s) => s.hydrate);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  
  // App preferences
  const [notifications, setNotifications] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = (checked: boolean) => {
    setTheme(checked ? "dark" : "light");
    if (checked) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  if (!user) return <p className="text-sm text-muted-foreground">Not signed in.</p>;

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.auth.update({
        phone: phone !== user.phone ? phone : undefined,
      });
      toast.success("Profile updated");
      await hydrate();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const savePassword = async () => {
    if (!pw) return toast.error("Please enter a new password");
    if (pw !== pw2) return toast.error("Passwords don't match");
    if (pw.length < 8) return toast.error("Password must be 8+ chars");
    
    setSaving(true);
    try {
      await api.auth.update({ password: pw });
      toast.success("Password changed successfully");
      setPw(""); setPw2("");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 max-w-5xl">
      
      {/* Column 1: Profile & Preferences */}
      <div className="space-y-6">
        {/* Profile Card */}
        <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
            <User className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Personal Information</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <Input value={user.fullName} disabled className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Input value={user.role.replace("_", " ")} disabled className="bg-muted/50 capitalize" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={user.email} disabled className="bg-muted/50" />
            </div>
            {user.zones.length > 0 && (
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs text-muted-foreground">Zones</Label>
                <Input value={user.zones.join(", ")} disabled className="bg-muted/50" />
              </div>
            )}
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-medium">Phone Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone number" />
            </div>
          </div>
          
          <Button size="sm" className="w-full gap-1.5 mt-2" disabled={saving || phone === user.phone} onClick={saveProfile}>
            <Save size={14} /> {saving ? "Saving…" : "Save Profile"}
          </Button>
        </div>
      </div>

      {/* Column 2: Security & Preferences */}
      <div className="space-y-6">
        <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Security</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Update your password here. It's recommended to use a strong password with at least 8 characters.
            </p>
            
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">New password</Label>
                <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Confirm new password</Label>
                <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
            
            <Button size="sm" variant="secondary" className="w-full gap-1.5 mt-2" disabled={saving || !pw} onClick={savePassword}>
              <Shield size={14} /> {saving ? "Updating…" : "Update Password"}
            </Button>
          </div>
        </div>

        {/* App Preferences Card */}
        <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
            <BellRing className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">App Preferences</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Dark Mode</Label>
                <p className="text-xs text-muted-foreground">Toggle application theme</p>
              </div>
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-muted-foreground" />
                <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
                <Moon className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Push Notifications</Label>
                <p className="text-xs text-muted-foreground">Receive alerts for new tours</p>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
