// Paste a WhatsApp / portal message → auto-extract every field → review the FULL Quick Add field
// set (Name, Phone, Email, Areas, Full Address, Budget, Move-in, Type, Room, Need, Special Reqs,
// In-BLR, Quality, Zone, Assignee, Stage, Notes) → save through the unified Identity store.
//
// Same UX as before (paste box first, then fields appear), but with ALL fields, matching the
// Quick Add panel 1:1 so nothing is missed before saving.
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, MapPin, Sparkles, Wand2 } from "lucide-react";
import { parseLead, detectZone } from "@/lib/lead-identity/parser";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useOrgMembers, useOrgZones, useActiveTcMs } from "@/hooks/useOrgDirectory";
import { useAuthUser } from "@/lib/auth-store";
import { dispatch } from "@/lib/api/command-bus";
import { api } from "@/lib/api/client";
import { QUICKAD_NEED_OPTIONS, QUICKAD_ROOM_OPTIONS, QUICKAD_TYPE_OPTIONS, parseBudgetAmount } from "@/lib/quickad-shared";
import type { ParsedLeadDraft } from "@/lib/lead-identity/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useApp } from "@/lib/store";
import type { LeadStage, Intent } from "@/lib/types";

const SAMPLE = `Hi team, new lead 👇
Rahul Sharma 9876543210
Email: rahul@example.com
Looking in HSR Layout, BTM, Koramangala
Budget: 8-12k
Move in: 30/06/2026
Working professional, private room, boys
Currently in Bangalore`;

// Zone bucket options come from the org's real zones (live from /api/zones).

const STAGES = [
  "new",
  "contacted",
  "tour-scheduled",
  "tour-done",
  "negotiation",
  "booked",
  "dropped",
  "not-responding-3d",
  "not-responding-7d",
] as const;

