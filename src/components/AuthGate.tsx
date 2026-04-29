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
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();

  useEffect(() => { hydrate(); }, [hydrate]);

  const hasToken = typeof window !== "undefined" && !!tokenStore.get();
  const isLoginRoute = pathname === "/login";

  // Resolving auth: token present but user not yet loaded
  if (hasToken && !user && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not signed in → force the login screen, no matter what route was requested
  if (!user && !isLoginRoute) {
    // Push the URL to /login so the address bar reflects state and a refresh works.
    // (Safe to call from effect-less render — navigate is idempotent for same target.)
    if (typeof window !== "undefined" && pathname !== "/login") {
      const redirect = pathname + (search && Object.keys(search).length ? "" : "");
      queueMicrotask(() => {
        navigate({ to: "/login", search: { redirect: redirect || "/" }, replace: true }).catch(() => undefined);
      });
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
