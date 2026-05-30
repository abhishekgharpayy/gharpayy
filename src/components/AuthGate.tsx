// Global auth gate. Until the user has a valid JWT session (hydrated from
// /api/auth/me), nothing in the app renders except the login screen.
//
// JWT flow (matches the old CRM):
//   1. POST /api/auth/login → { token, user }
//   2. Token saved to localStorage (`gharpayy.access_token`) + httpOnly cookie
//   3. Every request sends Authorization: Bearer <token>
//   4. On boot, /api/auth/me re-validates the token and rehydrates the user
import { useEffect, type ReactNode } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuthUser } from "@/lib/auth-store";
import { tokenStore } from "@/lib/api/client";
import { Loader2 } from "lucide-react";

export function AuthGate({ children }: { children: ReactNode }) {
  const user = useAuthUser((s) => s.user);
  const loading = useAuthUser((s) => s.loading);
  const hydrate = useAuthUser((s) => s.hydrate);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => { hydrate(); }, [hydrate]);

  const hasToken = typeof window !== "undefined" && !!tokenStore.get();
  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    if (user || isLoginRoute || !hasToken) return;
    const redirect = pathname || "/";
    void navigate({ to: "/login", search: { redirect }, replace: true }).catch(() => undefined);
  }, [user, isLoginRoute, hasToken, pathname, navigate]);

  // Resolving auth: token present but user not yet loaded
  if (hasToken && !user && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not signed in → loading shell while useEffect redirects to /login
  if (!user && !isLoginRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
