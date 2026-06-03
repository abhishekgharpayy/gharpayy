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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { LeadJourneyStepper, type JourneyTab } from "./crm10x/LeadJourneyStepper";
import { SmartDossier } from "./crm10x/SmartDossier";
import { LeadDeepProfile } from "./crm10x/LeadDeepProfile";
import { ObjectionLogger } from "./crm10x/ObjectionLogger";
import { LeadPropertyDossier } from "./impact/LeadPropertyDossier";
import { useImpactStateForLead } from "./impact/ImpactQueue";
import { isTodayIST } from "@/lib/crm10x/dates";
import { useCRM10x } from "@/lib/crm10x/store";
import { computeBookingProbability, inferBestCallTime } from "@/lib/crm10x/intelligence";
import type { CallOutcome, LangPref } from "@/lib/crm10x/types";
import {
  Phone,
  MessageSquare,
  Calendar as CalendarIcon,
  Tag,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Circle,
  X,
  Activity as ActivityIcon,
  MapPin,
  Wallet,
  Send,
  Zap,
  IndianRupee,
  BellRing,
  ExternalLink,
  Building2,
  Video,
  Briefcase,
  UserCheck,
  Trophy,
  Search,
  Star,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { formatTime12h } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  formatBudget,
  formatAssignee,
  normalizeLeadName,
  pickRelevantActiveTour,
  resolveBestLeadName,
  resolveLeadLocation,
} from "@/lib/lead-helpers";
import type { Lead, LeadStage, FollowUpPriority, SequenceKind } from "@/lib/types";
import { toast } from "sonner";
import { useMountedNow } from "@/hooks/use-now";
import { sendTourMessage as sendOwnerTourMessage } from "@/owner/messaging";
import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { ActivityComposer } from "@/components/activities/ActivityComposer";
import { TodoPanel } from "@/components/todos/TodoPanel";
import { useActivities } from "@/hooks/useActivities";
import { allCatalogProperties, searchPropertyCatalog } from "@/lib/crm10x/property-catalog";
import { pressureColor } from "@/lib/crm10x/impact-scoring";
import type { LeadFocusAction } from "@/lib/crm10x/impact-hard-actions";
import { CheckInPanel } from "@/components/checkins/CheckInPanel";
import { useLeadInterests, useToggleInterest } from "@/lib/crm10x/lead-interests";