const QUALITY_OPTS = [
  { v: "hot" as const, label: "Hot" },
  { v: "good" as const, label: "Good" },
  { v: "bad" as const, label: "Bad" },
];
const BLR_OPTS = [
  { v: true as const, label: "In Bangalore" },
  { v: false as const, label: "Out of Bangalore" },
  { v: null, label: "Unknown" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

interface Props {
  onDone?: () => void;
}

export function LeadPasteParser({ onDone }: Props) {
  const create = useIdentityStore((s) => s.createLead);
  const { members: orgMembers } = useOrgMembers();
  const { tcms: activeTcms } = useActiveTcMs();
  const { zones: orgZones } = useOrgZones();

  const authUser = useAuthUser((s) => s.user);
  const sortedZones = useMemo(() => orgZones.slice().sort((a, b) => a.name.localeCompare(b.name)), [orgZones]);
  const sortedMembers = useMemo(() => {
    const base = (activeTcms && activeTcms.length > 0)
      ? activeTcms.map((a: any) => ({ id: a.id, name: a.fullName ?? a.name, role: a.role ?? 'tcm', zones: a.zones ?? [] }))
      : orgMembers.filter((m) => m.role === 'member' || m.role === 'tcm').map((m) => ({ id: m.id, name: m.fullName ?? m.name, role: m.role, zones: (m as any).zones ?? [] }));
    if (authUser && !base.find((b: any) => b.id === authUser.id)) {
      base.unshift({ id: authUser.id, name: authUser.fullName ?? authUser.name, role: authUser.role ?? 'member', zones: (authUser as any).zones ?? [] });
    }
    return base.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [orgMembers, activeTcms, authUser]);
  const sortedStages = useMemo(() => Array.from(STAGES).slice().sort((a, b) => a.localeCompare(b)), []);
  const addLead = useApp((s) => s.addLead);

  const [raw, setRaw] = useState("");
  const [parsedOnce, setParsedOnce] = useState(false);
  const [lastParsedConfidence, setLastParsedConfidence] = useState<Record<string, number>>({});

  // Quick-Add field state (same as QuickAddLeadPanel)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [areasText, setAreasText] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [budget, setBudget] = useState("");
  const [moveIn, setMoveIn] = useState(todayIso());
  const [type, setType] = useState("");
  const [room, setRoom] = useState("");
  const [need, setNeed] = useState("");
  const [specialReqs, setSpecialReqs] = useState("");
  const [inBLR, setInBLR] = useState<boolean | null | undefined>(undefined);
  const [quality, setQuality] = useState<"hot" | "good" | "bad" | null>(null);
  const [zoneBucket, setZoneBucket] = useState<string>("");
  // Default to the current member when a regular member is adding a lead
  const defaultAssigneeId = authUser?.role === "member" || authUser?.role === "tcm" ? authUser.id : "";
  const [assigneeId, setAssigneeId] = useState<string>(defaultAssigneeId);
  const [stage, setStage] = useState<string>(STAGES[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!assigneeId && defaultAssigneeId) {
      setAssigneeId(defaultAssigneeId);
    }
  }, [assigneeId, defaultAssigneeId]);

  const textRef = useRef<HTMLTextAreaElement>(null);

  const detectedZone = useMemo(
    () => detectZone(`${areasText} ${fullAddress}`),
    [areasText, fullAddress],
  );

  // Auto-parse whenever the paste text changes
  useEffect(() => {
    if (!raw || raw.length < 10) { setParsedOnce(false); return; }
    const parsed = parseLead(raw);
    if (!parsed) return;
    // Track confidence scores for UI indicators
    setLastParsedConfidence(parsed.confidence ?? {});
    applyParsed(parsed);
    setParsedOnce(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const applyParsed = (p: ParsedLeadDraft) => {
    if (p.name) setName(p.name);
    if (p.phone) setPhone(p.phone);
    if (p.email) setEmail(p.email);
    if (p.areas?.length) setAreasText(p.areas.join(", "));
    else if (p.location) setAreasText(p.location);
    if (p.fullAddress) setFullAddress(p.fullAddress);
    if (p.budget) setBudget(p.budget);
    // Accept moveIn if it's ISO format OR any non-empty string (parser tries to convert human dates)
    if (p.moveIn) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(p.moveIn)) setMoveIn(p.moveIn);
      else if (p.moveIn.trim().length > 0) setMoveIn(p.moveIn); // Fallback for unparseable dates
    }
    if (p.type) setType(p.type);
    if (p.quality) setQuality(p.quality);
    if (p.room) setRoom(p.room);
    if (p.need) setNeed(p.need.split(" / ")[0] ?? p.need);
    if (p.specialReqs) setSpecialReqs(p.specialReqs);
    if (p.inBLR !== null && p.inBLR !== undefined) setInBLR(p.inBLR);
  };

  const reset = () => {
    setRaw(""); setParsedOnce(false);
    setLastParsedConfidence({});
    setName(""); setPhone(""); setEmail("");
    setAreasText(""); setFullAddress("");
    setBudget(""); setMoveIn(todayIso());
    setType(""); setRoom(""); setNeed(""); setSpecialReqs("");
    setInBLR(null); setQuality(null); setZoneBucket("");
    setAssigneeId(defaultAssigneeId); setStage(STAGES[0]); setNotes("");
  };

  // Validation matching Quick Add - Email and Full Address are optional.
  const phoneClean = phone.replace(/\D/g, "");
  const phoneValid = /^[6-9]\d{9}$/.test(phoneClean);
  const errors: string[] = [];
  if (!name.trim()) errors.push("Name");
  if (!phoneValid) errors.push("Valid 10-digit phone");
  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push("Valid email");
  if (!areasText.trim()) errors.push("Areas");
  if (!budget.trim()) errors.push("Budget");
  if (!moveIn) errors.push("Move-in date");
  if (moveIn && moveIn < todayIso()) errors.push("Future move-in date");
  if (!type) errors.push("Type");
  if (!room) errors.push("Room");
  if (!need) errors.push("Need");
  if (inBLR === undefined) errors.push("In Bangalore?");
  if (!quality) errors.push("Lead Quality");
  if (!zoneBucket) errors.push("Zone");
  if (!assigneeId) errors.push("Assigned member");
  if (!stage) errors.push("Lead stage");
  const blocking = errors.length > 0;

  const selectedAssignee = sortedMembers.find((m: any) => m.id === assigneeId)
    ?? orgMembers.find((m) => m.id === assigneeId)
    ?? (activeTcms || []).find((a: any) => a.id === assigneeId);

  const save = async () => {
    if (savingRef.current) return;
    if (blocking) {
      toast.error(`Fill all required fields: ${errors.slice(0, 3).join(", ")}${errors.length > 3 ? "…" : ""}`);
      return;
    }
    const areasArr = areasText.split(",").map((a) => a.trim()).filter(Boolean);
    const zoneObj = orgZones.find((z) => z.name === zoneBucket);
    const budgetNum = parseBudgetAmount(budget);

    savingRef.current = true;
    setSaving(true);
    let result: Awaited<ReturnType<typeof dispatch>>;
    try {
      result = await dispatch({
        type: "cmd.lead.create",
        payload: {
          name: name.trim(),
          phone: `+91${phoneClean}`,
          source: "paste",
          budget: budgetNum,
          budgetText: budget.trim(),
          moveInDate: moveIn,
          preferredArea: areasArr[0] ?? areasText.trim(),
          zoneId: zoneObj?.id ?? null,
          email: email.trim(),
          areas: areasArr,
          fullAddress: fullAddress.trim(),
          type, room, need,
          inBLR: inBLR === undefined ? null : inBLR,
          quality,
          specialReqs: specialReqs.trim(),
          notes: notes.trim(),
          zoneCategory: zoneBucket,
          assigneeId: selectedAssignee?.id ?? null,
          stageLabel: stage,
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save lead");
      savingRef.current = false;
      setSaving(false);
      return;
    }
    savingRef.current = false;
    setSaving(false);
    if (!result.ok) {
      toast.error(`Could not save: ${result.error}`);
      return;
    }

    const isServerDuplicate = Boolean((result as any).data?.duplicate);
    if (isServerDuplicate) {
      const existingLeadId = (result as any).data?.leadId;
      if (existingLeadId) {
        try {
          if (selectedAssignee?.id) {
            const assignResult = await dispatch({
              type: "cmd.lead.assign",
              payload: { leadId: existingLeadId, tcmId: selectedAssignee.id },
            });
            if (!assignResult.ok) {
              toast.warning(`Lead already exists, but could not assign it: ${assignResult.error}`);
            }
          }
          const existing = await api.leads.get(existingLeadId) as any;
          addLead({
            id: existing._id,
            name: existing.name,
            phone: existing.phone,
            source: existing.source ?? "manual",
            budget: Number(existing.budget ?? 0),
            budgetText: existing.budgetText ?? "",
            moveInDate: existing.moveInDate,
            preferredArea: existing.preferredArea ?? existing.areas?.[0] ?? "",
            assignedTcmId: existing.assignedTcmId ?? selectedAssignee?.id ?? "",
            assigneeId: existing.assigneeId ?? existing.assignedTcmId ?? selectedAssignee?.id ?? null,
            createdBy: existing.createdBy ?? null,
            stage: (existing.stage ?? "new") as LeadStage,
            intent: (existing.intent ?? "warm") as Intent,
            confidence: Number(existing.confidence ?? 50),
            tags: existing.tags ?? [],
            nextFollowUpAt: existing.nextFollowUpAt ?? null,
            responseSpeedMins: Number(existing.responseSpeedMins ?? 0),
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
            email: existing.email ?? "",
            areas: existing.areas ?? [],
            fullAddress: existing.fullAddress ?? "",
            type: existing.type ?? "",
            room: existing.room ?? "",
            need: existing.need ?? "",
            inBLR: existing.inBLR ?? null,
            quality: existing.quality ?? null,
            specialReqs: existing.specialReqs ?? "",
            notes: existing.notes ?? "",
            zoneCategory: existing.zoneCategory ?? "",
            stageLabel: existing.stageLabel ?? "",
          });
          toast.info(`This phone already exists. Added ${existing.name ?? "existing lead"} to Inbox.`);
          reset();
          onDone?.();
        } catch {
          toast.warning("This phone already exists, but the existing lead is outside your visible queue. No duplicate was created.");
        }
      } else {
        toast.warning("This phone already exists. No duplicate lead was created.");
      }
      return;
    }

    const newLeadId = (result as any).data?.leadId;

    // Mirror into the local identity store so dedup hints stay current.
    const identityLead = create(
      {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        location: areasText.trim(),
        areas: areasArr,
        fullAddress: fullAddress.trim(),
        budget: budget.trim(),
        moveIn,
        type, room, need,
        specialReqs: [specialReqs, notes].filter(Boolean).join(" · "),
        extraContent: notes.trim(),
        budgets: budget.split(/\s*(?:,|\/|\bor\b)\s*/i).filter(Boolean),
        links: fullAddress.match(/https?:\/\/\S+/g) ?? [],
        inBLR: inBLR === undefined ? null : inBLR,
        zone: detectedZone,
        rawSource: raw || `[Paste] ${name} ${phone}`,
      },
      {
        quality,
        stage,
        zoneCategory: zoneBucket,
        assigneeId: selectedAssignee?.id ?? null,
        assigneeName: selectedAssignee?.name ?? null,
      },
    );

    // Optimistically add to the main app store for immediate visibility
    const now = new Date().toISOString();
    addLead({
      id: newLeadId || identityLead.id,
      name: name.trim(),
      phone: `+91${phoneClean}`,
      source: "paste",
      budget: budgetNum,
      budgetText: budget.trim(),
      moveInDate: moveIn,
      preferredArea: areasArr[0] ?? areasText.trim(),
      assignedTcmId: selectedAssignee?.id ?? "",
      assigneeId: selectedAssignee?.id ?? null,
      createdBy: authUser?.id ?? null,
      stage: "new",
      intent: (quality === "hot" ? "hot" : quality === "bad" ? "cold" : "warm") as Intent,
      confidence: quality === "hot" ? 90 : quality === "good" ? 70 : quality === "bad" ? 30 : 50,
      tags: [],
      nextFollowUpAt: null,
      responseSpeedMins: 0,
      createdAt: now,
      updatedAt: now,
      email: email.trim(),
      areas: areasArr,
      fullAddress: fullAddress.trim(),
      type, room, need,
      inBLR: inBLR === undefined ? null : inBLR,
      quality: quality || "good",
      specialReqs: specialReqs.trim(),
      notes: notes.trim(),
      zoneCategory: zoneBucket,
      stageLabel: stage,
    });
    toast.success(`Lead saved · assigned to ${selectedAssignee?.name ?? "Unassigned"}`);
    reset();
    onDone?.();
  };

  return (
    <div className="grid min-h-0 flex-1 items-stretch gap-3 overflow-hidden xl:grid-cols-[minmax(360px,1.05fr)_minmax(420px,1.2fr)_280px]">
      <div className="min-h-0">
        {/* Paste box */}
        <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/80 bg-card shadow-sm">
          <div className="border-b border-border bg-muted/25 px-3 py-2">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Paste the lead</h3>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Paste a WhatsApp, portal, or call note. Parsed fields appear on the right.
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <Button variant="outline" size="sm" className="w-full justify-center" onClick={() => setRaw(SAMPLE)}>
              <Sparkles className="h-3 w-3 mr-1" /> Try sample
            </Button>
            <Textarea
              ref={textRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Paste WhatsApp message, portal lead, email signature, anything..."
              rows={9}
              className="min-h-[360px] flex-1 resize-none rounded-lg bg-background font-mono text-sm leading-relaxed"
            />
            {parsedOnce && (
              <p className="flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-[11px] text-success">
                <CheckCircle2 className="h-3 w-3" /> Parsed. Review before saving.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Full Quick-Add field set (always visible so the person fills missing pieces) */}
      <Card className="flex min-h-0 flex-col overflow-hidden border-border/80 bg-card shadow-sm [&_input]:h-8 [&_input]:text-xs [&_button]:min-h-0 [&_button]:text-[11px] [&_textarea]:text-xs">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-2">
          <div>
            <h3 className="font-semibold text-sm">Review & complete</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Confirm lead identity, requirement, preferences, and routing before it enters Inbox.
            </p>
          </div>
          {blocking ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" /> {errors.length} required
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success">
              <CheckCircle2 className="h-3 w-3" /> Ready
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 p-3">
          <div className="grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-2">
            <FormGroup title="Contact">
              <Field label="Name *">
                <div className="relative">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" />
                  {parsedOnce && lastParsedConfidence.name && (
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                      {lastParsedConfidence.name >= 0.8 ? (
                        <Badge className="text-[9px] bg-green-500">✓ High</Badge>
                      ) : lastParsedConfidence.name >= 0.6 ? (
                        <Badge variant="secondary" className="text-[9px]">~ Medium</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px]">? Low</Badge>
                      )}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Phone *">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxxxxxxx" inputMode="tel"
                  className={cn(!phoneValid && phone ? "border-destructive" : "")} />
              </Field>
              <Field label="Email">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" inputMode="email" />
              </Field>
              <Field label="Areas *">
                <div className="relative">
                  <Input
                    value={areasText}
                    onChange={(e) => setAreasText(e.target.value)}
                    placeholder="HSR, BTM, Koramangala"
                  />
                  {detectedZone && (
                    <Badge variant="secondary" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px]">
                      {detectedZone}
                    </Badge>
                  )}
                </div>
              </Field>
            </FormGroup>

            <FormGroup title="Requirement">
              <Field label="Budget">
                <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="8-12k" />
              </Field>
              <Field label="Move-in">
                <Input
                  type="date"
                  min={todayIso()}
                  value={moveIn}
                  onChange={(e) => setMoveIn(e.target.value)}
                  className={cn(moveIn && moveIn < todayIso() ? "border-destructive" : "")}
                />
              </Field>
              <Field label="Address / map">
                <Input
                  value={fullAddress}
                  onChange={(e) => setFullAddress(e.target.value)}
                  placeholder="Door, landmark or Maps URL"
                />
              </Field>
              <Field label="Type">
                <ChipGroup options={QUICKAD_TYPE_OPTIONS} value={type} onChange={setType} />
              </Field>
            </FormGroup>

            <FormGroup title="Preferences">
              <Field label="Room">
                <ChipGroup options={QUICKAD_ROOM_OPTIONS} value={room} onChange={setRoom} />
              </Field>
              <Field label="Need">
                <ChipGroup options={QUICKAD_NEED_OPTIONS} value={need} onChange={setNeed} />
              </Field>
              <Field label="Currently in Bangalore?">
                <ChipGroup
                  options={BLR_OPTS.map((o) => o.label)}
                  value={BLR_OPTS.find((o) => o.v === inBLR)?.label ?? ""}
                  onChange={(label) => {
                    const opt = BLR_OPTS.find((o) => o.label === label);
                    if (opt !== undefined) setInBLR(opt.v);
                  }}
                />
              </Field>
              <Field label="Lead Quality">
                <ChipGroup
                  options={QUALITY_OPTS.map((o) => o.label)}
                  value={QUALITY_OPTS.find((o) => o.v === quality)?.label ?? ""}
                  onChange={(label) => setQuality(QUALITY_OPTS.find((o) => o.label === label)?.v ?? null)}
                />
              </Field>
            </FormGroup>

            <FormGroup title="Notes">
              <Field label="Requests">
                <Textarea
                  value={specialReqs}
                  onChange={(e) => setSpecialReqs(e.target.value)}
                  rows={1}
                  placeholder="Veg, attached washroom, top floor..."
                  className="min-h-[38px] resize-none"
                />
              </Field>
              <Field label="Internal notes">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={1}
                  placeholder="Internal notes for TCM..."
                  className="min-h-[38px] resize-none"
                />
              </Field>
            </FormGroup>
          </div>

          {blocking && (
            <div className="mt-2 truncate rounded-md border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
              Missing: {errors.join(", ")}
            </div>
          )}
        </div>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden border-border/80 bg-card shadow-sm [&_button]:min-h-0 [&_button]:text-[11px]">
        <div className="border-b border-border bg-muted/25 px-3 py-2">
          <h3 className="font-semibold text-sm">Manual setup</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Choose routing, assignee, and stage before saving.
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <LeftField label="Zone *">
            <Select value={zoneBucket} onValueChange={(v) => setZoneBucket(v)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder={orgZones.length ? "Select zone..." : "No zones configured"} />
              </SelectTrigger>
              <SelectContent>
                {sortedZones.map((z) => <SelectItem key={z.id} value={z.name}>{z.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </LeftField>

          <LeftField label="Assign member *">
            <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder={orgMembers.length ? "Select member..." : "No members yet"} />
              </SelectTrigger>
              <SelectContent>
                {sortedMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LeftField>

          <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px]">
            <div className="text-muted-foreground">Lead will be assigned to</div>
            <div className="font-semibold text-foreground">{selectedAssignee?.name ?? "Unassigned"}</div>
          </div>

          <LeftField label="Lead stage">
            <Select value={stage} onValueChange={(v) => setStage(v)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Select stage..." />
              </SelectTrigger>
              <SelectContent>
                {sortedStages.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </LeftField>
        </div>

        <div className="space-y-2 border-t bg-muted/15 p-3">
          {blocking ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
              {errors.length} fields still needed.
            </div>
          ) : (
            <div className="rounded-md border border-success/20 bg-success/10 px-2 py-1.5 text-[11px] text-success">
              Ready to save into Inbox.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={saving}>Clear</Button>
            <Button size="sm" disabled={blocking || saving} onClick={save}>{saving ? "Saving..." : "Save lead"}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function LeftField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FormGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-h-0 overflow-hidden rounded-xl border border-border/80 bg-background/70 p-2 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="grid grid-cols-1 gap-1">
        {children}
      </div>
    </section>
  );
}

function ChipGroup<T extends string>({ options, value, onChange }: {
  options: readonly T[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          onClick={() => onChange(value === o ? "" : o)}
          className={cn(
            "rounded-md border px-2 py-0.5 text-[10px] transition-colors",
            value === o
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border hover:bg-muted",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
