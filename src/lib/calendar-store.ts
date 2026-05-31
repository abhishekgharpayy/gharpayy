import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CalEventKind = "meeting" | "call" | "tour" | "follow-up" | "task" | "personal" | "visit";
export type CalReminder = 0 | 5 | 10 | 15 | 30 | 60 | 1440;

export interface CalEvent {
  id: string;
  title: string;
  kind: CalEventKind;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  attendees?: string[];
  leadId?: string;
  tourId?: string;
  followUpId?: string;
  color?: string;
  reminder?: CalReminder;
  externalSource?: "google" | "outlook" | "ics" | "local";
  externalId?: string;
  rrule?: string;
  createdAt: string;
  updatedAt: string;
}

export type SyncProvider = "google" | "outlook" | "ics";

export interface SyncConnection {
  provider: SyncProvider;
  connected: boolean;
  account?: string;
  lastSyncedAt?: string;
  feedUrl?: string;
  selectedCalendars?: string[];
  direction?: "pull" | "push" | "both";
}

interface CalendarState {
  events: CalEvent[];
  connections: SyncConnection[];
  publishedIcsToken: string;

  addEvent: (e: Omit<CalEvent, "id" | "createdAt" | "updatedAt">) => CalEvent;
  updateEvent: (id: string, patch: Partial<CalEvent>) => void;
  deleteEvent: (id: string) => void;
  importEvents: (items: CalEvent[]) => void;

  setConnection: (c: SyncConnection) => void;
  removeConnection: (p: SyncProvider) => void;
  rotateIcsToken: () => void;
}

const uid = (p = "evt") => `${p}-${Math.random().toString(36).slice(2, 10)}`;

export const useCalendar = create<CalendarState>()(
  persist(
    (set, get) => ({
      events: [],
      connections: [],
      publishedIcsToken: uid("ics"),

      addEvent: (e) => {
        const now = new Date().toISOString();
        const evt: CalEvent = {
          ...e,
          id: uid("evt"),
          createdAt: now,
          updatedAt: now,
        };
        set({ events: [...get().events, evt] });
        return evt;
      },
      updateEvent: (id, patch) =>
        set({
          events: get().events.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
          ),
        }),
      deleteEvent: (id) => set({ events: get().events.filter((e) => e.id !== id) }),
      importEvents: (items) => {
        const existing = new Map(get().events.map((e) => [e.externalId ?? e.id, e]));
        for (const it of items) {
          existing.set(it.externalId ?? it.id, it);
        }
        set({ events: Array.from(existing.values()) });
      },

      setConnection: (c) => {
        const others = get().connections.filter((x) => x.provider !== c.provider);
        set({ connections: [...others, c] });
      },
      removeConnection: (p) =>
        set({ connections: get().connections.filter((c) => c.provider !== p) }),
      rotateIcsToken: () => set({ publishedIcsToken: uid("ics") }),
    }),
    {
      name: "align-calendar-v1",
      version: 1,
    },
  ),
);

export const KIND_META: Record<CalEventKind, { label: string; color: string; ring: string; bg: string; text: string }> = {
  meeting: { label: "Meeting", color: "#2563eb", ring: "ring-blue-500/40", bg: "bg-blue-500/15", text: "text-blue-700" },
  call: { label: "Call", color: "#0891b2", ring: "ring-cyan-500/40", bg: "bg-cyan-500/15", text: "text-cyan-700" },
  tour: { label: "Tour", color: "#f97316", ring: "ring-orange-500/40", bg: "bg-orange-500/15", text: "text-orange-700" },
  "follow-up": { label: "Follow-up", color: "#9333ea", ring: "ring-purple-500/40", bg: "bg-purple-500/15", text: "text-purple-700" },
  task: { label: "Task", color: "#16a34a", ring: "ring-emerald-500/40", bg: "bg-emerald-500/15", text: "text-emerald-700" },
  personal: { label: "Personal", color: "#64748b", ring: "ring-slate-500/40", bg: "bg-slate-500/15", text: "text-slate-700" },
  visit: { label: "Visit", color: "#dc2626", ring: "ring-rose-500/40", bg: "bg-rose-500/15", text: "text-rose-700" },
};

export interface VisitEventInput {
  tourId: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  propertyName: string;
  propertyArea: string;
  scheduledAt: number;
  tcmEmail?: string;
  description: string;
  durationMin?: number;
}

export function upsertVisitEvent(input: VisitEventInput): string {
  const ext = `visit:${input.tourId}`;
  const startIso = new Date(input.scheduledAt).toISOString();
  const endIso = new Date(input.scheduledAt + (input.durationMin ?? 60) * 60_000).toISOString();
  const title = `Visit · ${input.propertyName} · ••${input.leadPhone.slice(-4)}`;
  const events = useCalendar.getState().events;
  const existing = events.find((e) => e.externalId === ext);
  if (existing) {
    useCalendar.getState().updateEvent(existing.id, {
      title,
      start: startIso,
      end: endIso,
      location: input.propertyArea,
      description: input.description,
      attendees: input.tcmEmail ? [input.tcmEmail] : undefined,
      kind: "visit",
      leadId: input.leadId,
      tourId: input.tourId,
    });
    return existing.id;
  }
  const evt = useCalendar.getState().addEvent({
    title,
    kind: "visit",
    start: startIso,
    end: endIso,
    allDay: false,
    location: input.propertyArea,
    description: input.description,
    attendees: input.tcmEmail ? [input.tcmEmail] : undefined,
    leadId: input.leadId,
    tourId: input.tourId,
    externalSource: "local",
    externalId: ext,
    reminder: 15,
  });
  return evt.id;
}

export function patchVisitEvent(tourId: string, patch: { description?: string; title?: string }) {
  const ext = `visit:${tourId}`;
  const existing = useCalendar.getState().events.find((e) => e.externalId === ext);
  if (existing) useCalendar.getState().updateEvent(existing.id, patch);
}

export function archiveVisitEvent(tourId: string) {
  const ext = `visit:${tourId}`;
  const existing = useCalendar.getState().events.find((e) => e.externalId === ext);
  if (existing) {
    useCalendar.getState().updateEvent(existing.id, {
      title: existing.title.startsWith("ARCHIVED · ") ? existing.title : `ARCHIVED · ${existing.title}`,
    });
  }
}

export function findBufferConflicts(args: {
  tcmEmail?: string;
  scheduledAt: number;
  durationMin?: number;
  bufferMin?: number;
  excludeTourId?: string;
}): CalEvent[] {
  const buffer = (args.bufferMin ?? 30) * 60_000;
  const dur = (args.durationMin ?? 60) * 60_000;
  const start = args.scheduledAt - buffer;
  const end = args.scheduledAt + dur + buffer;
  return useCalendar.getState().events.filter((e) => {
    if (e.kind !== "visit") return false;
    if (args.excludeTourId && e.tourId === args.excludeTourId) return false;
    if (args.tcmEmail && e.attendees?.[0] !== args.tcmEmail) return false;
    const s = +new Date(e.start);
    const en = +new Date(e.end);
    return s < end && en > start;
  });
}
