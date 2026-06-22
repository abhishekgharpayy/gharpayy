import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useAuthUser } from "@/lib/auth-store";

export const Route = createFileRoute("/admin/calendar")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  component: AdminCal,
});

function AdminCal() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 text-sm">
        Admin view reuses the full <Link to="/calendar" className="text-accent underline">/calendar</Link> with no zone filter \u2014 open it for drag-to-reschedule, swim-lanes per TCM, and ICS export.
      </div>
    </div>
  );
}
