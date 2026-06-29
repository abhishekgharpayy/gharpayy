import { ReactNode } from "react";
import { useAuthUser } from "@/lib/auth-store";

export function RequireScope({ scope, children }: { scope: string; children: ReactNode }) {
  const user = useAuthUser((s) => s.user);
  
  if (!user) return null;
  
  // super_admin bypasses all scope checks
  if (user.role === "super_admin") {
    return <>{children}</>;
  }
  
  if (!user.scopes || !user.scopes.includes(scope)) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-8 text-center">
        <h2 className="text-2xl font-bold text-destructive mb-2">Access Denied</h2>
        <p className="text-muted-foreground">
          You do not have the required permissions ({scope}) to view this page.
        </p>
      </div>
    );
  }
  
  return <>{children}</>;
}
