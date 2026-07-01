// Offline-first adapter: persists todos + activities to localStorage and
// emits the same Domain events the VPS would emit, so realtime UI works
// before the backend is deployed. Auto-engaged when VITE_API_URL is unset
// or the server is unreachable.
import { ulid } from "@/contracts";
import type { Todo, Activity, DomainEvent, Lead, Tour } from "@/contracts";
import { normalizeLeadName } from "@/lib/lead-helpers";

const TODOS_KEY = "gharpayy.local.todos";
const ACTS_KEY = "gharpayy.local.activities";
const LEADS_KEY = "gharpayy.local.leads";
const TOURS_KEY = "myt:tours";
const MEDIA_KEY = "gharpayy.local.media";
const WHATSAPP_CONV_KEY = "gharpayy.local.whatsapp_conversations";
const WHATSAPP_MSG_KEY = "gharpayy.local.whatsapp_messages";
const AGREEMENTS_KEY = "gharpayy.local.agreements";
const ALERTS_KEY = "gharpayy.local.alerts";
const TENANT = "local";
const USER = "local-user";

const SEED_LEADS: Lead[] = [];

// One-time cleanup: if the user previously ran in local mode, the old demo leads
// are still sitting in localStorage. Wipe them once VITE_API_URL is configured.
if (typeof window !== "undefined") {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  const cleaned = localStorage.getItem("gharpayy.local.cleaned_v1") === "1";
  if (url && !cleaned) {
    localStorage.removeItem(LEADS_KEY);
    localStorage.removeItem(TODOS_KEY);
    localStorage.removeItem(ACTS_KEY);
    localStorage.setItem("gharpayy.local.cleaned_v1", "1");
  }
}

type Listener = (e: DomainEvent) => void;
const listeners = new Set<Listener>();
export function onLocalEvent(cb: Listener): () => void { listeners.add(cb); return () => listeners.delete(cb); }
function emit(e: DomainEvent) { listeners.forEach((l) => { try { l(e); } catch (err) { console.error(err); } }); }

const read = <T,>(k: string): T[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(k) || "[]") as T[]; } catch { return []; }
};
const write = <T,>(k: string, v: T[]) => { if (typeof window !== "undefined") localStorage.setItem(k, JSON.stringify(v)); };

const seedMedia = () => {
  const existing = read(MEDIA_KEY);
  if (existing.length > 0) return;
  write(MEDIA_KEY, []);
};

const seedWhatsApp = () => {
  const convs = read(WHATSAPP_CONV_KEY);
  if (convs.length > 0) return;
  write(WHATSAPP_CONV_KEY, []);
  write(WHATSAPP_MSG_KEY, []);
};

const seedAgreements = () => {
  const existing = read(AGREEMENTS_KEY);
  if (existing.length > 0) return;
  write(AGREEMENTS_KEY, []);
};

const seedAlerts = () => {
  const existing = read(ALERTS_KEY);
  if (existing.length > 0) return;
  write(ALERTS_KEY, []);
};

const seedTours = () => {
  const existing = read(TOURS_KEY);
  if (existing.length > 0) return;
  write(TOURS_KEY, []);
};

if (typeof window !== "undefined") {
  const apiPreset = import.meta.env.VITE_API_URL as string | undefined;
  if (apiPreset) {
    localStorage.removeItem("gharpayy.force_local");
  } else {
    localStorage.setItem("gharpayy.force_local", "1");
  }
  seedMedia();
  seedWhatsApp();
  seedAgreements();
  seedAlerts();
  seedTours();
}

const nowISO = () => new Date().toISOString();
const env = (correlationId: string) => ({
  _id: ulid(), occurredAt: nowISO(), actor: USER, tenantId: TENANT,
  correlationId, causationId: null, version: 1 as const,
});

type CmdIn = { _id: string; type: string; payload: Record<string, unknown> };

