import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Settings2,
  Clock,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/store";
import { useAuthUser } from "@/lib/auth-store";
import { KIND_META, type CalEvent, type CalEventKind } from "@/lib/calendar-store";
import { MonthView } from "@/components/calendar/MonthView";
import { TimeGridView } from "@/components/calendar/TimeGridView";
import { AgendaView } from "@/components/calendar/AgendaView";
import { EventDialog } from "@/components/calendar/EventDialog";
import { headerLabel, navigate, type CalendarView } from "@/components/calendar/CalendarUtils";
import { format, isSameDay } from "date-fns";

export const Route = createFileRoute("/admin/calendar")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Admin Master Calendar" }] }),
  component: AdminCalendarPage,
});

// A stable palette of colors to assign to different TCMs
const TCM_COLORS = [
  "#3b82f6", // Blue
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#6366f1", // Indigo
  "#14b8a6", // Teal
];

function AdminCalendarPage() {
  const { tours, followUps, leads, properties, tcms } = useApp();
  const [view, setView] = useState<CalendarView>("week");
  const [focus, setFocus] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(new Date());
  const [editing, setEditing] = useState<{
    open: boolean;
    eventId?: string;
    event?: CalEvent;
    defaultStart?: Date;
  }>({ open: false });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CalEventKind | "all">("all");
  const [selectedTcmId, setSelectedTcmId] = useState<string>("all");

  const tcmColorMap = useMemo(() => {
    const map = new Map<string, string>();
    tcms.forEach((tcm, idx) => {
      map.set(tcm.id, TCM_COLORS[idx % TCM_COLORS.length]);
    });
    return map;
  }, [tcms]);

  const crmEvents = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];
    const leadMap = new Map(leads.map((l) => [l.id, l]));
    const propertyMap = new Map(properties.map((p) => [p.id, p]));

    for (const t of tours) {
      if (selectedTcmId !== "all" && t.tcmId !== selectedTcmId) continue;
      const lead = leadMap.get(t.leadId);
      const property = t.propertyId ? propertyMap.get(t.propertyId) : undefined;
      const start = new Date(t.scheduledAt);
      if (Number.isNaN(+start)) continue;
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      
      const assignedTcm = t.tcmId ? tcms.find(x => x.id === t.tcmId) : null;
      const tcmColor = t.tcmId ? tcmColorMap.get(t.tcmId) : undefined;

      out.push({
        id: `crm-tour-${t.id}`,
        title: lead ? `Tour · ${lead.name}` : "Tour",
        kind: "tour",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        leadId: t.leadId,
        tourId: t.id,
        location: property
          ? `${property.name} · ${property.area}`
          : lead?.preferredArea || undefined,
        description: [
          assignedTcm ? `TCM: ${assignedTcm.name}` : "Unassigned",
          lead?.phone ? `Phone: ${lead.phone}` : "",
          lead?.budget ? `Budget: ₹${Math.round(lead.budget / 1000)}k` : "",
          lead?.preferredArea ? `Area: ${lead.preferredArea}` : "",
          t.status ? `Tour status: ${t.status}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        reminder: 15,
        externalSource: "local",
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        color: tcmColor, 
      });
    }

    for (const f of followUps.filter((x) => !x.done)) {
      if (selectedTcmId !== "all" && f.tcmId !== selectedTcmId) continue;
      const lead = leadMap.get(f.leadId);
      const start = new Date(f.dueAt);
      if (Number.isNaN(+start)) continue;
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      
      const assignedTcm = f.tcmId ? tcms.find(x => x.id === f.tcmId) : null;
      const tcmColor = f.tcmId ? tcmColorMap.get(f.tcmId) : undefined;

      out.push({
        id: `crm-fu-${f.id}`,
        title: lead ? `Follow-up · ${lead.name}` : "Follow-up",
        kind: "follow-up",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        leadId: f.leadId,
        followUpId: f.id,
        description: [
          assignedTcm ? `TCM: ${assignedTcm.name}` : "Unassigned",
          f.reason,
          lead?.phone ? `Phone: ${lead.phone}` : "",
          lead?.preferredArea ? `Area: ${lead.preferredArea}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        reminder: f.priority === "urgent" ? 10 : 15,
        externalSource: "local",
        createdAt: start.toISOString(),
        updatedAt: start.toISOString(),
        color: tcmColor,
      });
    }
    return out;
  }, [followUps, leads, properties, tours, selectedTcmId, tcms, tcmColorMap]);

  const allEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return crmEvents
      .filter((e) => {
        if (filter !== "all" && e.kind !== filter) return false;
        if (!q) return true;
        return (
          (e.title || "").toLowerCase().includes(q) ||
          (e.location ?? "").toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  }, [crmEvents, search, filter]);

  const todayEvents = useMemo(
    () => allEvents.filter((event) => isSameDay(new Date(event.start), new Date())).slice(0, 6),
    [allEvents],
  );

  const openEvent = (e: CalEvent) => {
    setEditing({ open: true, eventId: e.id, event: e });
  };

  const openSlot = (start: Date) => {
    setEditing({ open: true, defaultStart: start });
  };

  const openDay = (d: Date) => {
    setSelectedDay(d);
  };

  const goToday = () => setFocus(new Date());

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Master Calendar</h1>
          <Badge variant="secondary" className="ml-1">
            {allEvents.length} events
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedTcmId} onValueChange={(v) => setSelectedTcmId(v)}>
            <SelectTrigger className="h-9 w-48 bg-muted/50">
              <Filter className="h-3.5 w-3.5 text-muted-foreground mr-2" />
              <SelectValue placeholder="All TCMs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All TCMs (Global)</SelectItem>
              {tcms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-2 h-2 rounded-full" 
                      style={{ background: tcmColorMap.get(t.id) || "#ccc" }} 
                    />
                    {t.name || t.id}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events"
              className="pl-8 h-9 w-56"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as CalEventKind | "all")}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(KIND_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                    {m.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setEditing({ open: true, defaultStart: selectedDay ?? new Date() })}
          >
            <Plus className="h-4 w-4 mr-1.5" /> New event
          </Button>
        </div>
      </div>

      {/* Sub-toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={goToday}>
            Today
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setFocus(navigate(view, focus, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setFocus(navigate(view, focus, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 font-display text-lg">{headerLabel(view, focus)}</span>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as CalendarView)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex gap-3">
        <aside className="hidden lg:flex flex-col w-64 border rounded-lg bg-card p-3 gap-3 overflow-auto">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Today's Overview
              </div>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {todayEvents.length}
              </Badge>
            </div>
            {todayEvents.length === 0 ? (
              <div className="rounded-md border border-dashed px-2 py-3 text-xs text-muted-foreground">
                No calendar work due today.
              </div>
            ) : (
              <div className="space-y-1.5">
                {todayEvents.map((event) => {
                  const meta = KIND_META[event.kind];
                  const color = event.color || meta.color;
                  return (
                    <button
                      key={event.id}
                      onClick={() => openEvent(event)}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-left text-xs transition hover:bg-accent/40"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: color }}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {event.allDay ? "All day" : format(new Date(event.start), "h:mm a")}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              TCM Legends
            </div>
            <ul className="space-y-1.5 text-xs max-h-[300px] overflow-auto pr-2">
              {tcms.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: tcmColorMap.get(t.id) || "#ccc" }} />
                  <span className="truncate">{t.name}</span>
                </li>
              ))}
              {tcms.length === 0 && <span className="text-muted-foreground italic">No TCMs loaded</span>}
            </ul>
          </div>
        </aside>

        {view === "month" && (
          <MonthView
            focus={focus}
            events={allEvents}
            onEventClick={openEvent}
            onDayClick={openDay}
            selectedDay={selectedDay}
          />
        )}
        {(view === "week" || view === "day") && (
          <TimeGridView
            focus={focus}
            events={allEvents}
            view={view}
            onEventClick={openEvent}
            onSlotClick={openSlot}
          />
        )}
        {view === "agenda" && <AgendaView events={allEvents} onEventClick={openEvent} />}
      </div>

      <EventDialog
        open={editing.open}
        onOpenChange={(v) => setEditing((s) => ({ ...s, open: v }))}
        eventId={editing.eventId}
        event={editing.event}
        defaultStart={editing.defaultStart}
      />
    </div>
  );
}