const TAG_OPTIONS = [
  "price-issue",
  "location-mismatch",
  "parents-involved",
  "urgent",
  "budget-low",
];
const OBJECTIONS = [
  "Budget",
  "Location",
  "Amenities",
  "Timing",
  "Parents",
  "Comparing options",
  "Other",
];
const ROOM_TYPES = ["Single", "Double Sharing", "Triple Sharing", "Studio"];
const BOOKING_SOURCES = ["ad", "referral", "organic", "whatsapp", "call", "walk-in"];
const DECISION_MAKERS = ["self", "parent", "group"];
const OTHER_PROPERTY_VALUE = "__others__";
const TOUR_TYPES = [
  { value: "physical", label: "Physical", icon: Building2 },
  { value: "virtual", label: "Virtual", icon: Video },
  { value: "pre-book-pitch", label: "Pre-book", icon: Briefcase },
];
const WORKFLOW_TAB_LABELS: Record<JourneyTab, string> = {
  impact: "Impact",
  tour: "Tour",
  post: "Post-tour",
  quote: "Quote",
  checkin: "Check-in",
};
const TEMPLATES = [
  {
    id: "tour-confirm",
    label: "Tour confirmation",
    body: "Hi! Confirming your tour today. Looking forward to meeting you.",
  },
  {
    id: "post-tour",
    label: "Post-tour check-in",
    body: "Hi! How did you find the property? Happy to answer any questions.",
  },
  {
    id: "scarcity",
    label: "Scarcity",
    body: "Just a heads-up - only a couple of beds left at this price.",
  },
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
    selectedLeadId,
    selectedLeadTab,
    selectedLeadAction,
    selectLead,
    consumeSelectedLeadAction,
    leads,
    properties,
    tours,
    activities,
    tcms,
    setLeadStage,
    setLeadIntent,
    setLeadFollowUp,
    addLeadTag,
    removeLeadTag,
    scheduleTour,
    cancelTour,
    rescheduleTour,
    completeTour,
    setDecision,
    updatePostTour,
    addNote,
    logCall,
    sendMessage,
    autoAssignLead,
    startSequence,
    closeDeal,
    markHandoffsRead,
  } = useApp();
  const { currentMemberId, setTours } = useAppState();
  const { members: orgMembers } = useOrgMembers();
  const authUser = useAuthUser((s) => s.user);

  const lead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );
  const tourPropertyOptions = useMemo(() => allCatalogProperties(properties), [properties]);

  // Mark handoffs read when this lead opens
  useEffect(() => {
    if (selectedLeadId) markHandoffsRead(selectedLeadId);
  }, [selectedLeadId, markHandoffsRead]);

  const leadTours = useMemo(
    () =>
      lead
        ? tours
            .filter((tour) => {
              // Match by leadId (primary), then fallback to phone/name for legacy tours
              if (tour.leadId === lead.id) return true;
              return tour.phone === lead.phone || tour.leadName === lead.name;
            })
            .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
        : [],
    [tours, lead],
  );
  const leadActivities = useMemo(
    () => (lead ? activities.filter((a) => a.leadId === lead.id).slice(0, 30) : []),
    [activities, lead],
  );

  const { tcms: activeTcms } = useActiveTcMs();
  const tcmUsers = useMemo(() => {
    if (activeTcms && activeTcms.length > 0) {
      return activeTcms
        .map((a: any) => ({
          id: a.id,
          name: a.fullName ?? a.name,
          role: a.role ?? "tcm",
          zones: a.zones ?? [],
        }))
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
  const [tab, setTab] = useState("impact");
  const [, mounted] = useMountedNow();

  // Note state
  const [note, setNote] = useState("");
  const [customMsg, setCustomMsg] = useState("");

  const pendingPostTour = leadTours.find((t) => t.status === "completed" && !t.postTour.filledAt);
  const completedPostTour = leadTours.find((t) => t.status === "completed" && t.postTour.filledAt);
  const upcomingTour = pickRelevantActiveTour(leadTours);
  const hasScheduledTour = Boolean(upcomingTour) || lead?.stage === "tour-scheduled";
  const scheduledTourActivity =
    leadActivities.find(
      (a) => (a.kind === "tour_scheduled" || a.kind === "site_visit") && a.tourId,
    ) ?? null;
  const scheduledTourFromActivity = scheduledTourActivity?.tourId
    ? tours.find((candidate) => candidate.id === scheduledTourActivity.tourId)
    : null;
  const tourToShow =
    upcomingTour ?? scheduledTourFromActivity ?? (hasScheduledTour ? (leadTours[0] ?? null) : null);
  const preVisitReady = lead?.tags?.includes("impact:visit-ready") ?? false;
  const currentWorkTab: JourneyTab = (() => {
    if (!lead) return "impact";
    if (lead.stage === "booked") return "checkin";
    if (lead.stage === "quote-sent" || lead.stage === "negotiation") return "quote";
    if (completedPostTour) return "quote";
    if (pendingPostTour || lead.stage === "tour-done") return "post";
    if (hasScheduledTour || lead.stage === "tour-scheduled" || lead.stage === "on-tour") return "tour";
    if (preVisitReady) return "tour";
    return "impact";
  })();

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
    const requestedTab =
      selectedLeadTab === "dossier" ? "impact" : selectedLeadTab;
    setTab(
      requestedTab === currentWorkTab || (requestedTab === "impact" && currentWorkTab === "impact")
        ? requestedTab
        : currentWorkTab,
    );
  }, [
    authUser?.role,
    currentWorkTab,
    currentMemberId,
    defaultSelfAssigneeId,
    hasScheduledTour,
    lead,
    preVisitReady,
    scheduleAssignees,
    selectedLeadTab,
    tourToShow,
  ]);

  useEffect(() => {
    if (!lead || !hasScheduledTour || leadTours.length > 0 || scheduledTourFromActivity) return;
    let cancelled = false;

    void (async () => {
      try {
        const { items } = await api.tours.list();
        if (cancelled) return;

        const wireTour = items.find(
          (tour) =>
            tour.leadId === lead.id && (tour.status === "scheduled" || tour.status === "confirmed"),
        );
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
        const hydratedLocation = resolveLeadLocation(lead, tours, properties);
        const property = wireTour.propertyId
          ? tourPropertyOptions.find((p) => p.id === wireTour.propertyId)
          : undefined;
        const assignedTo = orgMembers.find((member) => member.id === wireTour.assignedTo);
        const scheduledBy = orgMembers.find((member) => member.id === wireTour.scheduledBy);
        const hydratedTour: Tour = {
          id: wireTour._id,
          leadId: wireTour.leadId,
          leadName: resolveBestLeadName(lead),
          phone: lead.phone || "",
          assignedTo: wireTour.assignedTo,
          assignedToName: assignedTo?.name ?? wireTour.assignedTo,
          propertyName: property?.name ?? hydratedLocation.propertyName ?? "Property Hub option",
          propertyId: wireTour.propertyId ?? undefined,
          area: hydratedLocation.area,
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

        setTours((prev) =>
          prev.some((tour) => tour.id === hydratedTour.id)
            ? prev.map((tour) =>
                tour.id === hydratedTour.id ? { ...tour, ...hydratedTour } : tour,
              )
            : [hydratedTour, ...prev],
        );
      } catch (err) {
        console.warn(
          "[LeadControlPanel] failed to hydrate scheduled tour:",
          (err as Error).message,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasScheduledTour,
    lead,
    leadTours.length,
    orgMembers,
    properties,
    scheduledTourFromActivity,
    setTours,
    tourPropertyOptions,
    tours,
  ]);

  const leadLocation = useMemo(
    () =>
      lead
        ? resolveLeadLocation(lead, tours, properties)
        : { area: "", propertyName: null, source: "fallback" as const },
    [lead, tours, properties],
  );
  const drawerImpactState = useImpactStateForLead(lead);

  if (!lead) return null;

  const displayLeadName = resolveBestLeadName(lead);
  const assignedMemberId = lead.assignedTcmId || lead.assigneeId || "";
  const tcm = getTcm(assignedMemberId);
  const selectedMember = orgMembers.find((m) => m.id === assignedMemberId) ?? null;
  const actualPropertyName =
    tourToShow?.propertyId
      ? tourPropertyOptions.find((property) => property.id === tourToShow.propertyId)?.name ??
        getProperty(tourToShow.propertyId)?.name ??
        null
      : null;
  const assignmentLabel = formatAssignee(assignedMemberId, selectedMember?.name ?? tcm?.name);

  const handleSchedule = async () => {
    if (!tcmId || !scheduledAt) {
      toast.error("Member and time are required");
      return;
    }
    const assignee = scheduleAssignees.find((m) => m.id === tcmId) ?? null;
    const scheduler = currentMemberId
      ? (orgMembers.find((m) => m.id === currentMemberId) ?? null)
      : null;

    try {
      const selectedPropertyId =
        propertyId === OTHER_PROPERTY_VALUE ? undefined : propertyId || undefined;
      const tour = await scheduleTour({
        leadId: lead.id,
        propertyId: selectedPropertyId,
        tcmId,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });

      // MYT tour is created by LiveToursBridge from the server event.
      // Only create a local MYT entry as a fast optimistic update so /myt/schedule
      // shows the tour immediately. LiveToursBridge will reconcile later.
      const scheduledDateTime = new Date(scheduledAt);
      const mytTour = {
        id: tour.id,
        leadId: lead.id,
        leadName: displayLeadName,
        phone: lead.phone || "",
        assignedTo: tcmId,
        assignedToName: assignee?.name ?? "Member",
        propertyName: selectedPropertyId
          ? (tourPropertyOptions.find((p) => p.id === selectedPropertyId)?.name ??
            leadLocation.propertyName ??
            "Property Hub option")
          : (leadLocation.propertyName ?? "Property Hub option"),
        propertyId: selectedPropertyId,
        area: leadLocation.area,
        zoneId: "",
        tourDate: scheduledDateTime.toISOString().split("T")[0],
        tourTime: scheduledDateTime.toTimeString().split(" ")[0].substring(0, 5),
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
          workLocation: leadLocation.area,
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
      setTours((prev) => {
        // Avoid duplicates if LiveToursBridge already added it
        if (prev.some((t) => t.id === mytTour.id)) return prev;
        return [mytTour, ...prev];
      });

      notifyTourScheduled({
        tourId: tour.id,
        leadId: lead.id,
        leadName: displayLeadName,
        senderId: scheduler?.id ?? currentMemberId ?? tcmId,
        senderName: scheduler?.name ?? "You",
        assigneeName: assignee?.name ?? "Member",
        recipientIds: [
          { id: tcmId, name: assignee?.name ?? "Member" },
          ...(scheduler?.id && scheduler.id !== tcmId
            ? [{ id: scheduler.id, name: scheduler.name }]
            : []),
        ],
      });
      setTcmId(defaultSelfAssigneeId);
      setPropertyId("");
      setScheduledAt("");
      setTab("tour");
      toast.success("Tour scheduled");
    } catch (err) {
      console.error("[LeadControlPanel] Failed to schedule tour:", err);
      toast.error("Failed to schedule tour. Please try again.");
    }
  };

  const tabTriggerClass =
    "relative h-auto rounded-none border-0 bg-transparent px-0 pb-3 pt-0 text-[11px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-foreground transition-colors";

  return (
    <Sheet open={!!selectedLeadId} onOpenChange={(o) => !o && selectLead(null)}>
      <SheetContent side="right" className="w-full p-0 flex flex-col overflow-y-auto" style={{ maxWidth: 560 }}>
        {/* Header block */}
        <SheetHeader className="px-4 py-3 border-b border-border space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="font-display text-base leading-tight">
                {displayLeadName}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {lead.phone} · via {lead.source}
              </SheetDescription>
            </div>
            {drawerImpactState && (
              <div className={`min-w-[118px] rounded-md border px-2 py-1.5 text-right ${pressureColor(drawerImpactState.nba.pressure)}`}>
                <div className="text-[9px] uppercase tracking-wider opacity-70">Next action</div>
                <div className="text-xs font-semibold truncate">{drawerImpactState.nba.label}</div>
                <div className="flex items-center justify-end gap-1 text-[11px] font-semibold">
                  <Trophy className="h-3 w-3" />
                  {drawerImpactState.score}%
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <StageBadge stage={lead.stage} />
            <IntentChip intent={lead.intent} />
            <ConfidenceBar value={lead.confidence} />
            <ObjectionTag leadId={lead.id} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span><CalendarIcon className="mr-1 inline h-3 w-3" />Move-in: <b className="font-medium text-foreground">{formatSafeDate(lead.moveInDate, "MMM d", "TBD")}</b></span>
            <span><Wallet className="mr-1 inline h-3 w-3" />Budget: <b className="font-medium text-foreground">{formatBudget(lead.budget)}</b></span>
            <span><MapPin className="mr-1 inline h-3 w-3" />Area: <b className="font-medium text-foreground">{leadLocation.area}</b></span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {actualPropertyName ? <>{actualPropertyName} · </> : null}
            {assignmentLabel === "Unassigned" ? "Not assigned yet" : `Assigned · ${assignmentLabel}`}
          </div>
        </SheetHeader>

        <LeadJourneyStepper lead={lead} currentTab={tab} onJump={(t: JourneyTab) => setTab(t)} />

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
                Tour completed{" "}
                {mounted ? formatSafeDistance(pendingPostTour.scheduledAt, "recently") : "recently"}
                . TCM must fill the form below.
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-none">
          <Tabs value={tab} onValueChange={setTab} className="px-6 pt-5 pb-6">
            {/* Quiet underline tab bar — single horizontal scroll, no chrome */}
            <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border/60 bg-transparent p-0 overflow-x-auto scrollbar-thin">
              {Array.from(new Set<JourneyTab>(["impact", currentWorkTab])).map((workflowTab) => (
                <TabsTrigger key={workflowTab} value={workflowTab} className={tabTriggerClass}>
                  {WORKFLOW_TAB_LABELS[workflowTab]}
                  {workflowTab === "post" && pendingPostTour && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive align-middle" />
                  )}
                </TabsTrigger>
              ))}
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
                  {lead.email && (
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Email</Label>
                      <div>{lead.email}</div>
                    </div>
                  )}
                  {lead.type && (
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Type</Label>
                      <div className="capitalize">{lead.type}</div>
                    </div>
                  )}
                  {lead.room && (
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Room preference
                      </Label>
                      <div className="capitalize">{lead.room}</div>
                    </div>
                  )}
                  {lead.need && (
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Gender need
                      </Label>
                      <div className="capitalize">{lead.need}</div>
                    </div>
                  )}
                  {lead.quality && (
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Quality</Label>
                      <div className="capitalize">{lead.quality}</div>
                    </div>
                  )}
                  {lead.inBLR !== null && lead.inBLR !== undefined && (
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">In BLR</Label>
                      <div>{lead.inBLR ? "Yes" : "No"}</div>
                    </div>
                  )}
                  {lead.zoneCategory && (
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Zone Category
                      </Label>
                      <div>{lead.zoneCategory}</div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      Current Stage
                    </Label>
                    <div className="capitalize">{lead.stage.replace("-", " ")}</div>
                  </div>
                </div>
                {lead.areas && lead.areas.length > 0 && (
                  <div className="space-y-1 mt-3">
                    <Label className="text-[10px] uppercase text-muted-foreground">Areas</Label>
                    <div className="text-sm">{lead.areas.join(", ")}</div>
                  </div>
                )}
                {lead.fullAddress && (
                  <div className="space-y-1 mt-3">
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      Full Address
                    </Label>
                    <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded-md">
                      {lead.fullAddress}
                    </div>
                  </div>
                )}
                {lead.specialReqs && (
                  <div className="space-y-1 mt-3">
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      Special Requirements
                    </Label>
                    <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded-md whitespace-pre-wrap">
                      {lead.specialReqs}
                    </div>
                  </div>
                )}
                {lead.notes && (
                  <div className="space-y-1 mt-3">
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      Original Notes
                    </Label>
                    <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded-md whitespace-pre-wrap">
                      {lead.notes}
                    </div>
                  </div>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="quote" className="space-y-4 pt-4">
              <QuotationBuilder lead={lead} />
            </TabsContent>

            <TabsContent value="checkin" className="space-y-4 pt-4">
              <CheckInPanel lead={lead} />
            </TabsContent>

            <TabsContent value="impact" className="space-y-4 pt-4">
              <ImpactTabContent
                lead={lead}
                pendingAction={selectedLeadAction}
                onPendingActionConsumed={consumeSelectedLeadAction}
                onGoTour={() => setTab("tour")}
              />
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
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const r = autoAssignLead(lead.id);
                      const tcm = tcms.find((t) => t.id === r.tcmId);
                      toast.success(`Auto-routed to ${tcm?.name ?? "TCM"}`, {
                        description: r.reasons.join(" · "),
                      });
                    }}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1.5" /> Auto-route to best TCM
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Currently with{" "}
                  <span className="text-foreground font-medium">{selectedMember?.name ?? "-"}</span>
                </div>
              </Section>

              <Section title="Status engine">
                <Select
                  value={lead.stage}
                  onValueChange={(v) => {
                    const prev = lead.stage;
                    const next = v as LeadStage;
                    void (async () => {
                      try {
                        await setLeadStage(lead.id, next);
                        if (v === "dropped") {
                          toast("Marked dropped", {
                            description: `${displayLeadName} → dropped`,
                            action: {
                              label: "Undo",
                              onClick: () => {
                                void setLeadStage(lead.id, prev)
                                  .then(() => toast.success("Restored"))
                                  .catch((err) =>
                                    toast.error(
                                      (err as Error).message || "Failed to restore stage",
                                    ),
                                  );
                              },
                            },
                            duration: 5000,
                          });
                        }
                      } catch (err) {
                        toast.error((err as Error).message || "Failed to update status");
                      }
                    })();
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "new",
                        "contacted",
                        "tour-scheduled",
                        "tour-done",
                        "negotiation",
                        "not-responding-3d",
                        "not-responding-7d",
                        "booked",
                        "dropped",
                      ] as LeadStage[]
                    ).map((s) => (
                      <SelectItem key={s} value={s} className="text-sm capitalize">
                        {s.replace("-", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(
                    ["first-contact", "post-tour", "pre-decision", "cold-revival"] as SequenceKind[]
                  ).map((k) => (
                    <Button
                      key={k}
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        startSequence(lead.id, k);
                        toast.success(`Started ${k} sequence`);
                      }}
                    >
                      Start {k}
                    </Button>
                  ))}
                </div>
              </Section>

              <Section title="Action engine">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      logCall(lead.id);
                      toast.success("Call logged");
                    }}
                  >
                    <Phone className="h-3.5 w-3.5 mr-1.5" /> Call
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      sendMessage(lead.id, "WhatsApp template sent");
                      toast.success("Message sent");
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Templates
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATES.map((t) => (
                      <Button
                        key={t.id}
                        variant="secondary"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          sendMessage(lead.id, t.body);
                          toast.success(`Sent: ${t.label}`);
                        }}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={customMsg}
                    onChange={(e) => setCustomMsg(e.target.value)}
                    placeholder="Custom message…"
                    className="h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={!customMsg.trim()}
                    onClick={() => {
                      sendMessage(lead.id, customMsg);
                      setCustomMsg("");
                      toast.success("Sent");
                    }}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Section>

              <Section title="Follow-up engine">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Next follow-up
                    </Label>
                    <Input
                      type="datetime-local"
                      defaultValue={lead.nextFollowUpAt ? toLocal(lead.nextFollowUpAt) : ""}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setLeadFollowUp(
                          lead.id,
                          new Date(e.target.value).toISOString(),
                          priorityFor(lead.confidence),
                        );
                      }}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Priority
                    </Label>
                    <Select
                      value={
                        lead.intent === "hot" ? "high" : lead.intent === "warm" ? "medium" : "low"
                      }
                      onValueChange={(v) =>
                        setLeadIntent(
                          lead.id,
                          v === "high" ? "hot" : v === "medium" ? "warm" : "cold",
                        )
                      }
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
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
                      <button
                        onClick={() => removeLeadTag(lead.id, t)}
                        className="hover:text-destructive"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_OPTIONS.filter((t) => !lead.tags.includes(t)).map((t) => (
                    <button
                      key={t}
                      onClick={() => addLeadTag(lead.id, t)}
                      className="text-[10px] px-2 py-0.5 rounded-md border border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note…"
                    rows={2}
                    className="text-sm resize-none"
                  />
                  <Button
                    size="sm"
                    disabled={!note.trim()}
                    onClick={() => {
                      addNote(lead.id, note);
                      setNote("");
                      toast.success("Note added");
                    }}
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
                    leadName={displayLeadName}
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
                  onAnswersChange={(patch: Partial<DrawerScheduleAnswers>) =>
                    setScheduleAnswers((answers) => ({ ...answers, ...patch }))
                  }
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
                        <div
                          key={t.id}
                          className="rounded-lg border border-border bg-card p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{prop?.name}</span>
                            <span className="text-muted-foreground">
                              {formatSafeDate(t.scheduledAt, "MMM d, p", "time unknown")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <Badge variant="outline" className="capitalize">
                              {t.status}
                            </Badge>
                            {t.decision && (
                              <Badge variant="outline" className="capitalize">
                                {t.decision}
                              </Badge>
                            )}
                            {t.postTour.filledAt ? (
                              <span className="text-success inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Form complete
                              </span>
                            ) : t.status === "completed" ? (
                              <span className="text-destructive inline-flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Form pending
                              </span>
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
                      No completed tours yet. The post-tour form appears here once a tour is marked
                      complete.
                    </div>
                  );
                }
                const prop = getProperty(target.propertyId, properties);
                const pt = target.postTour;
                return (
                  <div className="space-y-4">
                    <div className="text-xs text-muted-foreground">
                      Tour at <span className="text-foreground font-medium">{prop?.name}</span> ·{" "}
                      {formatSafeDate(target.scheduledAt, "MMM d, p", "time unknown")}
                    </div>

                    {/* Send updates / reminders - one row, always visible post-tour */}
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        disabled={!prop}
                        onClick={() => {
                          if (!prop) return;
                          sendOwnerTourMessage("post_visit_thanks", {
                            tourId: target.id,
                            leadName: displayLeadName,
                            phone: lead.phone,
                            propertyName: prop.name,
                            area: prop.area,
                            tourDate: target.scheduledAt.slice(0, 10),
                            tourTime: target.scheduledAt.slice(11, 16),
                            tcmName: tcms.find((t) => t.id === target.tcmId)?.name,
                          });
                          toast.success("Thank-you message opened");
                        }}
                      >
                        <ExternalLink className="h-3 w-3" /> Thank-you msg
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => {
                          sendMessage(lead.id, "Quick update - any thoughts on the property?");
                          toast.success("Update sent");
                        }}
                      >
                        <Send className="h-3 w-3" /> Send update
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => {
                          const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                          setLeadFollowUp(
                            lead.id,
                            dueAt,
                            priorityFor(pt.confidence),
                            "Post-tour reminder",
                          );
                          toast.success("Reminder set for tomorrow");
                        }}
                      >
                        <BellRing className="h-3 w-3" /> Set reminder
                      </Button>
                    </div>

                    <Section title="Outcome (mandatory · explicit)">
                      <div className="text-[11px] text-muted-foreground mb-1.5">
                        Choose carefully - the lead's stage <em>and</em> closure status update only
                        when you click here. Nothing is auto-assigned by the system.
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              o: "booked",
                              label: "Booked ✓",
                              tone: "default" as const,
                              decision: "booked" as const,
                            },
                            {
                              o: "thinking",
                              label: "Still deciding",
                              tone: "outline" as const,
                              decision: "thinking" as const,
                            },
                            {
                              o: "not-interested",
                              label: "Not interested",
                              tone: "outline" as const,
                              decision: "dropped" as const,
                            },
                            {
                              o: null,
                              label: "Awaiting outcome (no change)",
                              tone: "ghost" as const,
                              decision: null,
                            },
                          ] as const
                        ).map((opt) => (
                          <Button
                            key={opt.label}
                            variant={pt.outcome === opt.o ? "default" : opt.tone}
                            size="sm"
                            className="capitalize"
                            onClick={() => {
                              if (
                                !confirm(
                                  `Confirm outcome: ${opt.label}? This updates the lead stage.`,
                                )
                              )
                                return;
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
                        type="range"
                        min={0}
                        max={100}
                        value={pt.confidence}
                        onChange={(e) => updatePostTour(target.id, { confidence: +e.target.value })}
                        className="w-full accent-(--color-accent)"
                      />
                    </Section>

                    <Section title="Key objection">
                      <Select
                        value={pt.objection ?? ""}
                        onValueChange={(v) => updatePostTour(target.id, { objection: v })}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Select objection" />
                        </SelectTrigger>
                        <SelectContent>
                          {OBJECTIONS.map((o) => (
                            <SelectItem key={o} value={o} className="text-sm">
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        rows={2}
                        placeholder="Note…"
                        value={pt.objectionNote}
                        onChange={(e) =>
                          updatePostTour(target.id, { objectionNote: e.target.value })
                        }
                        className="text-sm resize-none mt-2"
                      />
                    </Section>

                    <div className="grid grid-cols-2 gap-3">
                      <Section title="Expected decision">
                        <Input
                          type="date"
                          value={pt.expectedDecisionAt ? pt.expectedDecisionAt.slice(0, 10) : ""}
                          onChange={(e) =>
                            updatePostTour(target.id, {
                              expectedDecisionAt: e.target.value
                                ? new Date(e.target.value).toISOString()
                                : null,
                            })
                          }
                          className="h-9 text-sm"
                        />
                      </Section>
                      <Section title="Next follow-up">
                        <Input
                          type="datetime-local"
                          value={pt.nextFollowUpAt ? toLocal(pt.nextFollowUpAt) : ""}
                          onChange={(e) =>
                            updatePostTour(target.id, {
                              nextFollowUpAt: e.target.value
                                ? new Date(e.target.value).toISOString()
                                : null,
                            })
                          }
                          className="h-9 text-sm"
                        />
                      </Section>
                    </div>

                    {pt.filledAt ? (
                      <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span>
                          Form complete · saved{" "}
                          {mounted ? formatSafeDistance(pt.filledAt, "recently") : "recently"}
                        </span>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex items-center gap-2 text-xs">
                        <ClipboardCheck className="h-4 w-4" />
                        <span>
                          Fill all four fields to mark this lead complete and silence the alert.
                        </span>
                      </div>
                    )}

                    {/* Close deal - one click, blocks the bed, fires the booking */}
                    {lead.stage !== "booked" && (
                      <Button
                        size="lg"
                        className="w-full bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => {
                          closeDeal({
                            leadId: lead.id,
                            tourId: target.id,
                            propertyId: target.propertyId ?? "",
                            tcmId: target.tcmId,
                            amount: prop?.pricePerBed ?? 12000,
                          });
                          toast.success(`Deal closed · ${displayLeadName} → ${prop?.name}`, {
                            description: `Bed blocked, MRR +₹${((prop?.pricePerBed ?? 12000) / 1000).toFixed(0)}k`,
                          });
                        }}
                      >
                        <IndianRupee className="h-4 w-4 mr-1.5" /> Close deal · ₹
                        {((prop?.pricePerBed ?? 12000) / 1000).toFixed(0)}k/mo
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
                    <div
                      key={a.id}
                      className="flex gap-2 text-xs border-l-2 border-border pl-3 py-1"
                    >
                      <ActivityIcon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <div className="text-foreground">{a.text}</div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">
                          {formatSafeDate(a.ts, "MMM d, p", "time unknown")} ·{" "}
                          {a.actor === "system"
                            ? "system"
                            : (tcms.find((t) => t.id === a.actor)?.name ?? a.actor)}
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

function ImpactTabContent({
  lead,
  pendingAction,
  onPendingActionConsumed,
  onGoTour,
}: {
  lead: Lead;
  pendingAction?: LeadFocusAction | null;
  onPendingActionConsumed?: () => void;
  onGoTour?: () => void;
}) {
  const state = useImpactStateForLead(lead);
  const profile = useCRM10x((s) => s.profiles[lead.id]);
  const allCalls = useCRM10x((s) => s.calls);
  const allObjections = useCRM10x((s) => s.objections);
  const calls = useMemo(
    () => allCalls.filter((call) => call.leadId === lead.id),
    [allCalls, lead.id],
  );
  const objections = useMemo(
    () => allObjections.filter((item) => item.leadId === lead.id),
    [allObjections, lead.id],
  );
  const tags = lead.tags ?? [];
  const markDone = useApp((s) => s.addLeadTag);
  const isDone = (key: PreVisitStepKey) => tags.includes(preVisitTag(key));
  const profileScore = profileCompletionScore(profile);
  const latestAnsweredCall = calls.find((call) => call.outcome === "answered") ?? null;
  const hasObjectionCapture = objections.length > 0;
  const activeStep = getPreVisitActiveStep({
    profileDone: isDone("qualification"),
    discoveryDone: isDone("discovery"),
    callConnected: Boolean(latestAnsweredCall),
    objectionDone: hasObjectionCapture,
    dossierDone: isDone("dossier"),
    visitReady: isDone("visit-ready"),
  });

  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction === "schedule" || pendingAction === "auto") {
      if (!isDone("visit-ready")) {
        toast.warning("Visit scheduling unlocks after the pre-visit workflow is complete.");
      }
    }
    onPendingActionConsumed?.();
  }, [pendingAction]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot drawer action

  if (!state) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
        Impact intelligence will appear when this lead is loaded.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PreVisitProgress activeStep={activeStep} done={{
        "new-lead": true,
        qualification: isDone("qualification"),
        discovery: isDone("discovery"),
        call: Boolean(latestAnsweredCall),
        objection: hasObjectionCapture,
        dossier: isDone("dossier"),
        shortlist: isDone("visit-ready"),
      }} />

      {activeStep === "qualification" && (
        <LifecycleCard
          eyebrow="Qualification"
          title="Complete deep profile"
          helper="Capture the essentials first. This is what stops premature scheduling."
        >
          <LeadDeepProfile lead={state.lead} defaultOpen />
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            Required profile strength: 80% · Current:{" "}
            <span className={profileScore >= 80 ? "font-semibold text-success" : "font-semibold text-warning"}>
              {profileScore}%
            </span>
          </div>
          <Button
            className="w-full h-9 text-xs"
            disabled={profileScore < 80}
            onClick={() => {
              markDone(lead.id, preVisitTag("qualification"));
              toast.success("Profile saved. Discovery unlocked.");
            }}
          >
            Save profile and continue
          </Button>
        </LifecycleCard>
      )}

      {activeStep === "discovery" && (
        <LifecycleCard
          eyebrow="Discovery"
          title="Confirm what the lead actually needs"
          helper="Read this once before calling. It gives the TCM the talk track."
        >
          <DiscoverySnapshot lead={state.lead} score={state.score} nbaReason={state.nba.reason} />
          <Button
            className="w-full h-9 text-xs"
            onClick={() => {
              markDone(lead.id, preVisitTag("discovery"));
              toast.success("Discovery checked. Call logging unlocked.");
            }}
          >
            Discovery checked · start call
          </Button>
        </LifecycleCard>
      )}

      {activeStep === "call" && (
        <LifecycleCard
          eyebrow="Call connected"
          title="Log the call outcome"
          helper="A visit cannot be prepared until the TCM has spoken to the lead."
        >
          <ProfileCallBrief lead={state.lead} />
          <PreVisitCallLogger lead={state.lead} calls={calls} />
        </LifecycleCard>
      )}

      {activeStep === "objection" && (
        <LifecycleCard
          eyebrow="Objection capture"
          title="Capture the blocker or mark none"
          helper="This is mandatory. Even a positive lead should be marked as 'None - interested'."
        >
          <ObjectionLogger lead={state.lead} context="call" />
        </LifecycleCard>
      )}

      {activeStep === "dossier" && (
        <LifecycleCard
          eyebrow="Property dossier"
          title="Match properties from preferred areas"
          helper="Suggestions prioritize the areas captured while adding the lead."
        >
          <PropertyMatchPreview lead={state.lead} />
          <LeadPropertyDossier lead={state.lead} />
          <Button
            className="w-full h-9 text-xs"
            onClick={() => {
              markDone(lead.id, preVisitTag("dossier"));
              toast.success("Dossier reviewed. Shortlist unlocked.");
            }}
          >
            Property dossier reviewed
          </Button>
        </LifecycleCard>
      )}

      {activeStep === "shortlist" && (
        <LifecycleCard
          eyebrow="Shortlist created"
          title="Pin visit-ready properties"
          helper="Pick at least one property the TCM can confidently pitch before scheduling."
        >
          <PropertyShortlistStep lead={state.lead} />
        </LifecycleCard>
      )}

      {activeStep === "visit-ready" && (
        <LifecycleCard
          eyebrow="Visit ready"
          title="Pre-visit workflow complete"
          helper="Tour scheduling is now unlocked."
        >
          <div className="rounded-md border border-success/40 bg-success/10 p-3 text-xs text-success">
            Qualification, discovery, call, objection, dossier, and shortlist are complete.
          </div>
          <Button className="w-full h-9 text-xs" onClick={onGoTour}>
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
            Continue to Tour scheduling
          </Button>
        </LifecycleCard>
      )}
    </div>
  );
}

type PreVisitStepKey = "qualification" | "discovery" | "call" | "objection" | "dossier" | "shortlist" | "visit-ready";
type PreVisitProgressKey = "new-lead" | "qualification" | "discovery" | "call" | "objection" | "dossier" | "shortlist";

const PRE_VISIT_STEPS: Array<{ key: PreVisitProgressKey; label: string }> = [
  { key: "new-lead", label: "New lead" },
  { key: "qualification", label: "Qualification" },
  { key: "discovery", label: "Discovery" },
  { key: "call", label: "Call connected" },
  { key: "objection", label: "Objection" },
  { key: "dossier", label: "Dossier" },
  { key: "shortlist", label: "Visit ready" },
];

function preVisitTag(key: Exclude<PreVisitStepKey, "call" | "objection">) {
  return `impact:${key}`;
}

function getPreVisitActiveStep(state: {
  profileDone: boolean;
  discoveryDone: boolean;
  callConnected: boolean;
  objectionDone: boolean;
  dossierDone: boolean;
  visitReady: boolean;
}): PreVisitStepKey {
  if (!state.profileDone) return "qualification";
  if (!state.discoveryDone) return "discovery";
  if (!state.callConnected) return "call";
  if (!state.objectionDone) return "objection";
  if (!state.dossierDone) return "dossier";
  if (!state.visitReady) return "shortlist";
  return "visit-ready";
}

function profileCompletionScore(profile: Record<string, unknown> | undefined): number {
  if (!profile) return 0;
  const required = [
    "gender",
    "roomType",
    "source",
    "decisionMaker",
    "locationFeasible",
    "companyOrCollege",
    "budgetStated",
    "verifiedBudget",
    "verifiedMoveIn",
    "flexibility",
  ];
  const filled = required.filter((key) => {
    const value = profile[key];
    return value !== undefined && value !== null && value !== "";
  }).length;
  return Math.min(100, Math.round((filled / required.length) * 100));
}

function PreVisitProgress({
  activeStep,
  done,
}: {
  activeStep: PreVisitStepKey;
  done: Record<PreVisitProgressKey, boolean>;
}) {
  const activeProgressKey: PreVisitProgressKey =
    activeStep === "visit-ready" ? "shortlist" : activeStep === "call" ? "call" : activeStep;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Pre-visit lifecycle
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {PRE_VISIT_STEPS.map((step) => {
          const complete = done[step.key];
          const active = step.key === activeProgressKey;
          return (
            <div key={step.key} className="min-w-0">
              <div
                className={cn(
                  "h-1.5 rounded-full",
                  complete ? "bg-success" : active ? "bg-accent" : "bg-muted",
                )}
              />
              <div
                className={cn(
                  "mt-1 truncate text-[9px]",
                  complete || active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LifecycleCard({
  eyebrow,
  title,
  helper,
  children,
}: {
  eyebrow: string;
  title: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">{eyebrow}</div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-[11px] text-muted-foreground">{helper}</p>
      </div>
      {children}
    </section>
  );
}

function DiscoverySnapshot({ lead, score, nbaReason }: { lead: Lead; score: number; nbaReason: string }) {
  const profile = useCRM10x((s) => s.profiles[lead.id]);
  const allCalls = useCRM10x((s) => s.calls);
  const calls = useMemo(
    () => allCalls.filter((call) => call.leadId === lead.id),
    [allCalls, lead.id],
  );
  const probability = computeBookingProbability({ lead, profile, tours: [], visits: [], objections: [], calls });
  const items = [
    ["Need", [lead.type, lead.room, lead.need].filter(Boolean).join(" · ") || "Not captured"],
    ["Areas", lead.areas?.length ? lead.areas.join(", ") : lead.preferredArea || "Not captured"],
    ["Budget", lead.budget ? formatBudget(lead.budget) : "Not captured"],
    ["Move-in", formatSafeDate(lead.moveInDate, "MMM d", "TBD")],
    ["PG type", profileLabel(profile?.gender) || "Not captured"],
    ["Room fit", profileLabel(profile?.roomType) || "Not captured"],
    ["Decision-maker", profileLabel(profile?.decisionMaker) || "Not captured"],
    ["Location feasibility", locationFeasibilityLabel(profile?.locationFeasible) || "Ask on call"],
    ["Best call time", inferBestCallTime(calls) ?? profile?.bestCallTime ?? "Ask on call"],
    ["Special request", lead.specialReqs || lead.notes || "None captured"],
  ];
  const scoreTone = score >= 70
    ? "border-success/40 bg-success/10 text-success"
    : score >= 40
      ? "border-warning/40 bg-warning/10 text-warning"
      : "border-danger/40 bg-danger/10 text-danger";
  return (
    <div className="space-y-2">
      <div className={`rounded-md border px-3 py-2 ${scoreTone}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Booking probability</div>
            <div className="text-xs font-medium">{probability.recommendation || nbaReason}</div>
          </div>
          <div className="text-2xl font-display font-bold">{probability.score}%</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-muted/30 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-xs font-medium text-foreground">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileCallBrief({ lead }: { lead: Lead }) {
  const profile = useCRM10x((s) => s.profiles[lead.id]);
  const items = [
    ["Need", [lead.type, lead.room, lead.need].filter(Boolean).join(" · ") || "Not captured"],
    ["Areas", lead.areas?.length ? lead.areas.join(", ") : lead.preferredArea || "Not captured"],
    ["Budget", lead.budget ? formatBudget(lead.budget) : "Not captured"],
    ["Decision-maker", profileLabel(profile?.decisionMaker) || "Ask who decides"],
    ["Location feasibility", locationFeasibilityLabel(profile?.locationFeasible) || "Ask area inventory fit"],
    ["Best time", profile?.bestCallTime || "Ask on call"],
  ];
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Call brief from profile
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {items.map(([label, value]) => (
          <div key={label} className="text-[11px]">
            <span className="text-muted-foreground">{label}: </span>
            <span className="font-medium text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function profileLabel(value?: string | number | null) {
  if (value === undefined || value === null || value === "") return "";
  const labels: Record<string, string> = {
    "boys-pg": "Boys PG",
    "girls-pg": "Girls PG",
    "co-live": "Co-live",
    single: "Single",
    double: "Double",
    triple: "Triple",
    any: "Any",
    whatsapp: "WhatsApp",
    website: "Website",
    referral: "Referral",
    indiamart: "IndiaMart",
    google: "Google",
    "walk-in": "Walk-in",
    self: "Self",
    parents: "Parents",
    "company-hr": "Company / HR",
  };
  return labels[String(value)] ?? String(value);
}

function locationFeasibilityLabel(value?: boolean | null) {
  if (value === undefined || value === null) return "";
  return value ? "Yes" : "No";
}

function PreVisitCallLogger({ lead, calls }: { lead: Lead; calls: ReturnType<typeof useCRM10x.getState>["calls"] }) {
  const log = useCRM10x((s) => s.logCall);
  const [duration, setDuration] = useState(60);
  const [outcome, setOutcome] = useState<CallOutcome>("answered");
  const [language, setLanguage] = useState<LangPref | "">("");
  const [bestCallTime, setBestCallTime] = useState("");
  const [notes, setNotes] = useState("");
  const attempt = calls.length + 1;

  const submit = () => {
    log({
      leadId: lead.id,
      attemptNumber: attempt,
      durationSec: duration,
      outcome,
      language: language || undefined,
      bestCallTime: bestCallTime || undefined,
      notes,
      loggedBy: lead.assignedTcmId || lead.assigneeId || "unassigned",
    });
    toast.success(outcome === "answered" ? "Call connected. Objection capture unlocked." : "Call attempt logged.");
    setNotes("");
    setBestCallTime("");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Duration (sec)">
          <Input type="number" className="h-8 text-xs" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </Field>
        <Field label="Outcome">
          <Select value={outcome} onValueChange={(v) => setOutcome(v as CallOutcome)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="answered">Answered</SelectItem>
              <SelectItem value="not-answered">Not answered</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
              <SelectItem value="switched-off">Switched off</SelectItem>
              <SelectItem value="wrong-number">Wrong number</SelectItem>
              <SelectItem value="callback-requested">Callback requested</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Language">
          <Select value={language} onValueChange={(v) => setLanguage(v as LangPref)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="english">English</SelectItem>
              <SelectItem value="hindi">Hindi</SelectItem>
              <SelectItem value="kannada">Kannada</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Best call time">
          <Input className="h-8 text-xs" placeholder="after 6 PM" value={bestCallTime} onChange={(e) => setBestCallTime(e.target.value)} />
        </Field>
      </div>
      <Textarea rows={3} className="text-xs resize-none" placeholder="What did the lead say?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button className="w-full h-9 text-xs" onClick={submit}>
        Log call attempt #{attempt}
      </Button>
    </div>
  );
}

function preferenceAreasForLead(lead: Lead): string[] {
  return Array.from(new Set([...(lead.areas ?? []), lead.preferredArea].map((area) => area?.trim()).filter(Boolean) as string[]));
}

function PropertyMatchPreview({ lead }: { lead: Lead }) {
  const properties = useApp((s) => s.properties);
  const areas = preferenceAreasForLead(lead);
  const matches = useMemo(() => {
    const seen = new Set<string>();
    const rows = areas.flatMap((area) =>
      searchPropertyCatalog(area, properties, { preferredArea: area, limit: 4 }),
    );
    return rows.filter((property) => {
      if (seen.has(property.id)) return false;
      seen.add(property.id);
      return true;
    }).slice(0, 6);
  }, [areas, properties]);

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold">Suggested from preferred area</div>
        <div className="text-[10px] text-muted-foreground truncate">{areas.join(", ") || "No area captured"}</div>
      </div>
      <div className="grid gap-1.5">
        {matches.length > 0 ? matches.map((property) => (
          <div key={property.id} className="rounded-md border border-border bg-card px-2.5 py-2 text-xs">
            <div className="font-semibold">{property.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {property.area} · {formatBudget(property.pricePerBed)}
              {property.vacantBeds !== undefined ? ` · ${property.vacantBeds} vacant` : ""}
            </div>
          </div>
        )) : (
          <div className="text-xs text-muted-foreground">No property hub matches found for these areas yet.</div>
        )}
      </div>
    </div>
  );
}

function PropertyShortlistStep({ lead }: { lead: Lead }) {
  const properties = useApp((s) => s.properties);
  const { data: interests = [] } = useLeadInterests(lead.id);
  const { mutate: toggleInterest } = useToggleInterest();
  const markDone = useApp((s) => s.addLeadTag);
  const areas = preferenceAreasForLead(lead);
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const base = query.trim()
      ? searchPropertyCatalog(query, properties, { preferredArea: lead.preferredArea, limit: 12 })
      : areas.flatMap((area) => searchPropertyCatalog(area, properties, { preferredArea: area, limit: 5 }));
    const seen = new Set<string>();
    return base.filter((property) => {
      if (seen.has(property.id)) return false;
      seen.add(property.id);
      return true;
    }).slice(0, 12);
  }, [areas, lead.preferredArea, properties, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-8 text-xs"
          placeholder="Search property or area"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-border p-1.5 space-y-1.5">
        {list.map((property) => {
          const selected = interests.includes(property.id);
          return (
            <button
              key={property.id}
              type="button"
              onClick={() => toggleInterest({ leadId: lead.id, propertyId: property.id })}
              className={cn(
                "w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                selected ? "border-accent bg-accent/10" : "border-border bg-card hover:bg-muted/40",
              )}
            >
              <div className="flex items-center gap-2">
                {selected ? <Star className="h-3.5 w-3.5 text-accent" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{property.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {property.area} · {formatBudget(property.pricePerBed)}
                    {property.vacantBeds !== undefined ? ` · ${property.vacantBeds} vacant` : ""}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {list.length === 0 && (
          <div className="py-5 text-center text-xs text-muted-foreground">No matching properties.</div>
        )}
      </div>
      <div className="rounded-md bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Selected: <span className="font-semibold text-foreground">{interests.length}</span> property{interests.length === 1 ? "" : "ies"}
      </div>
      <Button
        className="w-full h-9 text-xs"
        disabled={interests.length === 0}
        onClick={() => {
          markDone(lead.id, preVisitTag("visit-ready"));
          toast.success("Shortlist created. Lead is visit ready.");
        }}
      >
        Mark visit ready
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {title}
      </div>
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

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarIcon;
  label: string;
  value: string;
}) {
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
  const { properties, rescheduleTour, cancelTour, markTourStarted, completeTour } = useApp();
  const prop = properties.find((p) => p.id === tour.propertyId);

  // Handle both old CRM tour format (tcmId) and new MYT tour format (assignedTo, assignedToName)
  const assignedToId = (tour as any).assignedTo ?? (tour as any).tcmId;
  const assignedToName =
    (tour as any).assignedToName ??
    members.find((m) => m.id === assignedToId)?.name ??
    assignedToId ??
    "TBD";
  const scheduledById = (tour as any).scheduledBy;
  const scheduledByName =
    (tour as any).scheduledByName ??
    members.find((m) => m.id === scheduledById)?.name ??
    scheduledById ??
    "TBD";
  const tourType = (tour as any).tourType ?? "physical";
  const qualification = (tour as any).qualification;
  const displayLeadName = normalizeLeadName((tour as any).leadName ?? leadName ?? "");
  const phone = (tour as any).phone ?? "";
  const budget = (tour as any).budget ?? 0;
  const area = (tour as any).area ?? "";
  const canMoveToOnTour = isTodayIST(tour.scheduledAt);
  const tourTimeMs = +new Date(tour.scheduledAt);
  const isPastTour = Number.isFinite(tourTimeMs) && tourTimeMs < Date.now() && !canMoveToOnTour;

  const [showReschedule, setShowReschedule] = useState(false);
  const [newDateTime, setNewDateTime] = useState(() => nextRescheduleLocalValue(tour.scheduledAt));

  useEffect(() => {
    setNewDateTime(nextRescheduleLocalValue(tour.scheduledAt));
  }, [tour.scheduledAt]);

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
      {/* Header with property and status */}
      <div className="flex items-center justify-between">
        <div className="font-display font-semibold text-sm">
          {prop?.name ??
            (tour as any).propertyName ??
            (displayLeadName ? `${displayLeadName}'s Tour` : "Property TBD")}
        </div>
        <Badge className="bg-accent text-accent-foreground capitalize">{tour.status}</Badge>
      </div>

      {/* Date, time, type */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarIcon className="h-3 w-3" />
          {formatSafeDate(tour.scheduledAt, "EEE, MMM d · p", "time unknown")}
        </span>
        {isPastTour && (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px]">
            Date passed
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] capitalize">
          {tourType.replace("-", " ")}
        </Badge>
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
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Qualification
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            {qualification.moveInDate && (
              <div>
                <span className="text-muted-foreground">Move-in:</span>{" "}
                <span className="font-medium">{qualification.moveInDate}</span>
              </div>
            )}
            {qualification.roomType && (
              <div>
                <span className="text-muted-foreground">Room:</span>{" "}
                <span className="font-medium">{qualification.roomType}</span>
              </div>
            )}
            {qualification.decisionMaker && (
              <div>
                <span className="text-muted-foreground">Decision:</span>{" "}
                <span className="font-medium capitalize">{qualification.decisionMaker}</span>
              </div>
            )}
            {qualification.willBookToday && (
              <div>
                <span className="text-muted-foreground">Book today:</span>{" "}
                <span className="font-medium capitalize">{qualification.willBookToday}</span>
              </div>
            )}
            {qualification.workLocation && (
              <div>
                <span className="text-muted-foreground">Work area:</span>{" "}
                <span className="font-medium">{qualification.workLocation}</span>
              </div>
            )}
            {qualification.keyConcern && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Concern:</span>{" "}
                <span className="font-medium">{qualification.keyConcern}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {qualification.readyIn48h && (
              <Badge variant="secondary" className="text-[9px]">
                Ready in 48h
              </Badge>
            )}
            {qualification.exploring && (
              <Badge variant="secondary" className="text-[9px]">
                Exploring
              </Badge>
            )}
            {qualification.comparing && (
              <Badge variant="secondary" className="text-[9px]">
                Comparing
              </Badge>
            )}
            {qualification.needsFamily && (
              <Badge variant="secondary" className="text-[9px]">
                Family approval
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {(tour.status === "scheduled" || tour.status === "confirmed" || tour.status === "on-tour") && (
        <div className="flex flex-wrap gap-2 pt-1">
          {showReschedule ? (
            <div className="flex gap-2 w-full items-end">
              <div className="flex-1">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  New date & time
                </Label>
                <Input
                  type="datetime-local"
                  value={newDateTime}
                  onChange={(e) => setNewDateTime(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs"
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
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setShowReschedule(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              {(tour.status === "scheduled" || tour.status === "confirmed") && canMoveToOnTour && (
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  onClick={() => {
                    void markTourStarted(tour.id)
                      .then(() => toast.success("Moved to on-tour day"))
                      .catch((err) =>
                        toast.error(err instanceof Error ? err.message : "Failed to move tour"),
                      );
                  }}
                >
                  <UserCheck className="h-3 w-3" /> Move to on-tour
                </Button>
              )}
              {(tour.status === "scheduled" || tour.status === "confirmed") && (
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  variant={isPastTour ? "default" : "outline"}
                  onClick={() => setShowReschedule(true)}
                >
                  <CalendarIcon className="h-3 w-3" /> {isPastTour ? "Reschedule overdue tour" : "Reschedule"}
                </Button>
              )}
              {tour.status === "on-tour" && (
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  onClick={() => {
                    void completeTour(tour.id)
                      .then(() => toast.success("Tour completed"))
                      .catch((err) =>
                        toast.error(err instanceof Error ? err.message : "Failed to complete tour"),
                      );
                  }}
                >
                  <CheckCircle2 className="h-3 w-3" /> Tour done
                </Button>
              )}
              {(tour.status === "scheduled" || tour.status === "confirmed") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm("Cancel this tour?")) {
                      cancelTour(tour.id);
                      toast.success("Tour cancelled");
                    }
                  }}
                >
                  <X className="h-3 w-3 mr-1" /> Cancel Tour
                </Button>
              )}
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
          Lead is already known:{" "}
          <span className="font-medium text-foreground">{resolveBestLeadName(lead)}</span>.
          Fill the tour details below and assign it to a TCM (members can also assign to
          themselves).
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
              <Select
                value={answers.bookingSource}
                onValueChange={(v) => onAnswersChange({ bookingSource: v })}
              >
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
              <Select
                value={answers.decisionMaker}
                onValueChange={(v) => onAnswersChange({ decisionMaker: v })}
              >
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
            <Select
              value={answers.roomType}
              onValueChange={(v) => onAnswersChange({ roomType: v })}
            >
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
            <Select
              value={answers.willBookToday}
              onValueChange={(v) => onAnswersChange({ willBookToday: v })}
            >
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
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Tour Type
          </Label>
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
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Property
            </Label>
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
                <SelectItem value={OTHER_PROPERTY_VALUE}>Others</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              TCM
            </Label>
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
            const timePartRaw =
              scheduledAt && scheduledAt.includes("T")
                ? (scheduledAt.split("T")[1] || "").slice(0, 5)
                : "";
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

                <Select
                  value={timePartRaw}
                  onValueChange={(v) => {
                    const d = datePart || new Date().toISOString().split("T")[0];
                    onScheduledAtChange(v ? `${d}T${v}` : "");
                  }}
                >
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

function nextRescheduleLocalValue(iso: string) {
  const d = parseSafeDate(iso);
  if (!d || d.getTime() >= Date.now()) return toLocal(iso);
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(d.getHours() || 11, d.getMinutes(), 0, 0);
  return toLocal(next.toISOString());
}

function priorityFor(c: number): FollowUpPriority {
  return c >= 75 ? "high" : c >= 50 ? "medium" : "low";
}

// Salesforce-style activity tab - backed by the new VPS contracts (or local
// adapter when offline). Auto-logs every system change AND lets the user
// quickly log calls, emails, WhatsApp, notes, meetings and site visits.
function LeadActivityTab({ leadId }: { leadId: string }) {
  const { activities, loading, log, remove } = useActivities({
    entityType: "lead",
    entityId: leadId,
  });
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card p-3">
        <ActivityComposer onLog={log} />
      </div>
      <ActivityTimeline
        activities={activities}
        loading={loading}
        onDelete={remove}
        emptyHint="No activity logged yet. Use the composer above to log a call, message, note, or meeting."
      />
    </div>
  );
}
