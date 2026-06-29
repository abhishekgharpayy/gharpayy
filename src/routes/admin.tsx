import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { useAuthUser } from "@/lib/auth-store";
import { AppShell } from "@/components/AppShell";

import { RequireScope } from "@/components/RequireScope";

export const Route = createFileRoute("/admin")(
  {
    beforeLoad: () => {
      const role = useAuthUser.getState().user?.role;
      if (role !== "super_admin" && role !== "admin") throw redirect({ to: "/" });
    },
    component: () => (
      <RequireScope scope="admin.read">
        <div className="admin-theme min-h-screen w-full bg-background text-foreground">
          <AppShell>
            <Outlet />
          </AppShell>
        </div>
      </RequireScope>
    ),
  }
);
