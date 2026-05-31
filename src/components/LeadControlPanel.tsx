import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/api/client";
import { useAuthUser } from "@/lib/auth-store";
import { useApp, getProperty, getTcm } from "@/lib/store";
import type { Tour as CrmTour } from "@/lib/types";
import { useAppState } from "@/myt/lib/app-context";
import { Tour } from "@/myt/lib/types";
import { useOrgMembers, useActiveTcMs } from "@/hooks/useOrgDirectory";
import { notifyTourScheduled } from "@/lib/notifications";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBar, IntentChip, StageBadge } from "./atoms";
import { HandoffThread } from "./HandoffThread";
import { SequenceChip } from "./SequenceChip";
import { SupplyMatchPanel } from "./leads/SupplyMatchPanel";
import { PostVisitGate } from "./crm10x/PostVisitGate";
import { CommitmentBanner } from "./crm10x/CommitmentBanner";
import { ObjectionTag } from "./crm10x/ObjectionLogger";
import { LeadDossierPanel } from "./crm10x/LeadDossierPanel";
import { QuotationBuilder } from "./crm10x/QuotationBuilder";
import {
  Phone, MessageSquare, Calendar as CalendarIcon, Tag, ClipboardCheck,
  AlertTriangle, CheckCircle2, X, Activity as ActivityIcon, MapPin,
  Wallet, Send, Zap, IndianRupee, BellRing, ExternalLink,
  Building2, Video, Briefcase,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { formatTime12h } from "@/lib/utils";
import type { Lead, LeadStage, FollowUpPriority, SequenceKind } from "@/lib/types";
import { toast } from "sonner";
import { useMountedNow } from "@/hooks/use-now";
import { sendTourMessage as sendOwnerTourMessage } from "@/owner/messaging";
import { useSettings } from "@/myt/lib/settings-context";
import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { ActivityComposer } from "@/components/activities/ActivityComposer";
import { TodoPanel } from "@/components/todos/TodoPanel";
import { useActivities } from "@/hooks/useActivities";
import { allCatalogProperties } from "@/lib/crm10x/property-catalog";

const TAG_OPTIONS = ["price-issue", "location-mismatch", "parents-involved", "urgent", "budget-low"];
const OBJECTIONS = ["Budget", "Location", "Amenities", "Timing", "Parents", "Comparing options", "Other"];
const ROOM_TYPES = ["Single", "Double Sharing", "Triple Sharing", "Studio"];
const BOOKING_SOURCES = ["ad", "referral", "organic", "whatsapp", "call", "walk-in"];
const DECISION_MAKERS = ["self", "parent", "group"];
const OTHER_PROPERTY_VALUE = "__others__";
const TOUR_TYPES = [
  { value: "physical", label: "Physical", icon: Building2 },
  { value: "virtual", label: "Virtual", icon: Video },
  { value: "pre-book-pitch", label: "Pre-book", icon: Briefcase },
];
const TEMPLATES = [
  { id: "tour-confirm", label: "Tour confirmation", body: "Hi! Confirming your tour today. Looking forward to meeting you." },
  { id: "post-tour", label: "Post-tour check-in", body: "Hi! How did you find the property? Happy to answer any questions." },
  { id: "scarcity", label: "Scarcity", body: "Just a heads-up - only a couple of beds left at this price." },
];

function parseSafeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatSafeDate(value: string | null | undefined, pattern: string, fallback = "-"): string {
  const d = parseSafeDate(value);
  return d ? format(d, pattern) : fallback;
}

function formatSafeDistance(value: string | null | undefined, fallback = "recently"): string {
  const d = parseSafeDate(value);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : fallback;
}

type DrawerScheduleAnswers = {
  bookingSource: string;
  decisionMaker: string;
  moveInDate: string;
  budget: string;
  occupation: string;
  workLocation: string;
  roomType: string;
  readyIn48h: boolean;
  exploring: boolean;
  comparing: boolean;
  needsFamily: boolean;
  willBookToday: string;
  keyConcern: string;
  tourType: string;
};

export function LeadControlPanel() {
  const {
    selectedLeadId, selectLead, leads, properties, tours, activities, tcms,
    setLeadStage, setLeadIntent, setLeadFollowUp, addLeadTag, removeLeadTag,
    scheduleTour, cancelTour, rescheduleTour, completeTour, setDecision, updatePostTour,
    addNote, logCall, sendMessage, autoAssignLead, startSequence, closeDeal,
    markHandoffsRead,
  } = useApp();
  const { currentMemberId, setTours } = useAppState();
  const { members: orgMembers } = useOrgMembers();
  const authUser = useAuthUser((s) => s.user);
  const { settings } = useSettings();

  const lead = useMemo(() => leads.find((l) => l.id === selectedLeadId) ?? null, [leads, selectedLeadId]);
  const tourPropertyOptions = useMemo(() => allCatalogProperties(properties), [properties]);

  // Mark handoffs read when this lead opens
  useEffect(() => {
    if (selectedLeadId) markHandoffsRead(selectedLeadId);
  }, [selectedLeadId, markHandoffsRead]);

  const leadTours = useMemo(
    () => (lead
      ? tours
          .filter((tour) => {
            // Match by leadId (primary), then fallback to phone/name for legacy tours
            if (tour.leadId === lead.id) return true;
            return tour.phone === lead.phone || tour.leadName === lead.name;
          })
          .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
      : []),
    [tours, lead],
  );
  const leadActivities = useMemo(
    () => (lead ? activities.filter((a) => a.leadId === lead.id).slice(0, 30) : []),
    [activities, lead],
  );

  const { tcms: activeTcms } = useActiveTcMs();
  const tcmUsers = useMemo(() => {
    if (activeTcms && activeTcms.length > 0) {
      return activeTcms.map((a: any) => ({ id: a.id, name: a.fullName ?? a.name, role: a.role ?? "tcm", zones: a.zones ?? [] }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return orgMembers
      .filter((m) => m.role === "tcm" || m.isTcm !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [orgMembers, activeTcms]);
  const scheduleAssignees = useMemo(() => {
    if (authUser?.role !== "member") return tcmUsers;

    const selfFromDirectory = orgMembers.find((m) => m.id === authUser.id);
    const selfOption = selfFromDirectory
      ? { ...selfFromDirectory }
      : {
          id: authUser.id,
          name: authUser.fullName || authUser.username || authUser.email,
          role: "member",
          zones: authUser.zones ?? [],
        };

    const unique = new Map<string, typeof selfOption>();
    for (const tcm of tcmUsers) unique.set(tcm.id, tcm);
    // Include the current user as an option only if they have TCM capability
    if (authUser?.isTcm) unique.set(selfOption.id, selfOption);
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [authUser, orgMembers, tcmUsers]);
  const defaultSelfAssigneeId = useMemo(() => {
    if (!authUser?.id) return "";
    if (authUser.role !== "tcm" && authUser.role !== "member") return "";
    return scheduleAssignees.some((option) => option.id === authUser.id) ? authUser.id : "";
  }, [authUser, scheduleAssignees]);

  // Tour scheduling form state
  const [tcmId, setTcmId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduleAnswers, setScheduleAnswers] = useState({
    bookingSource: "whatsapp",
    decisionMaker: "self",
    moveInDate: "",
    budget: "",
    occupation: "",
    workLocation: "",
    roomType: "Single",
    readyIn48h: false,
    exploring: false,
    comparing: false,
    needsFamily: false,
    willBookToday: "maybe",
    keyConcern: "",
    tourType: "physical",
  });
  const [tab, setTab] = useState("dossier");
  const [, mounted] = useMountedNow();

  // Note state
  const [note, setNote] = useState("");
  const [customMsg, setCustomMsg] = useState("");

  const pendingPostTour = leadTours.find(
    (t) => t.status === "completed" && !t.postTour.filledAt,
  );
  const upcomingTour = leadTours.find((t) => t.status === "scheduled");
  const hasScheduledTour = Boolean(upcomingTour) || lead?.stage === "tour-scheduled";
  const scheduledTourActivity = leadActivities.find((a) => (a.kind === "tour_scheduled" || a.kind === "site_visit") && a.tourId) ?? null;
  const scheduledTourFromActivity = scheduledTourActivity?.tourId
    ? tours.find((candidate) => candidate.id === scheduledTourActivity.tourId)
    : null;
  const tourToShow = upcomingTour ?? scheduledTourFromActivity ?? (hasScheduledTour ? leadTours[0] ?? null : null);

  useEffect(() => {
    if (!lead) return;
    const tourAssigneeId = tourToShow?.tcmId ?? "";
    const isSelfDefaultRole = authUser?.role === "tcm" || authUser?.role === "member";
    const roleDefaultAssignee = isSelfDefaultRole ? defaultSelfAssigneeId : "";
    const preferredAssignee = tourAssigneeId || lead.assignedTcmId || currentMemberId || "";
    const preferredExists = preferredAssignee
      ? scheduleAssignees.some((option) => option.id === preferredAssignee)
      : false;
    setTcmId(roleDefaultAssignee || (preferredExists ? preferredAssignee : ""));
    setPropertyId(tourToShow?.propertyId ?? "");
    setScheduledAt(tourToShow ? toLocal(tourToShow.scheduledAt) : "");
    setScheduleAnswers((answers) => ({
      ...answers,
      budget: String(lead.budget || ""),
      moveInDate: lead.moveInDate || "",
      workLocation: lead.preferredArea || "",
      keyConcern: lead.tags.join(", "),
    }));
    // Default to the Dossier tab when opening a lead. If there's a pending post-tour,
    // prefer the post form; otherwise show the dossier view by default.
    setTab(pendingPostTour ? "post" : "dossier");
  }, [
    authUser?.role,
    currentMemberId,
    defaultSelfAssigneeId,
    hasScheduledTour,
    lead,
    pendingPostTour,
    scheduleAssignees,
    // settings.matching.drawerDefaultTab intentionally removed — default is now 'tour'
    tourToShow,
  ]);

  useEffect(() => {
    if (!lead || !hasScheduledTour || leadTours.length > 0 || scheduledTourFromActivity) return;
    let cancelled = false;

    void (async () => {
      try {
        const { items } = await api.tours.list();
        if (cancelled) return;

        const wireTour = items.find((tour) => tour.leadId === lead.id && (tour.status === "scheduled" || tour.status === "confirmed"));
        if (!wireTour) return;

        // 1. Add to CRM store so tourToShow / leadTours can find it
        const crmTour: CrmTour = {
          id: wireTour._id,
          leadId: wireTour.leadId,
          propertyId: wireTour.propertyId ?? undefined,
          tcmId: wireTour.assignedTo,
          scheduledBy: wireTour.scheduledBy,
          scheduledAt: wireTour.scheduledAt,
          status: wireTour.status as CrmTour["status"],
          decision: null,
          postTour: {
            outcome: null,
            confidence: 0,
            objection: null,
            objectionNote: "",
            expectedDecisionAt: null,
            nextFollowUpAt: null,
            filledAt: null,
          },
          createdAt: wireTour.createdAt,
          updatedAt: wireTour.updatedAt ?? wireTour.createdAt,
        };
        useApp.setState((s) => ({
          tours: s.tours.some((t) => t.id === crmTour.id)
            ? s.tours.map((t) => (t.id === crmTour.id ? { ...t, ...crmTour } : t))
            : [crmTour, ...s.tours],
        }));

        // 2. Also add MYT-format tour for /myt/schedule
        const property = wireTour.propertyId ? properties.find((p) => p.id === wireTour.propertyId) : undefined;
        const assignedTo = orgMembers.find((member) => member.id === wireTour.assignedTo);
        const scheduledBy = orgMembers.find((member) => member.id === wireTour.scheduledBy);
        const hydratedTour: Tour = {
          id: wireTour._id,
          leadId: wireTour.leadId,
          leadName: lead.name,
          phone: lead.phone || "",
          assignedTo: wireTour.assignedTo,
          assignedToName: assignedTo?.name ?? wireTour.assignedTo,
          propertyName: property?.name ?? "Property Tour",
          propertyId: wireTour.propertyId ?? undefined,
          area: lead.preferredArea || "",
          zoneId: "",
          tourDate: wireTour.scheduledAt.slice(0, 10),
          tourTime: wireTour.scheduledAt.slice(11, 16),
          bookingSource: wireTour.bookingSource as Tour["bookingSource"],
          scheduledBy: wireTour.scheduledBy,
          scheduledByName: scheduledBy?.name ?? wireTour.scheduledBy,
          leadType: "future",
          status: wireTour.status as Tour["status"],
          showUp: null,
          outcome: null,
          remarks: "",
          budget: lead.budget || 0,
          createdAt: wireTour.createdAt,
          tourType: "physical",
          intent: "medium",
          confidenceScore: 50,
          confidenceReason: [],
          confirmationStrength: "tentative",
          qualification: {
            moveInDate: lead.moveInDate || "",
            decisionMaker: "self",
            roomType: "Single",
            occupation: "",
            workLocation: lead.preferredArea || "",
            willBookToday: "maybe",
            readyIn48h: false,
            exploring: false,
            comparing: false,
            needsFamily: false,
            keyConcern: "",
          },
          tokenPaid: false,
          whyLost: null,
        };

        setTours((prev) => (prev.some((tour) => tour.id === hydratedTour.id)
          ? prev.map((tour) => (tour.id === hydratedTour.id ? { ...tour, ...hydratedTour } : tour))
          : [hydratedTour, ...prev]));
      } catch (err) {
        console.warn("[LeadControlPanel] failed to hydrate scheduled tour:", (err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasScheduledTour, lead, leadTours.length, orgMembers, properties, scheduledTourFromActivity, setTours]);

  if (!lead) return null;

  const selectedMember = orgMembers.find((m) => m.id === lead.assignedTcmId) ?? null;

  const handleSchedule = async () => {
    if (!tcmId || !scheduledAt) {
      toast.error("Member and time are required");
      return;
    }
    const assignee = scheduleAssignees.find((m) => m.id === tcmId) ?? null;
    const scheduler = currentMemberId ? (orgMembers.find((m) => m.id === currentMemberId) ?? null) : null;

    try {
      const selectedPropertyId = propertyId === OTHER_PROPERTY_VALUE ? undefined : propertyId || undefined;
      const tour = await scheduleTour({ leadId: lead.id, propertyId: selectedPropertyId, tcmId, scheduledAt: new Date(scheduledAt).toISOString() });

      // MYT tour is created by LiveToursBridge from the server event.
      // Only create a local MYT entry as a fast optimistic update so /myt/schedule
      // shows the tour immediately. LiveToursBridge will reconcile later.
      const scheduledDateTime = new Date(scheduledAt);
      const mytTour = {
        id: tour.id,
        leadId: lead.id,
        leadName: lead.name,
        phone: lead.phone || "",
        assignedTo: tcmId,
        assignedToName: assignee?.name ?? "Member",
        propertyName: selectedPropertyId ? properties.find((p) => p.id === selectedPropertyId)?.name ?? "Property Tour" : "Property Tour",
        propertyId: selectedPropertyId,
        area: lead.preferredArea || "",
        zoneId: "",
        tourDate: scheduledDateTime.toISOString().split('T')[0],
        tourTime: scheduledDateTime.toTimeString().split(' ')[0].substring(0, 5),
        bookingSource: "whatsapp" as const,
        scheduledBy: scheduler?.id ?? currentMemberId ?? tcmId,
        scheduledByName: scheduler?.name ?? "You",
        leadType: "future" as const,
        status: "scheduled" as const,
        showUp: null,
        outcome: null,
        remarks: "",
        budget: lead.budget || 0,
        createdAt: new Date().toISOString(),
        tourType: "physical" as const,
        intent: "medium" as const,
        confidenceScore: 50,
        confidenceReason: [],
        confirmationStrength: "tentative" as const,
        qualification: {
          moveInDate: lead.moveInDate || "",
          decisionMaker: "self" as const,
          roomType: "Single",
          budget: String(lead.budget || ""),
          occupation: "",
          workLocation: lead.preferredArea || "",
          readyIn48h: false,
          exploring: false,
          comparing: false,
          needsFamily: false,
          willBookToday: "maybe" as const,
          keyConcern: "",
          tourType: "physical" as const,
        },
        tokenPaid: false,
        whyLost: null,
      };
      setTours(prev => {
        // Avoid duplicates if LiveToursBridge already added it
        if (prev.some(t => t.id === mytTour.id)) return prev;
        return [mytTour, ...prev];
      });

      notifyTourScheduled({
        tourId: tour.id,
        leadName: lead.name,
        senderId: scheduler?.id ?? currentMemberId ?? tcmId,
        senderName: scheduler?.name ?? "You",
        assigneeName: assignee?.name ?? "Member",
        recipientIds: [
          { id: tcmId, name: assignee?.name ?? "Member" },
          ...(scheduler?.id && scheduler.id !== tcmId ? [{ id: scheduler.id, name: scheduler.name }] : []),
        ],
      });
      setTcmId(defaultSelfAssigneeId);
      setPropertyId("");
      setScheduledAt("");
      toast.success("Tour scheduled");
    } catch (err) {
      console.error("[LeadControlPanel] Failed to schedule tour:", err);
      toast.error("Failed to schedule tour. Please try again.");
    }
  };

  return (
    <Sheet open={!!selectedLeadId} onOpenChange={(o) => !o && selectLead(null)}>
      <SheetContent side="right" className="w-full p-0 flex flex-col" style={{ maxWidth: 560 }}>
        {/* Header block */}
        <SheetHeader className="px-5 py-4 border-b border-border space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-display text-lg leading-tight">{lead.name}</SheetTitle>
              <SheetDescription className="text-xs">
                {lead.phone} · via {lead.source}
              </SheetDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StageBadge stage={lead.stage} />
            <IntentChip intent={lead.intent} />
            <ConfidenceBar value={lead.confidence} />
            <ObjectionTag leadId={lead.id} />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
            <Meta icon={CalendarIcon} label="Move-in" value={formatSafeDate(lead.moveInDate, "MMM d", "TBD")} />
            <Meta icon={Wallet} label="Budget" value={`₹${(lead.budget / 1000).toFixed(0)}k`} />
            <Meta icon={MapPin} label="Area" value={lead.preferredArea} />
          </div>
        </SheetHeader>

        {/* CRM 10x - commitment banner + 48h post-visit gate */}
        <CommitmentBanner lead={lead} />
        <PostVisitGate lead={lead} />

        {/* Stale alert */}
        {pendingPostTour && (
          <div className="mx-5 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-destructive">Post-tour update missing</div>
              <div className="text-muted-foreground">
                Tour completed {mounted ? formatSafeDistance(pendingPostTour.scheduledAt, "recently") : "recently"}.
                TCM must fill the form below.
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <Tabs value={tab} onValueChange={setTab} className="px-5 py-4">
            <TabsList className="flex h-auto w-full overflow-x-auto gap-1 scrollbar-micro justify-start">
                <TabsTrigger value="dossier" className="text-xs shrink-0 whitespace-nowrap">Dossier</TabsTrigger>
                <TabsTrigger
                  value="tour"
                  className={`text-xs shrink-0 whitespace-nowrap ${tab === "tour" ? "rounded-md px-2 py-1 bg-accent/10 text-accent ring-1 ring-accent/20" : ""}`}
                >
                  Tour
                </TabsTrigger>
                <TabsTrigger value="quote" className="text-xs shrink-0 whitespace-nowrap">Quote</TabsTrigger>
                <TabsTrigger value="best-fit" className="text-xs shrink-0 whitespace-nowrap">Best Fit</TabsTrigger>
                <TabsTrigger value="control" className="text-xs shrink-0 whitespace-nowrap">Control</TabsTrigger>
                <TabsTrigger value="details" className="text-xs shrink-0 whitespace-nowrap">Details</TabsTrigger>
                <TabsTrigger value="handoff" className="text-xs shrink-0 whitespace-nowrap">Handoff</TabsTrigger>
                <TabsTrigger value="log" className="text-xs shrink-0 whitespace-nowrap">Log</TabsTrigger>
                <TabsTrigger value="post" className="text-xs shrink-0 whitespace-nowrap">
                  Post {pendingPostTour && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-destructive" />}
                </TabsTrigger>
                <TabsTrigger value="tasks" className="text-xs shrink-0 whitespace-nowrap">Tasks</TabsTrigger>
                <TabsTrigger value="activity" className="text-xs shrink-0 whitespace-nowrap">Activity</TabsTrigger>
              </TabsList>

            <TabsContent value="activity" className="space-y-3 pt-4">
              <LeadActivityTab leadId={lead.id} />
            </TabsContent>

            <TabsContent value="tasks" className="pt-4">
              <TodoPanel entityType="lead" entityId={lead.id} />
            </TabsContent>

            <TabsContent value="details" className="pt-4 space-y-4">
              <Section title="Lead Details (from creation)">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {lead.email && <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Email</Label><div>{lead.email}</div></div>}
                  {lead.type && <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Type</Label><div className="capitalize">{lead.type}</div></div>}
                  {lead.room && <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Room preference</Label><div className="capitalize">{lead.room}</div></div>}
                  {lead.need && <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Gender need</Label><div className="capitalize">{lead.need}</div></div>}
                  {lead.quality && <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Quality</Label><div className="capitalize">{lead.quality}</div></div>}
                  {lead.inBLR !== null && lead.inBLR !== undefined && <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">In BLR</Label><div>{lead.inBLR ? "Yes" : "No"}</div></div>}
                  {lead.zoneCategory && <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Zone Category</Label><div>{lead.zoneCategory}</div></div>}
                  <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Current Stage</Label><div className="capitalize">{lead.stage.replace("-", " ")}</div></div>
                </div>
                {lead.areas && lead.areas.length > 0 && (
                  <div className="space-y-1 mt-3">
                    <Label className="text-[10px] uppercase text-muted-foreground">Areas</Label>
                    <div className="text-sm">{lead.areas.join(", ")}</div>
                  </div>
                )}
                {lead.fullAddress && (
                  <div className="space-y-1 mt-3">
                    <Label className="text-[10px] uppercase text-muted-foreground">Full Address</Label>
                    <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded-md">{lead.fullAddress}</div>
                  </div>
                )}
                {lead.specialReqs && (
                  <div className="space-y-1 mt-3">
                    <Label className="text-[10px] uppercase text-muted-foreground">Special Requirements</Label>
                    <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded-md whitespace-pre-wrap">{lead.specialReqs}</div>
                  </div>
                )}
                {lead.notes && (
                  <div className="space-y-1 mt-3">
                    <Label className="text-[10px] uppercase text-muted-foreground">Original Notes</Label>
                    <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded-md whitespace-pre-wrap">{lead.notes}</div>
                  </div>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="dossier" className="space-y-4 pt-4">
              <LeadDossierPanel lead={lead} />
            </TabsContent>

            <TabsContent value="quote" className="space-y-4 pt-4">
              <QuotationBuilder lead={lead} />
            </TabsContent>

            <TabsContent value="best-fit" className="space-y-4 pt-4">
              <Section title="Best property matches">
                <SupplyMatchPanel lead={lead} onNavigateAway={() => selectLead(null)} />
              </Section>
            </TabsContent>

            {/* CONTROL - status, intent, follow-up, action engine, notes, tags */}
            <TabsContent value="control" className="space-y-4 pt-4">
              <SequenceChip leadId={lead.id} />

              <Section title="Routing">
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm" className="flex-1"
                    onClick={() => {
                      const r = autoAssignLead(lead.id);
                      const tcm = tcms.find((t) => t.id === r.tcmId);
                      toast.success(`Auto-routed to ${tcm?.name ?? "TCM"}`, { description: r.reasons.join(" · ") });
                    }}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1.5" /> Auto-route to best TCM
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Currently with <span className="text-foreground font-medium">{selectedMember?.name ?? "-"}</span>
                </div>
              </Section>

              <Section title="Status engine">
                <Select value={lead.stage} onValueChange={(v) => {
                  const prev = lead.stage;
                  const next = v as LeadStage;
                  void (async () => {
                    try {
                      await setLeadStage(lead.id, next);
                      if (v === "dropped") {
                        toast("Marked dropped", {
                          description: `${lead.name} → dropped`,
                          action: {
                            label: "Undo",
                            onClick: () => {
                              void setLeadStage(lead.id, prev)
                                .then(() => toast.success("Restored"))
                                .catch((err) => toast.error((err as Error).message || "Failed to restore stage"));
                            },
                          },
                          duration: 5000,
                        });
                      }
                    } catch (err) {
                      toast.error((err as Error).message || "Failed to update status");
                    }
                  })();
                }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["new","contacted","tour-scheduled","tour-done","negotiation","not-responding-3d","not-responding-7d","booked","dropped"] as LeadStage[]).map((s) => (
                      <SelectItem key={s} value={s} className="text-sm capitalize">{s.replace("-", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(["first-contact","post-tour","pre-decision","cold-revival"] as SequenceKind[]).map((k) => (
                    <Button
                      key={k} size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => { startSequence(lead.id, k); toast.success(`Started ${k} sequence`); }}
                    >
                      Start {k}
                    </Button>
                  ))}
                </div>
              </Section>

              <Section title="Action engine">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => { logCall(lead.id); toast.success("Call logged"); }}>
                    <Phone className="h-3.5 w-3.5 mr-1.5" /> Call
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { sendMessage(lead.id, "WhatsApp template sent"); toast.success("Message sent"); }}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Templates</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATES.map((t) => (
                      <Button
                        key={t.id} variant="secondary" size="sm" className="h-7 text-[11px]"
                        onClick={() => { sendMessage(lead.id, t.body); toast.success(`Sent: ${t.label}`); }}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={customMsg} onChange={(e) => setCustomMsg(e.target.value)}
                    placeholder="Custom message…" className="h-9 text-sm"
                  />
                  <Button
                    size="sm" disabled={!customMsg.trim()}
                    onClick={() => { sendMessage(lead.id, customMsg); setCustomMsg(""); toast.success("Sent"); }}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Section>

              <Section title="Follow-up engine">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Next follow-up</Label>
                    <Input
                      type="datetime-local"
                      defaultValue={lead.nextFollowUpAt ? toLocal(lead.nextFollowUpAt) : ""}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setLeadFollowUp(lead.id, new Date(e.target.value).toISOString(), priorityFor(lead.confidence));
                      }}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Priority</Label>
                    <Select
                      value={lead.intent === "hot" ? "high" : lead.intent === "warm" ? "medium" : "low"}
                      onValueChange={(v) => setLeadIntent(lead.id, v === "high" ? "hot" : v === "medium" ? "warm" : "cold")}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">Hot</SelectItem>
                        <SelectItem value="medium">Warm</SelectItem>
                        <SelectItem value="low">Cold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {lead.nextFollowUpAt && (
                  <div className="text-[11px] text-muted-foreground">
                    Due {mounted ? formatSafeDistance(lead.nextFollowUpAt, "soon") : "soon"}
                  </div>
                )}
              </Section>

              <Section title="Notes & signals">
                <div className="flex flex-wrap gap-1.5">
                  {lead.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px] gap-1">
                      <Tag className="h-2.5 w-2.5" />
                      {t}
                      <button onClick={() => removeLeadTag(lead.id, t)} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_OPTIONS.filter((t) => !lead.tags.includes(t)).map((t) => (
                    <button
                      key={t} onClick={() => addLeadTag(lead.id, t)}
                      className="text-[10px] px-2 py-0.5 rounded-md border border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note…" rows={2} className="text-sm resize-none"
                  />
                  <Button
                    size="sm" disabled={!note.trim()}
                    onClick={() => { addNote(lead.id, note); setNote(""); toast.success("Note added"); }}
                  >
                    Add
                  </Button>
                </div>
              </Section>
            </TabsContent>

            {/* TOUR */}
            <TabsContent value="tour" className="space-y-4 pt-4">
              {tourToShow ? (
                <Section title="Upcoming tour">
                  <UpcomingTourCard
                    tour={tourToShow}
                    members={orgMembers}
                    leadName={lead.name}
                  />
                </Section>
              ) : null}

              {!hasScheduledTour ? (
                <InlineScheduleTour
                  lead={lead}
                  properties={tourPropertyOptions}
                  tcms={scheduleAssignees}
                  propertyId={propertyId}
                  tcmId={tcmId}
                  scheduledAt={scheduledAt}
                  answers={scheduleAnswers}
                  onAnswersChange={(patch: Partial<DrawerScheduleAnswers>) => setScheduleAnswers((answers) => ({ ...answers, ...patch }))}
                  onPropertyChange={setPropertyId}
                  onTcmChange={setTcmId}
                  onScheduledAtChange={setScheduledAt}
                  onSchedule={handleSchedule}
                />
              ) : null}

              {leadTours.length > 1 && (
                <Section title="Tour history">
                  <div className="space-y-2">
                    {leadTours.slice(upcomingTour ? 1 : 0).map((t) => {
                      const prop = getProperty(t.propertyId, properties);
                      return (
                        <div key={t.id} className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{prop?.name}</span>
                            <span className="text-muted-foreground">{formatSafeDate(t.scheduledAt, "MMM d, p", "time unknown")}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <Badge variant="outline" className="capitalize">{t.status}</Badge>
                            {t.decision && <Badge variant="outline" className="capitalize">{t.decision}</Badge>}
                            {t.postTour.filledAt ? (
                              <span className="text-success inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Form complete</span>
                            ) : t.status === "completed" ? (
                              <span className="text-destructive inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Form pending</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </TabsContent>

            {/* POST-TOUR */}
            <TabsContent value="post" className="space-y-4 pt-4">
              {(() => {
                const target = pendingPostTour ?? leadTours.find((t) => t.status === "completed");
                if (!target) {
                  return (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      No completed tours yet. The post-tour form appears here once a tour is marked complete.
                    </div>
                  );
                }
                const prop = getProperty(target.propertyId, properties);
                const pt = target.postTour;
                return (
                  <div className="space-y-4">
                    <div className="text-xs text-muted-foreground">
                      Tour at <span className="text-foreground font-medium">{prop?.name}</span> · {formatSafeDate(target.scheduledAt, "MMM d, p", "time unknown")}
                    </div>

                    {/* Send updates / reminders - one row, always visible post-tour */}
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                        disabled={!prop}
                        onClick={() => {
                          if (!prop) return;
                          sendOwnerTourMessage('post_visit_thanks', {
                            tourId: target.id, leadName: lead.name, phone: lead.phone,
                            propertyName: prop.name, area: prop.area,
                            tourDate: target.scheduledAt.slice(0, 10),
                            tourTime: target.scheduledAt.slice(11, 16),
                            tcmName: tcms.find((t) => t.id === target.tcmId)?.name,
                          });
                          toast.success('Thank-you message opened');
                        }}
                      >
                        <ExternalLink className="h-3 w-3" /> Thank-you msg
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                        onClick={() => {
                          sendMessage(lead.id, 'Quick update - any thoughts on the property?');
                          toast.success('Update sent');
                        }}
                      >
                        <Send className="h-3 w-3" /> Send update
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                        onClick={() => {
                          const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                          setLeadFollowUp(lead.id, dueAt, priorityFor(pt.confidence), 'Post-tour reminder');
                          toast.success('Reminder set for tomorrow');
                        }}
                      >
                        <BellRing className="h-3 w-3" /> Set reminder
                      </Button>
                    </div>

                    <Section title="Outcome (mandatory · explicit)">
                      <div className="text-[11px] text-muted-foreground mb-1.5">
                        Choose carefully - the lead's stage <em>and</em> closure status update only when you click here.
                        Nothing is auto-assigned by the system.
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { o: "booked", label: "Booked ✓", tone: "default" as const, decision: "booked" as const },
                          { o: "thinking", label: "Still deciding", tone: "outline" as const, decision: "thinking" as const },
                          { o: "not-interested", label: "Not interested", tone: "outline" as const, decision: "dropped" as const },
                          { o: null, label: "Awaiting outcome (no change)", tone: "ghost" as const, decision: null },
                        ] as const).map((opt) => (
                          <Button
                            key={opt.label}
                            variant={pt.outcome === opt.o ? "default" : opt.tone}
                            size="sm" className="capitalize"
                            onClick={() => {
                              if (!confirm(`Confirm outcome: ${opt.label}? This updates the lead stage.`)) return;
                              updatePostTour(target.id, { outcome: opt.o });
                              if (opt.decision) setDecision(target.id, opt.decision);
                              toast.success(`Outcome set: ${opt.label}`);
                            }}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </Section>

                    <Section title={`Deal confidence - ${pt.confidence}%`}>
                      <input
                        type="range" min={0} max={100} value={pt.confidence}
                        onChange={(e) => updatePostTour(target.id, { confidence: +e.target.value })}
                        className="w-full accent-(--color-accent)"
                      />
                    </Section>

                    <Section title="Key objection">
                      <Select
                        value={pt.objection ?? ""}
                        onValueChange={(v) => updatePostTour(target.id, { objection: v })}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select objection" /></SelectTrigger>
                        <SelectContent>
                          {OBJECTIONS.map((o) => <SelectItem key={o} value={o} className="text-sm">{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Textarea
                        rows={2} placeholder="Note…" value={pt.objectionNote}
                        onChange={(e) => updatePostTour(target.id, { objectionNote: e.target.value })}
                        className="text-sm resize-none mt-2"
                      />
                    </Section>

                    <div className="grid grid-cols-2 gap-3">
                      <Section title="Expected decision">
                        <Input
                          type="date"
                          value={pt.expectedDecisionAt ? pt.expectedDecisionAt.slice(0, 10) : ""}
                          onChange={(e) => updatePostTour(target.id, { expectedDecisionAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                          className="h-9 text-sm"
                        />
                      </Section>
                      <Section title="Next follow-up">
                        <Input
                          type="datetime-local"
                          value={pt.nextFollowUpAt ? toLocal(pt.nextFollowUpAt) : ""}
                          onChange={(e) => updatePostTour(target.id, { nextFollowUpAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                          className="h-9 text-sm"
                        />
                      </Section>
                    </div>

                    {pt.filledAt ? (
                      <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span>Form complete · saved {mounted ? formatSafeDistance(pt.filledAt, "recently") : "recently"}</span>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex items-center gap-2 text-xs">
                        <ClipboardCheck className="h-4 w-4" />
                        <span>Fill all four fields to mark this lead complete and silence the alert.</span>
                      </div>
                    )}

                    {/* Close deal - one click, blocks the bed, fires the booking */}
                    {lead.stage !== "booked" && (
                      <Button
                        size="lg" className="w-full bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => {
                          closeDeal({
                            leadId: lead.id,
                            tourId: target.id,
                            propertyId: target.propertyId ?? "",
                            tcmId: target.tcmId,
                            amount: prop?.pricePerBed ?? 12000,
                          });
                          toast.success(`Deal closed · ${lead.name} → ${prop?.name}`, {
                            description: `Bed blocked, MRR +₹${((prop?.pricePerBed ?? 12000) / 1000).toFixed(0)}k`,
                          });
                        }}
                      >
                        <IndianRupee className="h-4 w-4 mr-1.5" /> Close deal · ₹{((prop?.pricePerBed ?? 12000) / 1000).toFixed(0)}k/mo
                      </Button>
                    )}
                    {lead.stage === "booked" && (
                      <div className="rounded-lg border border-success/40 bg-success/10 p-3 flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-5 w-5 text-success" />
                        <span className="font-semibold text-success">Booked.</span>
                        <span className="text-muted-foreground">Bed blocked, lead closed.</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </TabsContent>

            {/* HANDOFF - FlowOps ↔ TCM thread for this lead */}
            <TabsContent value="handoff" className="pt-4">
              <Section title="FlowOps ↔ TCM thread">
                <HandoffThread leadId={lead.id} />
              </Section>
            </TabsContent>

            {/* ACTIVITY LOG */}
            <TabsContent value="log" className="pt-4">
              <Section title="Activity log (auto)">
                <div className="space-y-2">
                  {leadActivities.length === 0 && (
                    <div className="text-xs text-muted-foreground">No activity yet.</div>
                  )}
                  {leadActivities.map((a) => (
                    <div key={a.id} className="flex gap-2 text-xs border-l-2 border-border pl-3 py-1">
                      <ActivityIcon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <div className="text-foreground">{a.text}</div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">
                          {formatSafeDate(a.ts, "MMM d, p", "time unknown")} · {a.actor === "system" ? "system" : tcms.find((t) => t.id === a.actor)?.name ?? a.actor}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{title}</div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof CalendarIcon; label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-2.5 w-2.5" /> {label}
      </div>
      <div className="text-xs font-medium text-foreground mt-0.5">{value}</div>
    </div>
  );
}

function UpcomingTourCard({
  tour,
  members,
  leadName,
}: {
  tour: import("@/lib/types").Tour;
  members: { id: string; name: string; role: string; zones: string[] }[];
  leadName?: string;
}) {
  const { properties, rescheduleTour, cancelTour } = useApp();
  const prop = properties.find((p) => p.id === tour.propertyId);
  
  // Handle both old CRM tour format (tcmId) and new MYT tour format (assignedTo, assignedToName)
  const assignedToId = (tour as any).assignedTo ?? (tour as any).tcmId;
  const assignedToName = (tour as any).assignedToName ?? members.find((m) => m.id === assignedToId)?.name ?? assignedToId ?? "TBD";
  const scheduledById = (tour as any).scheduledBy;
  const scheduledByName = (tour as any).scheduledByName ?? members.find((m) => m.id === scheduledById)?.name ?? scheduledById ?? "TBD";
  const tourType = (tour as any).tourType ?? "physical";
  const qualification = (tour as any).qualification;
  const displayLeadName = (tour as any).leadName ?? leadName ?? "";
  const phone = (tour as any).phone ?? "";
  const budget = (tour as any).budget ?? 0;
  const area = (tour as any).area ?? "";
  
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDateTime, setNewDateTime] = useState(() => toLocal(tour.scheduledAt));

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
      {/* Header with property and status */}
      <div className="flex items-center justify-between">
        <div className="font-display font-semibold text-sm">{prop?.name ?? (tour as any).propertyName ?? (displayLeadName ? `${displayLeadName}'s Tour` : "Property TBD")}</div>
        <Badge className="bg-accent text-accent-foreground capitalize">{tour.status}</Badge>
      </div>

      {/* Date, time, type */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarIcon className="h-3 w-3" />
          {formatSafeDate(tour.scheduledAt, "EEE, MMM d · p", "time unknown")}
        </span>
        <Badge variant="outline" className="text-[10px] capitalize">{tourType.replace("-", " ")}</Badge>
      </div>

      {/* Lead info row */}
      {(displayLeadName || phone) && (
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          {displayLeadName && (
            <div className="rounded-md bg-background/60 px-2 py-1.5">
              <span className="block text-muted-foreground">Lead</span>
              <span className="font-medium text-foreground">{displayLeadName}</span>
            </div>
          )}
          {phone && (
            <div className="rounded-md bg-background/60 px-2 py-1.5">
              <span className="block text-muted-foreground">Phone</span>
              <span className="font-medium text-foreground">{phone}</span>
            </div>
          )}
          {budget > 0 && (
            <div className="rounded-md bg-background/60 px-2 py-1.5">
              <span className="block text-muted-foreground">Budget</span>
              <span className="font-medium text-foreground">₹{(budget / 1000).toFixed(0)}k</span>
            </div>
          )}
        </div>
      )}

      {/* Assigned / Scheduled by */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <span className="block text-muted-foreground">Assigned to</span>
          <span className="font-medium text-foreground">{assignedToName}</span>
        </div>
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <span className="block text-muted-foreground">Scheduled by</span>
          <span className="font-medium text-foreground">{scheduledByName}</span>
        </div>
      </div>

      {/* Qualification details if available */}
      {qualification && (
        <div className="rounded-md border border-border bg-background/40 px-3 py-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Qualification</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            {qualification.moveInDate && (
              <div><span className="text-muted-foreground">Move-in:</span> <span className="font-medium">{qualification.moveInDate}</span></div>
            )}
            {qualification.roomType && (
              <div><span className="text-muted-foreground">Room:</span> <span className="font-medium">{qualification.roomType}</span></div>
            )}
            {qualification.decisionMaker && (
              <div><span className="text-muted-foreground">Decision:</span> <span className="font-medium capitalize">{qualification.decisionMaker}</span></div>
            )}
            {qualification.willBookToday && (
              <div><span className="text-muted-foreground">Book today:</span> <span className="font-medium capitalize">{qualification.willBookToday}</span></div>
            )}
            {qualification.workLocation && (
              <div><span className="text-muted-foreground">Work area:</span> <span className="font-medium">{qualification.workLocation}</span></div>
            )}
            {qualification.keyConcern && (
              <div className="col-span-2"><span className="text-muted-foreground">Concern:</span> <span className="font-medium">{qualification.keyConcern}</span></div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {qualification.readyIn48h && <Badge variant="secondary" className="text-[9px]">Ready in 48h</Badge>}
            {qualification.exploring && <Badge variant="secondary" className="text-[9px]">Exploring</Badge>}
            {qualification.comparing && <Badge variant="secondary" className="text-[9px]">Comparing</Badge>}
            {qualification.needsFamily && <Badge variant="secondary" className="text-[9px]">Family approval</Badge>}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {tour.status === "scheduled" && (
        <div className="flex flex-wrap gap-2 pt-1">
          {showReschedule ? (
            <div className="flex gap-2 w-full items-end">
              <div className="flex-1">
                <Label className="text-[10px] uppercase text-muted-foreground">New date & time</Label>
                <Input
                  type="datetime-local"
                  value={newDateTime}
                  onChange={(e) => setNewDateTime(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <Button
                size="sm" variant="default" className="h-8 text-xs"
                onClick={() => {
                  if (newDateTime) {
                    rescheduleTour(tour.id, new Date(newDateTime).toISOString());
                    setShowReschedule(false);
                    toast.success("Tour rescheduled");
                  }
                }}
              >
                Confirm
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowReschedule(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button
                size="sm" variant="outline" className="h-7 text-[11px]"
                onClick={() => setShowReschedule(true)}
              >
                <CalendarIcon className="h-3 w-3 mr-1" /> Reschedule
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 text-[11px] text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm("Cancel this tour?")) {
                    cancelTour(tour.id);
                    toast.success("Tour cancelled");
                  }
                }}
              >
                <X className="h-3 w-3 mr-1" /> Cancel Tour
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}


function InlineScheduleTour({
  lead,
  properties,
  tcms,
  propertyId,
  tcmId,
  scheduledAt,
  answers,
  onAnswersChange,
  onPropertyChange,
  onTcmChange,
  onScheduledAtChange,
  onSchedule,
}: {
  lead: Lead;
  properties: any[];
  tcms: any[];
  propertyId: string;
  tcmId: string;
  scheduledAt: string;
  answers: DrawerScheduleAnswers;
  onAnswersChange: (patch: Partial<DrawerScheduleAnswers>) => void;
  onPropertyChange: (value: string) => void;
  onTcmChange: (value: string) => void;
  onScheduledAtChange: (value: string) => void;
  onSchedule: () => void;
}) {
  return (
    <Section title="Schedule Tour in drawer">
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="text-xs text-muted-foreground">
          Lead is already known: <span className="font-medium text-foreground">{lead.name}</span>. Fill the tour details below and assign it to a TCM (members can also assign to themselves).
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-md bg-muted/60 px-2 py-1.5">
            <span className="block text-muted-foreground">Phone</span>
            <span className="font-medium text-foreground">{lead.phone}</span>
          </div>
          <div className="rounded-md bg-muted/60 px-2 py-1.5">
            <span className="block text-muted-foreground">Budget</span>
            <span className="font-medium text-foreground">₹{(lead.budget / 1000).toFixed(0)}k</span>
          </div>
          <div className="rounded-md bg-muted/60 px-2 py-1.5">
            <span className="block text-muted-foreground">Area</span>
            <span className="font-medium text-foreground">{lead.preferredArea}</span>
          </div>
        </div>
        <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            MYT Schedule questions
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Source">
              <Select value={answers.bookingSource} onValueChange={(v) => onAnswersChange({ bookingSource: v })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_SOURCES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Decision maker">
              <Select value={answers.decisionMaker} onValueChange={(v) => onAnswersChange({ decisionMaker: v })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECISION_MAKERS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Move-in">
              <Input
                type="date"
                value={answers.moveInDate}
                onChange={(e) => onAnswersChange({ moveInDate: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>
            <Field label="Budget">
              <Input
                type="number"
                value={answers.budget}
                onChange={(e) => onAnswersChange({ budget: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>
            <Field label="Work / College">
              <Input
                value={answers.occupation}
                onChange={(e) => onAnswersChange({ occupation: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>
            <Field label="Work location">
              <Input
                value={answers.workLocation}
                onChange={(e) => onAnswersChange({ workLocation: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>
          </div>
          <Field label="Room type">
            <Select value={answers.roomType} onValueChange={(v) => onAnswersChange({ roomType: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-1.5">
            {(
              [
                ["readyIn48h", "Ready to finalize within 48 hours"],
                ["exploring", "Only exploring"],
                ["comparing", "Comparing options"],
                ["needsFamily", "Needs family approval"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-2/40 px-2 py-1.5 text-xs"
              >
                <Checkbox
                  checked={answers[key]}
                  onCheckedChange={(v) => onAnswersChange({ [key]: v === true })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <Field label="Will book today">
            <Select value={answers.willBookToday} onValueChange={(v) => onAnswersChange({ willBookToday: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["yes", "maybe", "no"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Key concern">
            <Input
              value={answers.keyConcern}
              onChange={(e) => onAnswersChange({ keyConcern: e.target.value })}
              className="h-8 text-xs"
            />
          </Field>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Tour Type</Label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {TOUR_TYPES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onAnswersChange({ tourType: value })}
                className={`h-12 rounded-md border text-xs flex flex-col items-center justify-center gap-1 ${
                  answers.tourType === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface-2 text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Property</Label>
            <Select value={propertyId} onValueChange={onPropertyChange}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select Property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_PROPERTY_VALUE}>
                  Others
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">TCM</Label>
            <Select value={tcmId} onValueChange={onTcmChange}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select TCM" />
              </SelectTrigger>
              <SelectContent>
                {tcms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          {/* Separate date and time selectors. Time options: 09:00–21:00 every 30 minutes */}
          {(() => {
            const datePart = scheduledAt ? scheduledAt.split("T")[0] : "";
            const timePartRaw = scheduledAt && scheduledAt.includes("T") ? (scheduledAt.split("T")[1] || "").slice(0, 5) : "";
            const times: string[] = [];
            const pad = (n: number) => String(n).padStart(2, "0");
            for (let mins = 9 * 60; mins <= 21 * 60; mins += 30) {
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              times.push(`${pad(h)}:${pad(m)}`);
            }

            return (
              <div className="grid sm:grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={datePart}
                  onChange={(e) => {
                    const d = e.target.value;
                    const t = timePartRaw || "09:00";
                    onScheduledAtChange(d ? `${d}T${t}` : "");
                  }}
                  className="h-9 text-sm"
                />

                <Select value={timePartRaw} onValueChange={(v) => {
                  const d = datePart || new Date().toISOString().split('T')[0];
                  onScheduledAtChange(v ? `${d}T${v}` : "");
                }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {times.map((t) => (
                      <SelectItem key={t} value={t} className="text-sm">
                        {formatTime12h(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}

          <Button size="sm" onClick={onSchedule} className="gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" /> Schedule Tour
          </Button>
        </div>
      </div>
    </Section>
  );
}

function toLocal(iso: string) {
  const d = parseSafeDate(iso);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function priorityFor(c: number): FollowUpPriority {
  return c >= 75 ? "high" : c >= 50 ? "medium" : "low";
}

// Salesforce-style activity tab - backed by the new VPS contracts (or local
// adapter when offline). Auto-logs every system change AND lets the user
// quickly log calls, emails, WhatsApp, notes, meetings and site visits.
function LeadActivityTab({ leadId }: { leadId: string }) {
  const { activities, loading, log, remove } = useActivities({ entityType: "lead", entityId: leadId });
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card p-3">
        <ActivityComposer onLog={log} />
      </div>
      <ActivityTimeline activities={activities} loading={loading} onDelete={remove} emptyHint="No activity logged yet. Use the composer above to log a call, message, note, or meeting." />
    </div>
  );
}
