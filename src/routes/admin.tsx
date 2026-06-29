import { createFileRoute, redirect, Outlet, useRouterState } from "@tanstack/react-router";
import { useAuthUser } from "@/lib/auth-store";
import { AppShell } from "@/components/AppShell";
import { motion } from "framer-motion";

import { RequireScope } from "@/components/RequireScope";

export const Route = createFileRoute("/admin")(
  {
    beforeLoad: () => {
      const role = useAuthUser.getState().user?.role;
      if (role !== "super_admin" && role !== "admin") throw redirect({ to: "/" });
    },
    component: () => {
      const pathname = useRouterState({ select: (s) => s.location.pathname });
      return (
        <RequireScope scope="admin.read">
          <div className="admin-theme min-h-screen w-full bg-background text-foreground">
            <AppShell>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Outlet />
              </motion.div>
            </AppShell>
          </div>
        </RequireScope>
      );
    },
  }
);
