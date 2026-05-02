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
import { useOrgMembers, useOrgZones } from "@/hooks/useOrgDirectory";
import { useAuthUser } from "@/lib/auth-store";
import { dispatch } from "@/lib/api/command-bus";
import { QUICKAD_NEED_OPTIONS, QUICKAD_ROOM_OPTIONS, QUICKAD_TYPE_OPTIONS, parseBudgetAmount } from "@/lib/quickad-shared";
import type { ParsedLeadDraft } from "@/lib/lead-identity/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useApp } from "@/lib/store";
import type { LeadStage, Intent } from "@/lib/types";

const SAMPLE = `Hi team, new lead 👇
Rahul Sharma 9876543210
Email: rahul@example.com
Looking in HSR Layout, BTM, Koramangala
Budget: 8-12k
Move in: 30/04/2026
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
  { v: "hot" as const, label: "🔥 Hot" },
  { v: "good" as const, label: "✅ Good" },
  { v: "bad" as const, label: "❌ Bad" },
];
const BLR_OPTS = [
  { v: true as const, label: "🏙 In" },
  { v: false as const, label: "✈️ Out" },
  { v: null, label: "❓ Unknown" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

interface Props {
  onDone?: () => void;
}

export function LeadPasteParser({ onDone }: Props) {
  const checkDup = useIdentityStore((s) => s.checkDuplicates);
  const create = useIdentityStore((s) => s.createLead);
  const { members: orgMembers } = useOrgMembers();
  const { zones: orgZones } = useOrgZones();
  const addLead = useApp((s) => s.addLead);

  const [raw, setRaw] = useState("");
  const [parsedOnce, setParsedOnce] = useState(false);

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
  const authUser = useAuthUser((s) => s.user);
  const defaultAssigneeId = (authUser?.role === "member") ? authUser.id : "";
  const [assigneeId, setAssigneeId] = useState<string>(defaultAssigneeId);
  const [stage, setStage] = useState<string>(STAGES[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (p.moveIn && /^\d{4}-\d{2}-\d{2}$/.test(p.moveIn)) setMoveIn(p.moveIn);
    if (p.type) setType(p.type);
    if (p.room) setRoom(p.room);
    if (p.need) setNeed(p.need.split(" / ")[0] ?? p.need);
    if (p.specialReqs) setSpecialReqs(p.specialReqs);
    if (p.inBLR !== null && p.inBLR !== undefined) setInBLR(p.inBLR);
  };

  const reset = () => {
    setRaw(""); setParsedOnce(false);
    setName(""); setPhone(""); setEmail("");
    setAreasText(""); setFullAddress("");
    setBudget(""); setMoveIn(todayIso());
    setType(""); setRoom(""); setNeed(""); setSpecialReqs("");
    setInBLR(null); setQuality(null); setZoneBucket("");
    setAssigneeId(defaultAssigneeId); setStage(STAGES[0]); setNotes("");
  };

  // Validation matching Quick Add — every field is required.
  const phoneClean = phone.replace(/\D/g, "");
  const phoneValid = /^[6-9]\d{9}$/.test(phoneClean);
  const errors: string[] = [];
  if (!name.trim()) errors.push("Name");
  if (!phoneValid) errors.push("Valid 10-digit phone");
  if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push("Email");
  if (!areasText.trim()) errors.push("Areas");
  if (!fullAddress.trim()) errors.push("Full address");
  if (!budget.trim()) errors.push("Budget");
  if (!moveIn) errors.push("Move-in date");
  if (!type) errors.push("Type");
  if (!room) errors.push("Room");
  if (!need) errors.push("Need");
  if (inBLR === undefined) errors.push("In Bangalore?");
  if (!quality) errors.push("Lead Quality");
  if (!zoneBucket) errors.push("Zone");
  if (!assigneeId) errors.push("Assigned member");
  if (!stage) errors.push("Lead stage");
  const blocking = errors.length > 0;

  const save = async () => {
    if (blocking) {
      toast.error(`Fill all required fields: ${errors.slice(0, 3).join(", ")}${errors.length > 3 ? "…" : ""}`);
      return;
    }
    const dup = checkDup({ name, phone, email, location: areasText });
    if (dup.type === "exact" || dup.type === "strong") {
      const existing = dup.candidates[0]?.lead;
      toast.warning(`Duplicate detected: ${existing?.name ?? "existing lead"}`);
      return;
    }
    const areasArr = areasText.split(",").map((a) => a.trim()).filter(Boolean);
    const assignee = orgMembers.find((m) => m.id === assigneeId);
    const zoneObj = orgZones.find((z) => z.name === zoneBucket);
    const budgetNum = parseBudgetAmount(budget);

    setSaving(true);
    const result = await dispatch({
      type: "cmd.lead.create",
      payload: {
        name: name.trim(),
        phone: `+91${phoneClean}`,
        source: "paste",
        budget: budgetNum,
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
        assigneeId: assignee?.id ?? null,
        stageLabel: stage,
      },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(`Could not save: ${result.error}`);
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
        assigneeId: assignee?.id ?? null,
        assigneeName: assignee?.name ?? null,
      },
    );

    // Optimistically add to the main app store for immediate visibility
    const now = new Date().toISOString();
    addLead({
      id: newLeadId || identityLead.ulid,
      name: name.trim(),
      phone: `+91${phoneClean}`,
      source: "paste",
      budget: budgetNum,
      moveInDate: moveIn,
      preferredArea: areasArr[0] ?? areasText.trim(),
      assignedTcmId: assignee?.id ?? "",
      stage: (stage as LeadStage) || "new",
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
    toast.success(`Lead saved · ${name.trim()}`);
    reset();
    onDone?.();
  };

  return (
    <div className="space-y-4">
      {/* Paste box */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Paste the lead</h3>
            <Badge variant="secondary">auto-fills every field</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRaw(SAMPLE)}>
            <Sparkles className="h-3 w-3 mr-1" /> Try sample
          </Button>
        </div>
        <Textarea
          ref={textRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Paste WhatsApp message, portal lead, email signature, anything…"
          rows={6}
          className="font-mono text-xs"
        />
        {parsedOnce && (
          <p className="flex items-center gap-1 text-[11px] text-green-600">
            <CheckCircle2 className="h-3 w-3" /> Parsed — review fields below before saving
          </p>
        )}
      </Card>

      {/* Full Quick-Add field set (always visible so the person fills missing pieces) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Review & complete</h3>
          {blocking ? (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" /> {errors.length} required
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" /> Ready to save
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="👤 Name *">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" />
          </Field>
          <Field label="📱 Phone *">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxxxxxxx" inputMode="tel"
              className={cn(!phoneValid && phone ? "border-destructive" : "")} />
          </Field>
        </div>

        <Field label="✉️ Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" inputMode="email" />
        </Field>

        <Field label="📍 Areas (comma-separated)">
          <div className="relative">
            <Input
              value={areasText}
              onChange={(e) => setAreasText(e.target.value)}
              placeholder="HSR Layout, BTM, Koramangala"
            />
            {detectedZone && (
              <Badge variant="secondary" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px]">
                {detectedZone}
              </Badge>
            )}
          </div>
          {areasText.includes(",") && (
            <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" /> Multiple Areas Detected
            </p>
          )}
        </Field>

        <Field label="🏠 Full Address / Map link">
          <Textarea
            value={fullAddress}
            onChange={(e) => setFullAddress(e.target.value)}
            rows={2}
            placeholder="Door no, street, landmark or Google Maps URL"
            className="resize-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="💰 Budget">
            <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="8-12k" />
          </Field>
          <Field label="📅 Move-in">
            <Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
          </Field>
        </div>

        <Field label="💼 Type">
          <ChipGroup options={QUICKAD_TYPE_OPTIONS} value={type} onChange={setType} />
        </Field>
        <Field label="🛏 Room">
          <ChipGroup options={QUICKAD_ROOM_OPTIONS} value={room} onChange={setRoom} />
        </Field>
        <Field label="👥 Need">
          <ChipGroup options={QUICKAD_NEED_OPTIONS} value={need} onChange={setNeed} />
        </Field>

        <Field label="⭐ Special Requests">
          <Textarea
            value={specialReqs}
            onChange={(e) => setSpecialReqs(e.target.value)}
            rows={2}
            placeholder="Veg only · attached washroom · top floor…"
            className="resize-none"
          />
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

        <Field label="Zone *">
          <select
            value={zoneBucket}
            onChange={(e) => setZoneBucket(e.target.value)}
            className="w-full h-9 bg-background border border-border rounded-md px-2 text-xs"
          >
            <option value="">{orgZones.length ? "Select zone…" : "No zones configured"}</option>
            {orgZones.map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
          </select>
        </Field>

        <Field label="Assign Member *">
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full h-9 bg-background border border-border rounded-md px-2 text-xs"
          >
            <option value="">{orgMembers.length ? "Select member…" : "No members yet"}</option>
            {orgMembers.filter(m => m.role === 'member' || m.role === 'tcm').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>

        <Field label="Lead Stage">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full h-9 bg-background border border-border rounded-md px-2 text-xs"
          >
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="📝 Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Internal notes…"
            className="resize-none"
          />
        </Field>

        {blocking && (
          <ul className="text-[11px] text-destructive list-disc list-inside">
            {errors.map((e) => <li key={e}>{e} is required</li>)}
          </ul>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={reset} disabled={saving}>Clear</Button>
          <Button disabled={blocking || saving} onClick={save}>{saving ? "Saving…" : "Save lead"}</Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ChipGroup<T extends string>({ options, value, onChange }: {
  options: readonly T[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          onClick={() => onChange(value === o ? "" : o)}
          className={cn(
            "px-2 py-1 rounded-md border text-[11px] transition-colors",
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