export const localAdapter = {
  isLocal: true,

  // ---------- Queries ----------
  listTodos(q: { entityType?: string; entityId?: string; scope?: string }) {
    let items = read<Todo>(TODOS_KEY);
    if (q.entityType) items = items.filter((t) => t.entityType === q.entityType);
    if (q.entityId) items = items.filter((t) => t.entityId === q.entityId);
    if (q.scope === "mine") items = items.filter((t) => t.assignedTo === USER || (t.createdBy === USER && !t.assignedTo));
    return { items: items.sort((a, b) => b._id.localeCompare(a._id)) };
  },

  listActivities(q: { entityType: string; entityId: string; kind?: string; limit?: number }) {
    let items = read<Activity>(ACTS_KEY).filter((a) => a.entityType === q.entityType && a.entityId === q.entityId);
    if (q.kind) items = items.filter((a) => a.kind === q.kind);
    items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return { items: items.slice(0, q.limit ?? 200) };
  },

  listUsers() {
    return { items: [{ _id: USER, name: "Me (local)", email: "me@local", role: "admin" }] };
  },

  listLeads(q: { limit?: number; search?: string } = {}) {
    if (typeof window !== "undefined" && !localStorage.getItem(LEADS_KEY)) {
      write(LEADS_KEY, SEED_LEADS);
    }
    let items = read<Lead>(LEADS_KEY).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter(l => l.name.toLowerCase().includes(s) || l.phone.includes(s));
    }
    return { items: items.slice(0, q.limit ?? 100), nextCursor: null as string | null };
  },

  listTours() {
    const items = read<any>(TOURS_KEY);
    return { items: items.sort((a: any, b: any) => (b._id || b.id || "").localeCompare(a._id || a.id || "")), nextCursor: null as string | null };
  },

  // ---------- Media ----------
  listMedia(propertyId: string) {
    const items = read<any>(MEDIA_KEY).filter((m) => m.propertyId === propertyId);
    return items.map((m) => ({
      id: m._id,
      propertyId: m.propertyId,
      roomId: m.roomId,
      url: m.fileName,
      thumbUrl: m.fileName,
      caption: m.caption,
      isPrimary: m.isPrimary,
      size: m.size,
      mimeType: m.mimeType,
      createdAt: m.createdAt,
    }));
  },

  // ---------- WhatsApp ----------
  listWhatsAppConversations(q: { status?: string; search?: string; limit?: number; cursor?: string } = {}) {
    let items = read<any>(WHATSAPP_CONV_KEY).filter((c) => c.tenantId === TENANT);
    if (q.status) items = items.filter((c) => c.status === q.status);
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter((c) => c.leadName.toLowerCase().includes(s) || c.phone.includes(s));
    }
    items.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    const limit = q.limit ?? 100;
    const mapped = items.slice(0, limit).map((c: any) => ({ ...c, id: c._id }));
    return { items: mapped, nextCursor: items.length > limit ? items[limit - 1]._id : null };
  },

  listWhatsAppMessages(conversationId: string, q: { limit?: number; cursor?: string } = {}) {
    let items = read<any>(WHATSAPP_MSG_KEY).filter((m) => m.tenantId === TENANT && m.conversationId === conversationId);
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const limit = q.limit ?? 100;
    const mapped = items.slice(0, limit).map((m: any) => ({ ...m, id: m._id }));
    return { items: mapped, nextCursor: items.length > limit ? items[limit - 1]._id : null };
  },

  // ---------- Agreements ----------
  listAgreements(q: { status?: string; search?: string; limit?: number; cursor?: string } = {}) {
    let items = read<any>(AGREEMENTS_KEY).filter((a) => a.tenantId === TENANT);
    if (q.status) items = items.filter((a) => a.status === q.status);
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter((a) => a.tenantName.toLowerCase().includes(s) || a.propertyName.toLowerCase().includes(s));
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = q.limit ?? 100;
    const mapped = items.slice(0, limit).map((a: any) => ({ ...a, id: a._id }));
    return { items: mapped, nextCursor: items.length > limit ? items[limit - 1]._id : null };
  },

  getAgreement(id: string) {
    const items = read<any>(AGREEMENTS_KEY);
    const found = items.find((a) => a._id === id && a.tenantId === TENANT);
    return found ? { ...found, id: found._id } : undefined;
  },

  // ---------- Alerts ----------
  listAlerts(q: { type?: string; severity?: string; includeDismissed?: boolean; limit?: number } = {}) {
    let items = read<any>(ALERTS_KEY).filter((a) => a.tenantId === TENANT && a.expiresAt > new Date().toISOString());
    if (!q.includeDismissed) items = items.filter((a) => !a.dismissed);
    if (q.type) items = items.filter((a) => a.type === q.type);
    if (q.severity) items = items.filter((a) => a.severity === q.severity);
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = q.limit ?? 50;
    const unreadCount = items.filter((a) => !a.read && !a.dismissed).length;
    return { items: items.slice(0, limit), unreadCount };
  },

  // ---------- Commands ----------
  command(cmd: CmdIn): any {
    try {
      const correlationId = cmd._id;
      const t = cmd.type;

      if (t === "cmd.todo.create") {
        const p = cmd.payload as Record<string, unknown>;
        const assignTo = (p.assignTo as string | null) ?? null;
        const todo: Todo = {
          _id: ulid(),
          title: String(p.title ?? ""),
          notes: (p.notes as string) ?? "",
          status: assignTo && assignTo !== USER ? "pending-accept" : "open",
          priority: (p.priority as Todo["priority"]) ?? "med",
          dueAt: (p.dueAt as string | null) ?? null,
          entityType: (p.entityType as Todo["entityType"]) ?? "none",
          entityId: (p.entityId as string | null) ?? null,
          createdBy: USER,
          assignedTo: assignTo,
          tenantId: TENANT,
          createdAt: nowISO(),
          updatedAt: nowISO(),
          completedAt: null,
        };
        const list = read<Todo>(TODOS_KEY); list.unshift(todo); write(TODOS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.todo.created" as const, payload: { todo } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id] };
      }

      if (t.startsWith("cmd.todo.")) {
        const todoId = (cmd.payload as { todoId: string }).todoId;
        const list = read<Todo>(TODOS_KEY);
        const idx = list.findIndex((x) => x._id === todoId);
        if (idx < 0) return { ok: false, error: "Todo not found" };
        const cur = list[idx];
        const patch: Partial<Todo> = { updatedAt: nowISO() };
        let evtType: DomainEvent["type"] = "evt.todo.updated";
        let payload: Record<string, unknown> = { todoId, patch };
        if (t === "cmd.todo.accept")   { patch.status = "accepted";  evtType = "evt.todo.accepted";  payload = { todoId, by: USER }; }
        if (t === "cmd.todo.decline")  { patch.status = "cancelled"; evtType = "evt.todo.declined";  payload = { todoId, by: USER, reason: (cmd.payload as { reason?: string }).reason ?? null }; }
        if (t === "cmd.todo.complete") { patch.status = "done"; patch.completedAt = nowISO(); evtType = "evt.todo.completed"; payload = { todoId, by: USER }; }
        if (t === "cmd.todo.cancel")   { patch.status = "cancelled"; evtType = "evt.todo.cancelled"; payload = { todoId, by: USER }; }
        if (t === "cmd.todo.assign")   {
          const assignTo = (cmd.payload as { assignTo: string }).assignTo;
          patch.assignedTo = assignTo; patch.status = assignTo === USER ? "accepted" : "pending-accept";
          evtType = "evt.todo.assigned"; payload = { todoId, assignTo, pending: assignTo !== USER };
        }
        list[idx] = { ...cur, ...patch }; write(TODOS_KEY, list);
        const evt = { ...env(correlationId), type: evtType, payload } as unknown as DomainEvent;
        emit(evt);
        return { ok: true, eventIds: [evt._id] };
      }

      if (t === "cmd.activity.log") {
        const p = cmd.payload as Record<string, unknown>;
        const activity: Activity = {
          _id: ulid(),
          entityType: p.entityType as Activity["entityType"],
          entityId: String(p.entityId),
          kind: p.kind as Activity["kind"],
          subject: String(p.subject ?? ""),
          body: (p.body as string) ?? "",
          direction: (p.direction as Activity["direction"]) ?? "internal",
          outcome: (p.outcome as Activity["outcome"]) ?? null,
          durationSec: (p.durationSec as number) ?? 0,
          occurredAt: (p.occurredAt as string) ?? nowISO(),
          scheduledFor: (p.scheduledFor as string | null) ?? null,
          relatedTodoId: (p.relatedTodoId as string | null) ?? null,
          meta: (p.meta as Record<string, unknown>) ?? {},
          actor: USER, tenantId: TENANT, createdAt: nowISO(),
        };
        const list = read<Activity>(ACTS_KEY); list.unshift(activity); write(ACTS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.activity.logged" as const, payload: { activity } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id] };
      }

      if (t === "cmd.activity.delete") {
        const activityId = (cmd.payload as { activityId: string }).activityId;
        const list = read<Activity>(ACTS_KEY);
        const item = list.find((a) => a._id === activityId);
        if (!item) return { ok: false, error: "Activity not found" };
        write(ACTS_KEY, list.filter((a) => a._id !== activityId));
        const evt = { ...env(correlationId), type: "evt.activity.deleted" as const, payload: { activityId, entityType: item.entityType, entityId: item.entityId } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id] };
      }

      // ----- Lead commands (mirror server/src/modules/leads/command-handlers.ts) -----
      if (t === "cmd.lead.create") {
        const p = cmd.payload as Record<string, unknown>;
        const lead: Lead = {
          _id: ulid(),
          name: normalizeLeadName(String(p.name ?? "")),
          phone: String(p.phone ?? ""),
          source: (p.source as string) ?? "manual",
          budget: Number(p.budget ?? 0),
          budgetText: String(p.budgetText ?? ""),
          moveInDate: String(p.moveInDate ?? new Date().toISOString().slice(0, 10)),
          preferredArea: String(p.preferredArea ?? ""),
          zoneId: (p.zoneId as string | null) ?? null,
          assignedTcmId: (p.assigneeId as string | null) ?? null,
          stage: "new",
          intent: (p.intent as Lead["intent"]) ?? "warm",
          confidence: 50,
          tags: (p.tags as string[]) ?? [],
          propertySelection: p.propertySelection as Lead["propertySelection"],
          nextFollowUpAt: null,
          responseSpeedMins: 0,
          email: (p.email as string) ?? "",
          areas: (p.areas as string[]) ?? [],
          fullAddress: (p.fullAddress as string) ?? "",
          type: (p.type as string) ?? "",
          room: (p.room as string) ?? "",
          need: (p.need as string) ?? "",
          inBLR: (p.inBLR as boolean | null) ?? null,
          quality: (p.quality as Lead["quality"]) ?? null,
          specialReqs: (p.specialReqs as string) ?? "",
          notes: (p.notes as string) ?? "",
          zoneCategory: (p.zoneCategory as string) ?? "",
          assigneeId: (p.assigneeId as string | null) ?? null,
          stageLabel: (p.stageLabel as string) ?? "",
          priorityScore: 0,
          priorityState: "COLD",
          nextBestAction: null,
          priorityReason: null,
          suggestedProperties: [],
          createdAt: nowISO(), updatedAt: nowISO(),
          createdBy: USER, tenantId: TENANT,
        };
        const list = read<Lead>(LEADS_KEY); list.unshift(lead); write(LEADS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.lead.created" as const, payload: { lead } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id] };
      }

      if (t === "cmd.lead.update") {
        const p = cmd.payload as { leadId: string; patch: Partial<Lead> };
        const list = read<Lead>(LEADS_KEY);
        const idx = list.findIndex((l) => l._id === p.leadId);
        if (idx < 0) return { ok: false, error: "Lead not found" };
        const patch = {
          ...p.patch,
          ...(p.patch.name != null ? { name: normalizeLeadName(p.patch.name) } : {}),
          updatedAt: nowISO(),
        };
        list[idx] = { ...list[idx], ...patch } as Lead;
        write(LEADS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.lead.updated" as const, payload: { leadId: p.leadId, patch } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id] };
      }

      if (t === "cmd.lead.assign") {
        const p = cmd.payload as { leadId: string; tcmId: string };
        const list = read<Lead>(LEADS_KEY);
        const idx = list.findIndex((l) => l._id === p.leadId);
        if (idx < 0) return { ok: false, error: "Lead not found" };
        list[idx] = { ...list[idx], assignedTcmId: p.tcmId, assigneeId: p.tcmId, updatedAt: nowISO() };
        write(LEADS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.lead.assigned" as const, payload: { leadId: p.leadId, tcmId: p.tcmId } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id] };
      }

      if (t === "cmd.lead.change_stage") {
        const p = cmd.payload as { leadId: string; to: Lead["stage"] };
        const list = read<Lead>(LEADS_KEY);
        const idx = list.findIndex((l) => l._id === p.leadId);
        if (idx < 0) return { ok: false, error: "Lead not found" };
        const from = list[idx].stage;
        list[idx] = { ...list[idx], stage: p.to, updatedAt: nowISO() };
        write(LEADS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.lead.stage_changed" as const, payload: { leadId: p.leadId, from, to: p.to } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id] };
      }

      if (t === "cmd.lead.delete") {
        const p = cmd.payload as { leadId: string };
        const list = read<Lead>(LEADS_KEY);
        if (!list.some((l) => l._id === p.leadId)) return { ok: false, error: "Lead not found" };
        write(LEADS_KEY, list.filter((l) => l._id !== p.leadId));
        const evt = { ...env(correlationId), type: "evt.lead.deleted" as const, payload: { leadId: p.leadId } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id] };
      }

      if (t === "cmd.tour.schedule") {
        const p = cmd.payload as {
          leadId: string;
          propertyId?: string | null;
          tcmId: string;
          scheduledAt: string;
          bookingSource?: string;
          tourType?: "physical" | "virtual" | "pre-book-pitch";
        };
        const tour: Tour = {
          _id: ulid(),
          leadId: p.leadId,
          propertyId: p.propertyId ?? null,
          assignedTo: p.tcmId,
          scheduledBy: USER,
          scheduledAt: p.scheduledAt,
          status: "scheduled",
          showUp: false,
          customPropertyName: "",
          bookingSource: p.bookingSource ?? "whatsapp",
          tourType: p.tourType ?? "physical",
          postTour: { outcome: null, confidence: 0, objection: null, objectionNote: "", expectedDecisionAt: null, nextFollowUpAt: null, filledAt: null },
          location: null,
          createdAt: nowISO(),
          updatedAt: nowISO(),
          tenantId: TENANT,
        };
        const list = read<Tour>(TOURS_KEY); list.unshift(tour); write(TOURS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.tour.scheduled" as const, payload: { tour } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id], data: { tour } };
      }

      if (t === "cmd.tour.reschedule") {
        const p = cmd.payload as { tourId: string; scheduledAt: string };
        const list = read<Tour>(TOURS_KEY);
        const idx = list.findIndex((x) => x._id === p.tourId);
        if (idx < 0) return { ok: false, error: "Tour not found" };
        list[idx] = { ...list[idx], scheduledAt: p.scheduledAt, updatedAt: nowISO() };
        write(TOURS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.tour.rescheduled" as const, payload: { tourId: p.tourId, scheduledAt: p.scheduledAt } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id], data: { tour: list[idx] } };
      }

      if (t === "cmd.tour.cancel") {
        const p = cmd.payload as { tourId: string };
        const list = read<Tour>(TOURS_KEY);
        const idx = list.findIndex((x) => x._id === p.tourId);
        if (idx < 0) return { ok: false, error: "Tour not found" };
        list[idx] = { ...list[idx], status: "cancelled", updatedAt: nowISO() };
        write(TOURS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.tour.cancelled" as const, payload: { tourId: p.tourId } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id], data: { tour: list[idx] } };
      }

      if (t === "cmd.tour.complete") {
        const p = cmd.payload as { tourId: string };
        const list = read<Tour>(TOURS_KEY);
        const idx = list.findIndex((x) => x._id === p.tourId);
        if (idx < 0) return { ok: false, error: "Tour not found" };
        list[idx] = { ...list[idx], status: "completed", updatedAt: nowISO() };
        write(TOURS_KEY, list);
        const leads = read<Lead>(LEADS_KEY);
        const leadIdx = leads.findIndex((l) => l._id === list[idx].leadId);
        if (leadIdx >= 0) {
          leads[leadIdx] = { ...leads[leadIdx], stage: "tour-done", updatedAt: nowISO() };
          write(LEADS_KEY, leads);
        }
        const evt = { ...env(correlationId), type: "evt.tour.completed" as const, payload: { tourId: p.tourId } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id], data: { tour: list[idx] } };
      }

      if (t === "cmd.tour.update") {
        const p = cmd.payload as { tourId: string; patch: Partial<Tour> };
        const list = read<Tour>(TOURS_KEY);
        const idx = list.findIndex((x) => x._id === p.tourId);
        if (idx < 0) return { ok: false, error: "Tour not found" };
        list[idx] = { ...list[idx], ...p.patch, updatedAt: nowISO() };
        write(TOURS_KEY, list);
        if (p.patch.status === "no-show") {
          const leads = read<Lead>(LEADS_KEY);
          const leadIdx = leads.findIndex((l) => l._id === list[idx].leadId);
          if (leadIdx >= 0) {
            leads[leadIdx] = { ...leads[leadIdx], stage: "contacted", updatedAt: nowISO() };
            write(LEADS_KEY, leads);
          }
        }
        const evt = { ...env(correlationId), type: "evt.tour.updated" as const, payload: { tourId: p.tourId, patch: p.patch } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id], data: { tour: list[idx] } };
      }

      if (t === "cmd.tour.update_post_tour") {
        const p = cmd.payload as { tourId: string; patch: Record<string, unknown> };
        const list = read<Tour>(TOURS_KEY);
        const idx = list.findIndex((x) => x._id === p.tourId);
        if (idx < 0) return { ok: false, error: "Tour not found" };
        const next = { ...list[idx], postTour: { ...list[idx].postTour, ...(p.patch as Partial<Tour["postTour"]>) }, updatedAt: nowISO() };
        list[idx] = next;
        write(TOURS_KEY, list);
        const evt = { ...env(correlationId), type: "evt.tour.updated" as const, payload: { tourId: p.tourId, patch: p.patch } };
        emit(evt as DomainEvent);
        return { ok: true, eventIds: [evt._id], data: { tour: next } };
      }

      // ----- Media commands -----
      if (t === "cmd.media.upload") {
        const p = cmd.payload as { propertyId: string; roomId?: string; image: string; caption?: string; isPrimary?: boolean };
        const item = {
          _id: ulid(),
          propertyId: p.propertyId,
          roomId: p.roomId ?? "",
          fileName: p.image,
          originalName: "upload.jpg",
          mimeType: "image/jpeg",
          size: 0,
          caption: p.caption ?? "",
          isPrimary: p.isPrimary ?? false,
          createdAt: nowISO(),
        };
        const list = read<any>(MEDIA_KEY);
        if (p.isPrimary) {
          list.forEach((m: any) => { if (m.propertyId === p.propertyId) m.isPrimary = false; });
        }
        list.unshift(item);
        write(MEDIA_KEY, list);
        return { ok: true, eventIds: [item._id], data: { id: item._id, url: p.image, caption: p.caption, isPrimary: p.isPrimary } };
      }

      if (t === "cmd.media.delete") {
        const mediaId = (cmd.payload as { id: string }).id;
        write(MEDIA_KEY, read<any>(MEDIA_KEY).filter((m: any) => m._id !== mediaId));
        return { ok: true, eventIds: [] };
      }

      if (t === "cmd.media.setPrimary") {
        const mediaId = (cmd.payload as { id: string }).id;
        const list = read<any>(MEDIA_KEY);
        const item = list.find((m: any) => m._id === mediaId);
        if (item) {
          list.forEach((m: any) => { if (m.propertyId === item.propertyId) m.isPrimary = false; });
          item.isPrimary = true;
          write(MEDIA_KEY, list);
        }
        return { ok: true, eventIds: [] };
      }

      // ----- WhatsApp commands -----
      if (t === "cmd.whatsapp.send") {
        const p = cmd.payload as { conversationId?: string; text: string; mediaUrl?: string; phone?: string; leadName?: string; leadId?: string };
        let convId = p.conversationId;
        const convs = read<any>(WHATSAPP_CONV_KEY);
        if (!convId) {
          const existing = convs.find((c: any) => c.phone === p.phone && c.tenantId === TENANT);
          if (existing) {
            convId = existing._id;
          } else {
            convId = ulid();
            const newConv = {
              _id: convId,
              tenantId: TENANT,
              leadId: p.leadId || "",
              leadName: p.leadName || p.phone,
              phone: p.phone,
              assignedTo: USER,
              lastMessage: p.text,
              lastMessageAt: nowISO(),
              unreadCount: 0,
              status: "active",
              tags: [],
              createdAt: nowISO(),
              updatedAt: nowISO(),
            };
            convs.push(newConv);
            write(WHATSAPP_CONV_KEY, convs);
          }
        }
        const msg = {
          _id: ulid(),
          tenantId: TENANT,
          conversationId: convId,
          direction: "outbound",
          text: p.text,
          mediaUrl: p.mediaUrl ?? "",
          status: "sent",
          sentById: USER,
          sentByName: "You",
          createdAt: nowISO(),
        };
        const msgs = read<any>(WHATSAPP_MSG_KEY);
        msgs.push(msg);
        write(WHATSAPP_MSG_KEY, msgs);
        // Update conversation last message
        const convIdx = convs.findIndex((c: any) => c._id === convId);
        if (convIdx >= 0) {
          convs[convIdx] = { ...convs[convIdx], lastMessage: p.text, lastMessageAt: nowISO(), updatedAt: nowISO() };
          write(WHATSAPP_CONV_KEY, convs);
        }
        return { ok: true, eventIds: [msg._id], data: { ...msg, id: msg._id, conversationId: convId } };
      }

      if (t === "cmd.whatsapp.archive") {
        const p = cmd.payload as { id: string; archived: boolean };
        const convs = read<any>(WHATSAPP_CONV_KEY);
        const idx = convs.findIndex((c: any) => c._id === p.id);
        if (idx >= 0) {
          convs[idx] = { ...convs[idx], status: p.archived ? "archived" : "active", updatedAt: nowISO() };
          write(WHATSAPP_CONV_KEY, convs);
        }
        return { ok: true, eventIds: [] };
      }

      // ----- Agreement commands -----
      if (t === "cmd.agreement.create") {
        const p = cmd.payload as Record<string, unknown>;
        const agr = {
          _id: ulid(),
          tenantId: TENANT,
          bookingId: String(p.bookingId ?? ""),
          leadId: String(p.leadId ?? ""),
          tenantName: String(p.tenantName ?? ""),
          tenantPhone: String(p.tenantPhone ?? ""),
          propertyName: String(p.propertyName ?? ""),
          propertyAddress: String(p.propertyAddress ?? ""),
          roomNumber: String(p.roomNumber ?? ""),
          rent: Number(p.rent ?? 0),
          deposit: Number(p.deposit ?? 0),
          moveInDate: String(p.moveInDate ?? ""),
          duration: Number(p.duration ?? 11),
          noticePeriod: Number(p.noticePeriod ?? 30),
          status: "draft",
          signedByTenantAt: "",
          signedByOwnerAt: "",
          pdfData: "",
          createdBy: USER,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        const list = read<any>(AGREEMENTS_KEY);
        list.unshift(agr);
        write(AGREEMENTS_KEY, list);
        return { ok: true, eventIds: [agr._id], data: { id: agr._id, bookingId: agr.bookingId, tenantName: agr.tenantName, status: agr.status, createdAt: agr.createdAt } };
      }

      if (t === "cmd.agreement.update") {
        const p = cmd.payload as { id: string; patch: Record<string, unknown> };
        const list = read<any>(AGREEMENTS_KEY);
        const idx = list.findIndex((a: any) => a._id === p.id && a.tenantId === TENANT);
        if (idx < 0) return { ok: false, error: "Agreement not found" };
        list[idx] = { ...list[idx], ...p.patch, updatedAt: nowISO() };
        write(AGREEMENTS_KEY, list);
        return { ok: true, eventIds: [] };
      }

      if (t === "cmd.agreement.sign") {
        const p = cmd.payload as { id: string; role: "tenant" | "owner" };
        const list = read<any>(AGREEMENTS_KEY);
        const idx = list.findIndex((a: any) => a._id === p.id && a.tenantId === TENANT);
        if (idx < 0) return { ok: false, error: "Agreement not found" };
        const now = nowISO();
        if (p.role === "tenant") {
          list[idx] = { ...list[idx], status: "signed", signedByTenantAt: now, updatedAt: now };
        } else {
          list[idx] = { ...list[idx], status: "signed", signedByOwnerAt: now, updatedAt: now };
        }
        write(AGREEMENTS_KEY, list);
        return { ok: true, eventIds: [], data: { ok: true, status: "signed" } };
      }

      if (t === "cmd.agreement.savePdf") {
        const p = cmd.payload as { id: string; pdfData: string };
        const list = read<any>(AGREEMENTS_KEY);
        const idx = list.findIndex((a: any) => a._id === p.id && a.tenantId === TENANT);
        if (idx >= 0) {
          list[idx] = { ...list[idx], pdfData: p.pdfData, updatedAt: nowISO() };
          write(AGREEMENTS_KEY, list);
        }
        return { ok: true, eventIds: [] };
      }

      if (t === "cmd.agreement.delete") {
        const id = (cmd.payload as { id: string }).id;
        write(AGREEMENTS_KEY, read<any>(AGREEMENTS_KEY).filter((a: any) => a._id !== id));
        return { ok: true, eventIds: [] };
      }

      // ----- Alert commands -----
      if (t === "cmd.alert.markRead") {
        const id = (cmd.payload as { id: string }).id;
        const list = read<any>(ALERTS_KEY);
        const idx = list.findIndex((a: any) => a._id === id);
        if (idx >= 0) { list[idx] = { ...list[idx], read: true }; write(ALERTS_KEY, list); }
        return { ok: true, eventIds: [] };
      }

      if (t === "cmd.alert.markAllRead") {
        const list = read<any>(ALERTS_KEY);
        list.forEach((a: any) => { if (!a.dismissed) a.read = true; });
        write(ALERTS_KEY, list);
        return { ok: true, eventIds: [] };
      }

      if (t === "cmd.alert.dismiss") {
        const id = (cmd.payload as { id: string }).id;
        const list = read<any>(ALERTS_KEY);
        const idx = list.findIndex((a: any) => a._id === id);
        if (idx >= 0) { list[idx] = { ...list[idx], dismissed: true }; write(ALERTS_KEY, list); }
        return { ok: true, eventIds: [] };
      }

      return { ok: true, eventIds: [] };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  // ---------- Funnel Analytics (local) ----------
  processFunnel(input: { tours: any[]; bookings: any[] }) {
    const { tours = [], bookings = [] } = input;

    // 1. Revenue Waterfall
    const avgBudget = tours.length > 0 ? tours.reduce((s: number, t: any) => s + t.budget, 0) / tours.length : 0;
    const scheduled = tours.length;
    const showed = tours.filter((t: any) => t.showUp === true).length;
    const completed = tours.filter((t: any) => t.status === "completed").length;
    const drafts = tours.filter((t: any) => t.outcome === "draft").length;
    const booked = tours.filter((t: any) => t.outcome === "booked" || t.outcome === "token-paid").length;
    const scheduledValue = scheduled * avgBudget;
    const showValue = showed * avgBudget;
    const draftValue = drafts * avgBudget;
    const bookedValue = bookings.reduce((s: number, b: any) => s + b.rentValue, 0);
    const noShowLeak = scheduledValue - showValue;
    const noDraftLeak = showValue - draftValue;
    const draftToBookLeak = draftValue - bookedValue;
    const biggestLeak = Math.max(noShowLeak, noDraftLeak, draftToBookLeak);
    const leakLabel = biggestLeak === noShowLeak ? "No-shows"
      : biggestLeak === noDraftLeak ? "Show but no draft" : "Draft but no booking";
    const waterfall = {
      stages: [
        { label: "Scheduled", value: Math.round(scheduledValue), count: scheduled, color: "#3b82f6" },
        { label: "Show-Ups", value: Math.round(showValue), count: showed, leak: Math.round(noShowLeak), color: "#8b5cf6" },
        { label: "Drafts", value: Math.round(draftValue), count: drafts, leak: Math.round(noDraftLeak), color: "#f59e0b" },
        { label: "Booked", value: Math.round(bookedValue), count: booked + bookings.filter((b: any) => !b.viaTour).length, leak: Math.round(draftToBookLeak), color: "#22c55e" },
      ],
      totalLeak: Math.round(noShowLeak + noDraftLeak + draftToBookLeak),
      leakLabel,
      conversionValue: Math.round(bookedValue),
      avgBudget: Math.round(avgBudget),
    };

    // 2. Tour Time Heatmap
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const hours = ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm"];
    const timeHeatmap = [];
    for (const day of days) {
      for (const hour of hours) {
        const matching = tours.filter((t: any) => {
          const d = new Date(t.tourDate);
          const dayOfWeek = (d.getDay() + 6) % 7;
          const tourHour = parseInt(t.tourTime?.split(":")[0] || "0", 10);
          const hourLabel = tourHour <= 12 ? `${tourHour}am` : `${tourHour - 12}pm`;
          return days[dayOfWeek] === day && hourLabel === hour;
        });
        const showUps = matching.filter((t: any) => t.showUp === true).length;
        const booked2 = matching.filter((t: any) => t.outcome === "booked" || t.outcome === "token-paid").length;
        timeHeatmap.push({
          day, hour,
          tours: matching.length,
          showUps,
          booked: booked2,
          rate: matching.length > 0 ? Math.round((booked2 / matching.length) * 100) : 0,
        });
      }
    }

    // 3. Loss Reason Intelligence
    const lost = tours.filter((t: any) => t.whyLost && t.whyLost !== "null");
    const totalLost = lost.length;
    const reasonCounts: Record<string, number> = {};
    for (const t of lost) { const r = t.whyLost!; reasonCounts[r] = (reasonCounts[r] || 0) + 1; }
    const recommendations: Record<string, string> = {
      price: "Consider offering flexible payment plans or a lower-floor unit",
      location: "Show properties in adjacent areas; highlight commute advantages",
      food: "Partner with nearby food courts; highlight pantry/kitchen options",
      delay: "Implement same-day tour scheduling; reduce wait time",
      comparing: "Create a comparison sheet vs competitors; offer limited-time perks",
      other: "Schedule a follow-up call to uncover the real objection",
    };
    const lossReasons = Object.entries(reasonCounts).map(([reason, count]) => ({
      reason, count,
      percentage: totalLost > 0 ? Math.round((count / totalLost) * 100) : 0,
      recommendation: recommendations[reason] || "Investigate further",
    })).sort((a, b) => b.count - a.count);

    // 4. Budget vs Actual Rent
    const linked = bookings
      .filter((b: any) => b.viaTour && b.tourId)
      .map((b: any) => {
        const tour = tours.find((t: any) => t.id === b.tourId || t._id === b.tourId);
        if (!tour) return null;
        return {
          leadName: b.leadName, area: b.area,
          budget: tour.budget, actualRent: b.rentValue,
          gap: b.rentValue - tour.budget,
          gapPct: tour.budget > 0 ? Math.round(((b.rentValue - tour.budget) / tour.budget) * 100) : 0,
          tcmName: tour.assignedToName,
        };
      }).filter(Boolean);
    const avgGap = linked.length > 0 ? linked.reduce((s: number, d: any) => s + d!.gapPct, 0) / linked.length : 0;
    const budgetVsActual = {
      points: linked,
      avgGapPct: Math.round(avgGap),
      totalLinked: linked.length,
      overBudget: linked.filter((d: any) => d!.gap > 0).length,
      underBudget: linked.filter((d: any) => d!.gap < 0).length,
    };

    // 5. TCM × Area Matrix
    const tcmMap = new Map<string, Map<string, { tours: number; booked: number }>>();
    for (const t of tours) {
      if (!tcmMap.has(t.assignedTo)) tcmMap.set(t.assignedTo, new Map());
      const areaMap = tcmMap.get(t.assignedTo)!;
      const area = t.area || t.zoneId;
      if (!areaMap.has(area)) areaMap.set(area, { tours: 0, booked: 0 });
      areaMap.get(area)!.tours++;
      if (t.outcome === "booked" || t.outcome === "token-paid") areaMap.get(area)!.booked++;
    }
    const allAreas = new Set<string>();
    const allTcms = new Set<string>();
    for (const t of tours) { allAreas.add(t.area || t.zoneId); allTcms.add(t.assignedTo); }
    const tcmNames: Record<string, string> = {};
    for (const t of tours) tcmNames[t.assignedTo] = t.assignedToName;
    const tcmAreaMatrix = {
      areas: [...allAreas],
      tcmIds: [...allTcms].map((id) => ({
        id, name: tcmNames[id],
        areas: [...allAreas].map((area) => {
          const data = tcmMap.get(id)?.get(area);
          return { area, tours: data?.tours || 0, booked: data?.booked || 0, rate: data && data.tours > 0 ? Math.round((data.booked / data.tours) * 100) : -1 };
        }),
      })),
    };

    // 6. Stale Tour Radar
    const now = Date.now();
    const active = tours.filter((t: any) => t.status !== "completed" && t.status !== "cancelled" && t.status !== "no-show");
    const staleTours = active.map((t: any) => {
      const createdAt = new Date(t.createdAt).getTime();
      const ageDays = Math.floor((now - createdAt) / 86_400_000);
      const tourDate = new Date(t.tourDate).getTime();
      const daysUntilTour = Math.floor((tourDate - now) / 86_400_000);
      let urgency: "critical" | "warning" | "info" = "info";
      if (ageDays >= 7 || daysUntilTour < 0) urgency = "critical";
      else if (ageDays >= 3) urgency = "warning";
      return {
        id: t.id || t._id, leadName: t.leadName, area: t.area,
        assignedToName: t.assignedToName, tourDate: t.tourDate, tourTime: t.tourTime,
        status: t.status, ageDays, daysUntilTour, urgency,
      };
    }).sort((a: any, b: any) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.urgency as keyof typeof order] - order[b.urgency as keyof typeof order] || a.daysUntilTour - b.daysUntilTour;
    });

    // 7. Conversion Velocity
    const dayMs = 86_400_000;
    const toTourDays = tours
      .filter((t: any) => t.tourDate && t.createdAt)
      .map((t: any) => (new Date(t.tourDate).getTime() - new Date(t.createdAt).getTime()) / dayMs)
      .filter((d: number) => d >= 0 && d < 90);
    const toBookingDays = bookings
      .filter((b: any) => b.viaTour && b.tourId)
      .map((b: any) => {
        const tour = tours.find((t: any) => t.id === b.tourId || t._id === b.tourId);
        if (!tour) return null;
        return (new Date(b.createdAt).getTime() - new Date(tour.tourDate).getTime()) / dayMs;
      }).filter((d: number | null): d is number => d !== null && d >= 0 && d < 90);
    const fullCycleDays = bookings
      .filter((b: any) => b.viaTour && b.tourId)
      .map((b: any) => {
        const tour = tours.find((t: any) => t.id === b.tourId || t._id === b.tourId);
        if (!tour) return null;
        return (new Date(b.createdAt).getTime() - new Date(tour.createdAt).getTime()) / dayMs;
      }).filter((d: number | null): d is number => d !== null && d >= 0 && d < 90);
    const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((s, d) => s + d, 0) / arr.length) * 10) / 10 : 0;
    const median = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      return Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
    };
    const conversionVelocity = {
      schedulingToTour: { avg: avg(toTourDays), median: median(toTourDays) },
      tourToBooking: { avg: avg(toBookingDays), median: median(toBookingDays) },
      fullCycle: { avg: avg(fullCycleDays), median: median(fullCycleDays) },
      sampleSize: fullCycleDays.length,
    };

    return {
      waterfall, timeHeatmap, lossReasons, budgetVsActual,
      tcmAreaMatrix, staleTours, conversionVelocity,
      processedAt: new Date().toISOString(),
    };
  },
};

export const isLocalMode = (): boolean => {
  if (typeof window === "undefined") return true;
  // Local mode if no VITE_API_URL was set, OR user explicitly opted in.
  const explicit = localStorage.getItem("gharpayy.force_local") === "1";
  const url = import.meta.env.VITE_API_URL as string | undefined;
  return explicit || !url;
};
