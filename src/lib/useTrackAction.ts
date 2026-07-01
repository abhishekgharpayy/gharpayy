/**
 * useTrackAction — lightweight hook to track user UI interactions.
 *
 * Fires a non-blocking POST to /api/admin/track-action.
 * Used by Impact Queue, Lead forms, quotation actions, and other key surfaces.
 *
 * Only fires when the user is authenticated and the API URL is configured.
 * Fails silently so it never disrupts the main UX.
 */

import { useCallback } from "react";
import { apiClient } from "@/lib/api/client";
import { useAuthUser } from "@/lib/auth-store";

export interface TrackActionPayload {
  action: string;
  entityType?: string;
  entityId?: string;
  detail?: string;
}

export function useTrackAction() {
  const user = useAuthUser((s) => s.user);

  const track = useCallback(
    (payload: TrackActionPayload) => {
      // Only track for authenticated users with an actual API backend
      if (!user) return;
      if (!import.meta.env.VITE_API_URL) return;

      // Non-blocking fire-and-forget
      apiClient
        .post<{ ok: boolean }>("/api/admin/track-action", payload)
        .catch(() => {
          // Silently ignore — tracking must never break the UI
        });
    },
    [user]
  );

  return track;
}
