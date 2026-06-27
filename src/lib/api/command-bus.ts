// Command bus - dispatch a typed command, optimistic application happens in the calling store.
// Server validates and returns the produced events. Realtime delivers them to ALL connected clients.
import { api, apiClient } from "./client";
import { Command, ulid, type Command as Cmd } from "@/contracts";

export type DispatchResult =
  | { ok: true; eventIds: string[] }
  | { ok: false; error: string };

/** Fire-and-forget action tracker — instruments every command dispatch for the Execution Monitor. */
function trackCommand(cmd: Cmd) {
  if (!import.meta.env.VITE_API_URL) return;
  // Extract a friendly action name + entity info from the command type
  const action = cmd.type; // e.g. "cmd.lead.create"
  const payload = (cmd as any).payload ?? {};
  const entityId = payload.leadId ?? payload.tourId ?? payload.todoId ?? payload.id ?? undefined;
  const entityType = cmd.type.split(".")[1] ?? undefined; // "lead", "tour", "todo", "activity"
  const detail =
    payload.name ??
    payload.subject ??
    payload.kind ??
    payload.to ??
    payload.stage ??
    undefined;

  apiClient
    .post<{ ok: boolean }>("/api/admin/track-action", { action, entityType, entityId, detail: String(detail ?? "") })
    .catch(() => {/* tracking must never break the UI */});
}

export async function dispatch(input: Omit<Cmd, "_id" | "issuedAt"> & Partial<Pick<Cmd, "_id" | "issuedAt">>): Promise<DispatchResult> {
  const cmd = {
    _id: input._id ?? ulid(),
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    ...input,
  } as Cmd;
  const parsed = Command.safeParse(cmd);
  if (!parsed.success) {
    return { ok: false, error: `Client validation failed: ${parsed.error.message}` };
  }

  // Track every dispatched command (non-blocking)
  trackCommand(parsed.data as unknown as Cmd);

  try {
    return await api.command<DispatchResult>(parsed.data as unknown as { _id: string; type: string; payload: Record<string, unknown> } & Record<string, unknown>);
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.message };
  }
}

