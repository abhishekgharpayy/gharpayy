import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useApp, getProperty, getTcm } from "@/lib/store";
import { useAppState } from "@/myt/lib/app-context";
import { Tour } from "@/myt/lib/types";
import { useOrgMembers } from "@/hooks/useOrgDirectory";
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
import {
  Phone, MessageSquare, Calendar as CalendarIcon, Tag, ClipboardCheck,
  AlertTriangle, CheckCircle2, X, Activity as ActivityIcon, MapPin,
  Wallet, Send, Zap, IndianRupee, BellRing, ExternalLink, Plus,
  Building2, Video, Briefcase,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { Lead, LeadStage, FollowUpPriority, SequenceKind } from "@/lib/types";
import { toast } from "sonner";
import { useMountedNow } from "@/hooks/use-now";
import { sendTourMessage as sendOwnerTourMessage } from "@/owner/messaging";
import { useSettings } from "@/myt/lib/settings-context";
import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { ActivityComposer } from "@/components/activities/ActivityComposer";
import { TodoPanel } from "@/components/todos/TodoPanel";
import { useActivities } from "@/hooks/useActivities";

const TAG_OPTIONS = ["price-issue", "location-mismatch", "parents-involved", "urgent", "budget-low"];
const OBJECTIONS = ["Budget", "Location", "Amenities", "Timing", "Parents", "Comparing options", "Other"];
const ROOM_TYPES = ["Single", "Double Sharing", "Triple Sharing", "Studio"];
const BOOKING_SOURCES = ["ad", "referral", "organic", "whatsapp", "call", "walk-in"];
const DECISION_MAKERS = ["self", "parent", "group"];
const TOUR_TYPES = [
  { value: "physical", label: "Physical", icon: Building2 },
  { value: "virtual", label: "Virtual", icon: Video },
  { value: "pre-book-pitch", label: "Pre-book", icon: Briefcase },
];
const TEMPLATES = [
  { id: "tour-confirm", label: "Tour confirmation", body: "Hi! Confirming your tour today. Looking forward to meeting you." },
  { id: "post-tour", label: "Post-tour check-in", body: "Hi! How did you find the property? Happy to answer any questions." },
  { id: "scarcity", label: "Scarcity", body: "Just a heads-up — only a couple of beds left at this price." },
];

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
  const { settings } = useSettings();

  const lead = useMemo(() => leads.find((l) => l.id === selectedLeadId) ?? null, [leads, selectedLeadId]);

  // Mark handoffs read when this lead opens
  useEffect(() => {
    if (selectedLeadId) markHandoffsRead(selectedLeadId);
  }, [selectedLeadId, markHandoffsRead]);

  const leadTours = useMemo(
    () => (lead ? tours.filter((t) => t.leadId === lead.id).sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)) : []),
    [tours, lead],
  );
  const leadActivities = useMemo(
    () => (lead ? activities.filter((a) => a.leadId === lead.id).slice(0, 30) : []),
    [activities, lead],
  );

  const memberUsers = useMemo(() => orgMembers.filter(m => m.role === 'member' || m.role === 'tcm').sort((a, b) => a.name.localeCompare(b.name)), [orgMembers]);

  // Tour scheduling form state
  const [tcmId, setTcmId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isSchedulingAnother, setIsSchedulingAnother] = useState(false);
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
  const [tab, setTab] = useState("control");
  const [, mounted] = useMountedNow();

  // Note state
  const [note, setNote] = useState("");
  const [customMsg, setCustomMsg] = useState("");

  const pendingPostTour = leadTours.find(
    (t) => t.status === "completed" && !t.postTour.filledAt,
  );
  const upcomingTour = leadTours.find((t) => t.status === "scheduled");

  useEffect(() => {
    if (!lead) return;
    setTcmId(upcomingTour?.tcmId ?? lead.assignedTcmId ?? currentMemberId ?? "");
    setPropertyId(upcomingTour?.propertyId ?? "");
    setScheduledAt(upcomingTour ? toLocal(upcomingTour.scheduledAt) : "");
    setScheduleAnswers((answers) => ({
      ...answers,
      budget: String(lead.budget || ""),
      moveInDate: lead.moveInDate || "",
      workLocation: lead.preferredArea || "",
      keyConcern: lead.tags.join(", "),
    }));
    setIsSchedulingAnother(false);
    setTab(pendingPostTour ? "post" : upcomingTour ? "tour" : settings.matching.drawerDefaultTab);
  }, [lead, pendingPostTour, upcomingTour, settings.matching.drawerDefaultTab]);

  if (!lead) return null;

  const selectedMember = orgMembers.find((m) => m.id === lead.assignedTcmId) ?? null;

  const handleSchedule = () => {
    if (!tcmId || !scheduledAt) {
      toast.error("Member and time are required");
      return;
    }
    const assignee = memberUsers.find((m) => m.id === tcmId) ?? null;
    const scheduler = currentMemberId ? (orgMembers.find((m) => m.id === currentMemberId) ?? null) : null;
    const tour = scheduleTour({ leadId: lead.id, propertyId: propertyId || undefined, tcmId, scheduledAt: new Date(scheduledAt).toISOString() });

    // Also create MYT tour for the schedule page
    const scheduledDateTime = new Date(scheduledAt);
    const mytTour = {
      id: tour.id,
      leadName: lead.name,
      phone: lead.phone || "",
      assignedTo: tcmId,
      assignedToName: assignee?.name ?? "Member",
      propertyName: propertyId ? properties.find(p => p.id === propertyId)?.name ?? "Property Tour" : "Property Tour",
      propertyId: propertyId || undefined,
      area: lead.preferredArea || "",
      zoneId: "", // Will be determined by area
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
    setTours(prev => [mytTour, ...prev]);

    notifyTourScheduled({
      tourId: tour.id,
      leadName: lead.name,
      senderId: scheduler?.id ?? tcmId,
      senderName: scheduler?.name ?? selectedMember?.name ?? "You",
      assigneeName: assignee?.name ?? selectedMember?.name ?? "Member",
      recipientIds: [
        { id: tcmId, name: assignee?.name ?? selectedMember?.name ?? "Member" },
        ...(scheduler?.id && scheduler.id !== tcmId ? [{ id: scheduler.id, name: scheduler.name }] : []),
      ],
    });
    setTcmId("");
    setPropertyId("");
    setScheduledAt("");
    setIsSchedulingAnother(false);
    toast.success("Tour scheduled");
  };

  const startAnotherTour = () => {
    setTcmId(lead.assignedTcmId ?? currentMemberId ?? "");
    setPropertyId("");
    setScheduledAt("");
    setIsSchedulingAnother(true);
    setTab("tour");
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
            <Meta icon={CalendarIcon} label="Move-in" value={format(new Date(lead.moveInDate), "MMM d")} />
            <Meta icon={Wallet} label="Budget" value={`₹${(lead.budget / 1000).toFixed(0)}k`} />
            <Meta icon={MapPin} label="Area" value={lead.preferredArea} />
          </div>
        </SheetHeader>

        {/* CRM 10x — commitment banner + 48h post-visit gate */}
        <CommitmentBanner lead={lead} />
        <PostVisitGate lead={lead} />

        {/* Stale alert */}
        {pendingPostTour && (
          <div className="mx-5 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-destructive">Post-tour update missing</div>
              <div className="text-muted-foreground">
                Tour completed {mounted ? formatDistanceToNow(new Date(pendingPostTour.scheduledAt), { addSuffix: true }) : "recently"}.
                TCM must fill the form below.
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <Tabs value={tab} onValueChange={setTab} className="px-5 py-4">
            <TabsList className="flex h-auto w-full overflow-x-auto gap-1 scrollbar-micro justify-start">
              <TabsTrigger value="activity" className="text-xs shrink-0 whitespace-nowrap">Activity</TabsTrigger>
              <TabsTrigger value="best-fit" className="text-xs shrink-0 whitespace-nowrap">Best Fit</TabsTrigger>
              <TabsTrigger value="control" className="text-xs shrink-0 whitespace-nowrap">Control</TabsTrigger>
              <TabsTrigger value="details" className="text-xs shrink-0 whitespace-nowrap">Details</TabsTrigger>
              <TabsTrigger value="dossier" className="text-xs shrink-0 whitespace-nowrap">Dossier</TabsTrigger>
              <TabsTrigger value="handoff" className="text-xs shrink-0 whitespace-nowrap">Handoff</TabsTrigger>
              <TabsTrigger value="log" className="text-xs shrink-0 whitespace-nowrap">Log</TabsTrigger>
              <TabsTrigger value="post" className="text-xs shrink-0 whitespace-nowrap">
                Post {pendingPostTour && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-destructive" />}
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs shrink-0 whitespace-nowrap">Tasks</TabsTrigger>
              <TabsTrigger value="tour" className="text-xs shrink-0 whitespace-nowrap">Tour</TabsTrigger>
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

            <TabsContent value="best-fit" className="space-y-4 pt-4">
              <Section title="Best property matches">
                <SupplyMatchPanel lead={lead} onNavigateAway={() => selectLead(null)} />
              </Section>
            </TabsContent>

            {/* CONTROL — status, intent, follow-up, action engine, notes, tags */}
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
                  Currently with <span className="text-foreground font-medium">{selectedMember?.name ?? "—"}</span>
                </div>
              </Section>

              <Section title="Status engine">
                <Select value={lead.stage} onValueChange={(v) => {
                  const prev = lead.stage;
                  setLeadStage(lead.id, v as LeadStage);
                  if (v === "dropped") {
                    toast("Marked dropped", {
                      description: `${lead.name} → dropped`,
                      action: {
                        label: "Undo",
                        onClick: () => { setLeadStage(lead.id, prev); toast.success("Restored"); },
                      },
                      duration: 5000,
                    });
                  }
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
                    Due {mounted ? formatDistanceToNow(new Date(lead.nextFollowUpAt), { addSuffix: true }) : "soon"}
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
              {leadTours.length > 0 && (
                <Button variant="secondary" size="sm" className="w-full gap-1.5" onClick={startAnotherTour}>
                  <Plus className="h-3.5 w-3.5" /> Schedule another Tour for this lead
                </Button>
              )}
              {upcomingTour ? (
                <Section title="Upcoming tour">
                  <UpcomingTourCard
                    tour={upcomingTour}
                    scheduledAt={scheduledAt}
                    onScheduledAtChange={setScheduledAt}
                    onReschedule={() => {
                      if (!scheduledAt) {
                        toast.error("Choose a date and time to reschedule");
                        return;
                      }
                      rescheduleTour(upcomingTour.id, new Date(scheduledAt).toISOString());
                      toast.success("Tour rescheduled");
                    }}
                    onCancel={() => {
                      const prevAt = upcomingTour.scheduledAt;
                      const tourId = upcomingTour.id;
                      cancelTour(tourId);
                      toast("Tour cancelled", {
                        description: `${lead.name} · ${format(new Date(prevAt), "MMM d, p")}`,
                        action: {
                          label: "Undo",
                          onClick: () => {
                            // restore by rescheduling — store doesn't track 'cancelled' undo cleanly
                            useApp.getState().rescheduleTour(tourId, prevAt);
                            useApp.setState((s) => ({
                              tours: s.tours.map((x) => x.id === tourId ? { ...x, status: "scheduled" } : x),
                            }));
                            toast.success("Tour restored");
                          },
                        },
                        duration: 5000,
                      });
                    }}
                     onComplete={() => {
                       completeTour(upcomingTour.id);
                       setTab("post");
                       toast.success("Tour completed — fill the post-tour form");
                     }}
                  />
                </Section>
              ) : null}

              {(!upcomingTour || isSchedulingAnother) ? (
                <InlineScheduleTour
                  lead={lead}
                  properties={properties}
                  tcms={memberUsers}
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
                            <span className="text-muted-foreground">{format(new Date(t.scheduledAt), "MMM d, p")}</span>
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
                      Tour at <span className="text-foreground font-medium">{prop?.name}</span> · {format(new Date(target.scheduledAt), "MMM d, p")}
                    </div>

                    {/* Send updates / reminders — one row, always visible post-tour */}
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
                          sendMessage(lead.id, 'Quick update — any thoughts on the property?');
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
                        Choose carefully — the lead's stage <em>and</em> closure status update only when you click here.
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

                    <Section title={`Deal confidence — ${pt.confidence}%`}>
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
                        <span>Form complete · saved {mounted ? formatDistanceToNow(new Date(pt.filledAt), { addSuffix: true }) : "recently"}</span>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex items-center gap-2 text-xs">
                        <ClipboardCheck className="h-4 w-4" />
                        <span>Fill all four fields to mark this lead complete and silence the alert.</span>
                      </div>
                    )}

                    {/* Close deal — one click, blocks the bed, fires the booking */}
                    {lead.stage !== "booked" && (
                      <Button
                        size="lg" className="w-full bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => {
                          closeDeal({
                            leadId: lead.id,
                            tourId: target.id,
                            propertyId: target.propertyId,
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

            {/* HANDOFF — FlowOps ↔ TCM thread for this lead */}
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
                          {format(new Date(a.ts), "MMM d, p")} · {a.actor === "system" ? "system" : tcms.find((t) => t.id === a.actor)?.name ?? a.actor}
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
  scheduledAt,
  onScheduledAtChange,
  onReschedule,
  onCancel,
  onComplete,
}: {
  tour: import("@/lib/types").Tour;
  scheduledAt: string;
  onScheduledAtChange: (value: string) => void;
  onReschedule: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const { properties, tcms } = useApp();
  const prop = properties.find((p) => p.id === tour.propertyId);
  const tcm = tcms.find((t) => t.id === tour.tcmId);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-display font-semibold text-sm">{prop?.name ?? "Property TBD"}</div>
        <Badge className="bg-accent text-accent-foreground capitalize">{tour.status}</Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        {format(new Date(tour.scheduledAt), "EEE, MMM d · p")}{tcm?.name ? ` · ${tcm.name}` : ""}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => onScheduledAtChange(e.target.value)}
          className="h-9 text-sm"
        />
        <Button size="sm" onClick={onReschedule} className="gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5" /> Reschedule
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="default" size="sm" className="flex-1" onClick={onComplete}>
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Complete
        </Button>
      </div>
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
          Lead is already known: <span className="font-medium text-foreground">{lead.name}</span>. Fill the tour details below and assign it to any CRM member.
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
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => onScheduledAtChange(e.target.value)}
            className="h-9 text-sm"
          />
          <Button size="sm" onClick={onSchedule} className="gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" /> Schedule Tour
          </Button>
        </div>
      </div>
    </Section>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function priorityFor(c: number): FollowUpPriority {
  return c >= 75 ? "high" : c >= 50 ? "medium" : "low";
}

// Salesforce-style activity tab — backed by the new VPS contracts (or local
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
