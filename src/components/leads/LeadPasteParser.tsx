import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Sparkles, Wand2, Zap } from "lucide-react";
import { detectZone, parseLead as regexParseLeadDirect } from "@/lib/lead-identity/parser";
import { LeadParsingService, type AIParsedLead } from "@/lib/lead-identity/LeadParsingService";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { memberOptionLabel, memberShortLabel, resolveMemberPrimaryZone, useOrgMembers, useOrgZones, useActiveTcMs } from "@/hooks/useOrgDirectory";
import { useAuthUser } from "@/lib/auth-store";
import { dispatch } from "@/lib/api/command-bus";
import { api } from "@/lib/api/client";
import { QUICKAD_NEED_OPTIONS, QUICKAD_ROOM_OPTIONS, QUICKAD_TYPE_OPTIONS, parseBudgetAmount } from "@/lib/quickad-shared";
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

const STAGES = [
  "new", "contacted", "tour-scheduled", "tour-done",
  "negotiation", "booked", "dropped", "not-responding-3d", "not-responding-7d",
] as const;

const QUALITY_OPTS = [
  { v: "hot" as const, label: "🔥 Hot" },
  { v: "good" as const, label: "✅ Good" },
  { v: "bad" as const, label: "❌ Bad" },
];

const BLR_OPTS = [
  { v: true as const, label: "In Bangalore" },
  { v: false as const, label: "Out of Bangalore" },
  { v: null, label: "Unknown" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

// Auto-classify lead quality based on parsed data
function autoClassifyQuality(
  phone: string,
  budget: string,
  moveIn: string,
  area: string,
  type: string,
): "hot" | "good" | "bad" | null {
  const hasPhone = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ""));
  if (!hasPhone) return null;

  // Hot: move-in is immediate or within 30 days
  if (moveIn) {
    const isImmediate = /immediate|asap|now|today|tomorrow/i.test(moveIn);
    const moveDate = new Date(moveIn);
    const daysUntilMove = (moveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (isImmediate || (daysUntilMove >= 0 && daysUntilMove <= 30)) {
      return "hot";
    }
  }

  // Bad: budget too low (under 5k)
  if (budget) {
    const nums = budget.replace(/k/gi, "000").match(/\d+/g)?.map(Number) ?? [];
    const maxBudget = nums.length ? Math.max(...nums) : 0;
    if (maxBudget > 0 && maxBudget < 5000) return "bad";
  }

  // Good: has phone + budget + area
  if (budget && area) return "good";

  // Good: has phone + type (working professional = serious lead)
  if (type === "Working" && budget) return "good";

  // Default: good if phone present
  return "good";
}

interface Props {
  onDone?: () => void;
}

export function LeadPasteParser({ onDone }: Props) {
  const create = useIdentityStore((s) => s.createLead);
  const { members: orgMembers } = useOrgMembers();
  const { tcms: activeTcms } = useActiveTcMs();
  const { zones: orgZones } = useOrgZones();
  const authUser = useAuthUser((s) => s.user);
  const addLead = useApp((s) => s.addLead);

  const sortedZones = useMemo(
    () => orgZones.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [orgZones]
  );

  // All members combined and deduplicated
  const allMembers = useMemo(() => {
    const base = (activeTcms && activeTcms.length > 0)
      ? activeTcms.map((a: any) => ({
          id: a.id,
          name: a.fullName ?? a.name,
          role: a.role ?? "tcm",
          zones: a.zones ?? (a.zone ? [a.zone] : []),
        }))
      : orgMembers
          .filter((m) => m.role === "member" || m.role === "tcm")
          .map((m: any) => ({
            id: m.id,
            name: m.fullName ?? m.name,
            role: m.role,
            zones: m.zones ?? (m.zone ? [m.zone] : []),
          }));
    if (authUser && !base.find((b: any) => b.id === authUser.id)) {
      base.unshift({
        id: authUser.id,
        name: authUser.fullName ?? authUser.name,
        role: authUser.role ?? "member",
        zones: (authUser as any).zones ?? [],
      });
    }
    return base.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [orgMembers, activeTcms, authUser]);

  const defaultAssigneeId = authUser?.id ?? "";

  // Form state
  const [raw, setRaw] = useState("");
  const [parsedOnce, setParsedOnce] = useState(false);
  const [parsingAI, setParsingAI] = useState(false);
  const [aiMissing, setAiMissing] = useState<string[]>([]);
  const [parsedByAI, setParsedByAI] = useState(false);
  const [rawSource, setRawSource] = useState("");
  const [lastParsedConfidence, setLastParsedConfidence] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [areasText, setAreasText] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [budget, setBudget] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [type, setType] = useState("");
  const [room, setRoom] = useState("");
  const [need, setNeed] = useState("");
  const [specialReqs, setSpecialReqs] = useState("");
  const [notes, setNotes] = useState("");
  const [inBLR, setInBLR] = useState<boolean | null | undefined>(undefined);
  const [quality, setQuality] = useState<"hot" | "good" | "bad" | null>(null);
  const [zoneBucket, setZoneBucket] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>(defaultAssigneeId);
  const [stage, setStage] = useState<string>(STAGES[0]);
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    exists: boolean; leadId?: string; owner?: string; createdAt?: string; currentStage?: string;
  } | null>(null);

  // Refs
  const savingRef = useRef(false);
  const lastParsedRawRef = useRef("");
  const aiParsingForRef = useRef("");
  // Mirror of touchedFields as a ref so effects always read current value
  const touchedFieldsRef = useRef<Set<string>>(new Set());
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  const touch = (field: string) => {
    touchedFieldsRef.current = new Set(touchedFieldsRef.current).add(field);
    setTouchedFields(new Set(touchedFieldsRef.current));
  };

  // Sync assignee default
  useEffect(() => {
    if (!assigneeId && defaultAssigneeId) setAssigneeId(defaultAssigneeId);
  }, [defaultAssigneeId]);

  // Zone-filtered members — only show members in the selected zone
  const zoneFilteredMembers = useMemo(() => {
    if (!zoneBucket) return allMembers;
    const filtered = allMembers.filter((m: any) =>
      m.zones?.includes(zoneBucket) || m.zones?.some((z: string) =>
        z.toLowerCase() === zoneBucket.toLowerCase()
      )
    );
    // Always include currently selected assignee even if zone doesn't match
    const current = allMembers.find((m: any) => m.id === assigneeId);
    if (current && !filtered.find((m: any) => m.id === current.id)) {
      filtered.unshift(current);
    }
    return filtered.length > 0 ? filtered : allMembers;
  }, [allMembers, zoneBucket, assigneeId]);

  const selectedAssignee = allMembers.find((m: any) => m.id === assigneeId);

  // Auto-set zone from assignee
  useEffect(() => {
    if (!selectedAssignee) return;
    const zone = resolveMemberPrimaryZone(selectedAssignee, orgZones);
    if (zone && !touchedFieldsRef.current.has("zoneBucket")) {
      setZoneBucket(zone);
    }
  }, [assigneeId, selectedAssignee, orgZones]);

  const detectedZone = useMemo(
    () => detectZone(`${areasText} ${fullAddress}`),
    [areasText, fullAddress]
  );

  // Auto-set zone from detected area
  useEffect(() => {
    if (detectedZone && !touchedFieldsRef.current.has("zoneBucket")) {
      const exactZone = resolveMemberPrimaryZone({ zones: [detectedZone] }, orgZones);
      // ONLY set it if this zone actually exists in your organization's dropdown options
      if (exactZone && orgZones.some(z => z.name === exactZone)) {
        setZoneBucket(exactZone);
      }
    }
  }, [detectedZone, orgZones]);

  // ── Phase 1: Regex fills fields INSTANTLY — no network, no waiting ──
  useEffect(() => {
    if (raw.length < 10) return;
    const regexResult = regexParseLeadDirect(raw);
    if (!regexResult) return;

    const tf = touchedFieldsRef.current;

    if (regexResult.name && !tf.has("name")) setName(regexResult.name);
    if (regexResult.phone && !tf.has("phone")) setPhone(regexResult.phone);
    if (regexResult.email && !tf.has("email")) setEmail(regexResult.email);

    // Use areas array if available, else location — but clean "Looking in" prefix
    const rawArea = regexResult.areas?.length
      ? regexResult.areas.join(", ")
      : regexResult.location ?? "";
    const cleanArea = rawArea.replace(/^looking\s+in\s*/i, "").trim();
    if (cleanArea && !tf.has("areasText")) setAreasText(cleanArea);

    if (regexResult.budget && !tf.has("budget")) setBudget(regexResult.budget);

    if (regexResult.moveIn && !tf.has("moveIn") && /^\d{4}-\d{2}-\d{2}$/.test(regexResult.moveIn)) {
      setMoveIn(regexResult.moveIn);
    }

    if (regexResult.type && !tf.has("type")) setType(regexResult.type);
    if (regexResult.room && !tf.has("room")) setRoom(regexResult.room);
    if (regexResult.need && !tf.has("need")) {
      setNeed(regexResult.need.split(" / ")[0] ?? regexResult.need);
    }
    if (regexResult.inBLR !== null && regexResult.inBLR !== undefined && !tf.has("inBLR")) {
      setInBLR(regexResult.inBLR);
    }

    // specialReqs — filter out junk
    if (regexResult.specialReqs && !tf.has("specialReqs")) {
      const val = regexResult.specialReqs.trim();
      const isJunk = /hi\s*team|new\s*lead|gharpayy|currently\s*in|not\s*in\s*(bangalore|blr)|👇|emoji/i.test(val);
      if (!isJunk && val.length > 0 && val.length <= 120) setSpecialReqs(val);
    }

    // Auto-classify quality
    if (!tf.has("quality") && regexResult.phone) {
      const autoQ = autoClassifyQuality(
        regexResult.phone,
        regexResult.budget ?? "",
        regexResult.moveIn ?? "",
        cleanArea,
        regexResult.type ?? "",
      );
      if (autoQ) setQuality(autoQ);
    }

    setParsedOnce(true);
    setParsedByAI(false);
  }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 2: AI upgrades results in background — 800ms debounce ──
  useEffect(() => {
    if (raw.length < 10) return;
    if (aiParsingForRef.current === raw) return;

    const timer = setTimeout(async () => {
      if (aiParsingForRef.current === raw) return;
      aiParsingForRef.current = raw;
      lastParsedRawRef.current = raw;
      setParsingAI(true);
      try {
        const parsed = await LeadParsingService.parseLead(raw);
        if (!parsed || parsed.status === "Failed") return;
        setAiMissing(parsed.missing ?? []);
        setParsedByAI(parsed.parsedByAI ?? false);
        setRawSource(raw);
        setLastParsedConfidence(parsed.confidence ?? 100);
        applyParsedAI(parsed);
        setParsedOnce(true);
      } catch {
        // silent — regex results already shown
      } finally {
        setParsingAI(false);
        aiParsingForRef.current = "";
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply AI results — only upgrade fields, never overwrite touched ones
  const applyParsedAI = (p: any) => {
    const tf = touchedFieldsRef.current;
    if (p.fields.name && !tf.has("name")) setName(p.fields.name);
    if (p.fields.phone && !tf.has("phone")) setPhone(p.fields.phone);
    if (p.fields.email && !tf.has("email")) setEmail(p.fields.email);
    if (p.fields.area && !tf.has("areasText")) {
      const clean = p.fields.area.replace(/^looking\s+in\s*/i, "").trim();
      if (clean) setAreasText(clean);
    }
    if (p.fields.budget && !tf.has("budget")) setBudget(p.fields.budget);
    if (p.fields.moveIn && !tf.has("moveIn")) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(p.fields.moveIn)) setMoveIn(p.fields.moveIn);
    }
    if (p.fields.type && !tf.has("type")) setType(p.fields.type);
    if (p.fields.room && !tf.has("room")) setRoom(p.fields.room);
    if (p.fields.need && !tf.has("need")) setNeed(p.fields.need.split(" / ")[0] ?? p.fields.need);
    if (p.fields.inBLR !== null && p.fields.inBLR !== undefined && !tf.has("inBLR")) setInBLR(p.fields.inBLR);
    if (p.fields.specialReqs && !tf.has("specialReqs")) {
      const val = p.fields.specialReqs.trim();
      const isJunk = /hi\s*team|new\s*lead|gharpayy|currently\s*in|not\s*in\s*(bangalore|blr)/i.test(val);
      if (!isJunk && val.length > 0 && val.length <= 120) setSpecialReqs(val);
    }
    if (p.fields.internalNotes && !tf.has("notes")) {
      const val = p.fields.internalNotes.trim();
      const isJunk = /hi\s*team|new\s*lead|gharpayy|currently\s*in\s*(bangalore|blr)|not\s*in\s*(bangalore|blr)/i.test(val);
      if (!isJunk && val.length > 0 && val.length <= 150) setNotes(val);
    }
    // Re-run quality classification with AI-upgraded data
    if (!tf.has("quality") && p.fields.phone) {
      const autoQ = autoClassifyQuality(
        p.fields.phone,
        p.fields.budget ?? "",
        p.fields.moveIn ?? "",
        p.fields.area ?? "",
        p.fields.type ?? "",
      );
      if (autoQ) setQuality(autoQ);
    }
  };

  const reset = () => {
    setRaw("");
    setParsedOnce(false);
    lastParsedRawRef.current = "";
    aiParsingForRef.current = "";
    touchedFieldsRef.current = new Set();
    setTouchedFields(new Set());
    setLastParsedConfidence(0);
    setAiMissing([]);
    setParsedByAI(false);
    setRawSource("");
    setName(""); setPhone(""); setEmail("");
    setAreasText(""); setFullAddress("");
    setBudget(""); setMoveIn("");
    setType(""); setRoom(""); setNeed(""); setSpecialReqs(""); setNotes("");
    setInBLR(undefined); setQuality(null); setZoneBucket("");
    setAssigneeId(defaultAssigneeId); setStage(STAGES[0]);
    setDuplicateWarning(null);
  };

  // Validation
  const phoneClean = phone.replace(/\D/g, "");
  const phoneValid = /^[6-9]\d{9}$/.test(phoneClean);
  const emailClean = email.trim().toLowerCase();
  const emailValid = !emailClean || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean);

  const validationItems = [
    { key: "name", label: "Name", missing: !name.trim() },
    { key: "phone", label: "Phone", missing: !phoneValid },
    { key: "email", label: "Email", missing: !emailValid },
    { key: "areas", label: "Areas", missing: !areasText.trim() },
    { key: "budget", label: "Budget", missing: !budget.trim() },
    { key: "moveIn", label: "Move-in", missing: !moveIn },
    { key: "moveInFuture", label: "Move-in must be future", missing: Boolean(moveIn && moveIn < todayIso()) },
    { key: "type", label: "Type", missing: !type },
    { key: "room", label: "Room", missing: !room },
    { key: "need", label: "Need", missing: !need },
    { key: "inBLR", label: "In Bangalore?", missing: inBLR === undefined },
    { key: "quality", label: "Lead Quality", missing: !quality },
    { key: "zone", label: "Zone", missing: !zoneBucket },
    { key: "assignee", label: "Assignee", missing: !assigneeId },
    { key: "stage", label: "Stage", missing: !stage },
  ] as const;

  const missingItems = validationItems.filter((i) => i.missing);
  const missingKeys = new Set(missingItems.map((i) => i.key));
  const errors = missingItems.map((i) => i.label);
  const blocking = errors.length > 0;
  const isPending = (key: (typeof validationItems)[number]["key"]) => missingKeys.has(key);

  const invalidCls = (key: (typeof validationItems)[number]["key"]) =>
    cn(isPending(key) && "border-destructive/70 bg-destructive/5");

  const save = async () => {
    if (savingRef.current || blocking) return;
    const areasArr = areasText.split(",").map((a) => a.trim()).filter(Boolean);
    const zoneObj = orgZones.find((z) => z.name === zoneBucket);
    const budgetNum = parseBudgetAmount(budget);

    savingRef.current = true;
    setSaving(true);

    try {
      const dupCheck = await api.leads.checkDuplicate(phoneClean);
      if (dupCheck.exists) {
        setDuplicateWarning(dupCheck);
        return;
      }
    } catch {
      toast.error("Could not check duplicate. Try again.");
      return;
    } finally {
      if (!savingRef.current) setSaving(false);
    }

    try {
      const result = await dispatch({
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
          email: emailClean,
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
          rawSource: rawSource || raw,
          aiConfidence: lastParsedConfidence,
          parsedByAI,
          missingFields: aiMissing,
        },
      });

      if (!result.ok) {
        if ((result as any).data?.duplicate) {
          toast.warning("Lead already exists.");
          reset(); onDone?.(); return;
        }
        toast.error(`Could not save: ${result.error}`);
        return;
      }

      const newLeadId = (result as any).data?.leadId;
      const identityLead = create(
        {
          name: name.trim(), phone: `+91${phoneClean}`, email: emailClean,
          location: areasText.trim(), areas: areasArr, fullAddress: fullAddress.trim(),
          budget: budget.trim(), moveIn, type, room, need,
          specialReqs: [specialReqs, notes].filter(Boolean).join(" · "),
          extraContent: notes.trim(),
          budgets: budget.split(/\s*(?:,|\/|\bor\b)\s*/i).filter(Boolean),
          links: fullAddress.match(/https?:\/\/\S+/g) ?? [],
          inBLR: inBLR === undefined ? null : inBLR,
          zone: detectedZone,
          rawSource: rawSource || raw,
        },
        {
          quality, stage, zoneCategory: zoneBucket,
          assigneeId: selectedAssignee?.id ?? null,
          assigneeName: selectedAssignee?.name ?? null,
        },
      );

      const now = new Date().toISOString();
      addLead({
        id: newLeadId || identityLead.id,
        name: name.trim(), phone: `+91${phoneClean}`, source: "paste",
        budget: budgetNum, budgetText: budget.trim(), moveInDate: moveIn,
        preferredArea: areasArr[0] ?? areasText.trim(),
        assignedTcmId: selectedAssignee?.id ?? "",
        assigneeId: selectedAssignee?.id ?? null,
        createdBy: authUser?.id ?? null, stage: "new",
        intent: (quality === "hot" ? "hot" : quality === "bad" ? "cold" : "warm") as Intent,
        confidence: quality === "hot" ? 90 : quality === "good" ? 70 : 30,
        tags: [], nextFollowUpAt: null, responseSpeedMins: 0,
        createdAt: now, updatedAt: now, email: emailClean,
        areas: areasArr, fullAddress: fullAddress.trim(),
        type, room, need,
        inBLR: inBLR === undefined ? null : inBLR,
        quality: quality || "good",
        specialReqs: specialReqs.trim(), notes: notes.trim(),
        zoneCategory: zoneBucket, stageLabel: stage,
      });

      toast.success(`Lead saved · ${selectedAssignee?.name ?? "Unassigned"}`);
      reset(); onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save lead");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Completion score for progress bar
  const totalFields = validationItems.length;
  const filledFields = totalFields - missingItems.length;
  const completionPct = Math.round((filledFields / totalFields) * 100);

  return (
    <div className="relative flex flex-col min-h-0 h-full gap-0 overflow-hidden lg:flex-row">
      {/* Duplicate warning overlay */}
      {duplicateWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-[320px] p-5 shadow-xl border-destructive/30 text-center space-y-4">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Duplicate Lead</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                This phone number is already in the system.
              </p>
              <div className="mt-3 text-xs bg-muted/50 p-2 rounded-md text-left space-y-1.5 border border-border/50">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner:</span>
                  <strong className="text-foreground">{duplicateWarning.owner || "Unknown"}</strong>
                </div>
                {duplicateWarning.createdAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Added:</span>
                    <span className="font-medium text-foreground">{new Date(duplicateWarning.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                )}
                {duplicateWarning.currentStage && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stage:</span>
                    <span className="font-medium capitalize text-foreground">{duplicateWarning.currentStage.replace(/-/g, ' ')}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setDuplicateWarning(null)}>
                Got it
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── LEFT: Paste box ── */}
      <div className="w-full lg:w-[320px] lg:min-w-[280px] lg:max-w-[340px] flex flex-col border-r border-border bg-muted/10">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Paste lead</h3>
            {parsingAI && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-blue-500 animate-pulse">
                <Zap className="h-3 w-3" /> AI upgrading...
              </span>
            )}
            {!parsingAI && parsedOnce && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-success">
                <CheckCircle2 className="h-3 w-3" />
                {parsedByAI ? "AI parsed" : "Auto-parsed"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Fields fill instantly as you paste
          </p>
        </div>

        <div className="flex-1 flex flex-col gap-2 p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-[11px]"
            onClick={() => setRaw(SAMPLE)}
          >
            <Sparkles className="h-3 w-3 mr-1" /> Load sample
          </Button>
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste WhatsApp message, portal lead, call note..."
            className="flex-1 min-h-[240px] resize-none font-mono text-xs leading-relaxed bg-background"
          />
          {parsedOnce && aiMissing.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">Missing: </span>
              {aiMissing.slice(0, 4).join(", ")}{aiMissing.length > 4 ? "…" : ""}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Review + Save ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Progress bar header */}
        <div className="px-4 py-2.5 border-b border-border bg-background flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                {blocking ? `${errors.length} fields needed` : "Ready to save"}
              </span>
              <span className="text-[11px] font-semibold tabular-nums">{completionPct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  completionPct === 100 ? "bg-success" : completionPct > 60 ? "bg-primary" : "bg-amber-500"
                )}
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={reset} disabled={saving} className="h-7 text-xs">
              Clear
            </Button>
            <Button
              size="sm"
              disabled={blocking || saving}
              onClick={save}
              className="h-7 text-xs min-w-[90px]"
            >
              {saving ? "Saving..." : "Save lead"}
            </Button>
          </div>
        </div>

        {/* Scrollable fields */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">

          {/* Contact row */}
          <FieldGroup label="Contact">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Name *" error={isPending("name")}>
                <Input
                  value={name}
                  onChange={(e) => { touch("name"); setName(e.target.value); }}
                  placeholder="Rahul Sharma"
                  className={cn("h-8 text-xs", invalidCls("name"))}
                />
              </Field>
              <Field label="Phone *" error={isPending("phone")}>
                <Input
                  value={phone}
                  onChange={(e) => { touch("phone"); setPhone(e.target.value); }}
                  onBlur={() => setPhone(phoneClean.slice(-10))}
                  placeholder="98xxxxxxxx"
                  inputMode="tel"
                  className={cn("h-8 text-xs", invalidCls("phone"))}
                />
              </Field>
              <Field label="Email">
                <Input
                  value={email}
                  onChange={(e) => { touch("email"); setEmail(e.target.value); }}
                  placeholder="name@example.com"
                  inputMode="email"
                  className={cn("h-8 text-xs", invalidCls("email"))}
                />
              </Field>
              <Field label="Areas *" error={isPending("areas")}>
                <div className="relative">
                  <Input
                    value={areasText}
                    onChange={(e) => { touch("areasText"); setAreasText(e.target.value); }}
                    placeholder="HSR, BTM, Koramangala"
                    className={cn("h-8 text-xs", invalidCls("areas"))}
                  />
                  {detectedZone && (
                    <Badge variant="secondary" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] h-4">
                      {detectedZone}
                    </Badge>
                  )}
                </div>
              </Field>
            </div>
          </FieldGroup>

          {/* Requirement row */}
          <FieldGroup label="Requirement">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Budget *" error={isPending("budget")}>
                <Input
                  value={budget}
                  onChange={(e) => { touch("budget"); setBudget(e.target.value); }}
                  placeholder="8-12k"
                  className={cn("h-8 text-xs", invalidCls("budget"))}
                />
              </Field>
              <Field label="Move-in *" error={isPending("moveIn")}>
                <Input
                  type="date"
                  min={todayIso()}
                  value={moveIn}
                  onChange={(e) => { touch("moveIn"); setMoveIn(e.target.value); }}
                  className={cn("h-8 text-xs", invalidCls("moveIn"), invalidCls("moveInFuture"))}
                />
              </Field>
              <Field label="Type *" error={isPending("type")}>
                <ChipGroup
                  options={QUICKAD_TYPE_OPTIONS}
                  value={type}
                  onChange={(v) => { touch("type"); setType(v); }}
                  error={isPending("type")}
                  small
                />
              </Field>
            </div>
          </FieldGroup>

          {/* Preferences row */}
          <FieldGroup label="Preferences">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Room *" error={isPending("room")}>
                <ChipGroup
                  options={QUICKAD_ROOM_OPTIONS}
                  value={room}
                  onChange={(v) => { touch("room"); setRoom(v); }}
                  error={isPending("room")}
                  small
                />
              </Field>
              <Field label="Need *" error={isPending("need")}>
                <ChipGroup
                  options={QUICKAD_NEED_OPTIONS}
                  value={need}
                  onChange={(v) => { touch("need"); setNeed(v); }}
                  error={isPending("need")}
                  small
                />
              </Field>
              <Field label="In Bangalore? *" error={isPending("inBLR")}>
                <ChipGroup
                  options={BLR_OPTS.map((o) => o.label)}
                  value={BLR_OPTS.find((o) => o.v === inBLR)?.label ?? ""}
                  onChange={(label) => {
                    touch("inBLR");
                    const opt = BLR_OPTS.find((o) => o.label === label);
                    if (opt !== undefined) setInBLR(opt.v);
                  }}
                  error={isPending("inBLR")}
                  small
                />
              </Field>
            </div>
          </FieldGroup>

          {/* Quality + Routing */}
          <FieldGroup label="Routing">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Lead Quality *" error={isPending("quality")}>
                <div className="flex gap-1">
                  {QUALITY_OPTS.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => { touch("quality"); setQuality(quality === o.v ? null : o.v); }}
                      className={cn(
                        "flex-1 rounded-md border px-1 py-1 text-[10px] font-medium transition-colors",
                        quality === o.v
                          ? o.v === "hot" ? "bg-red-500 text-white border-red-500"
                            : o.v === "good" ? "bg-green-500 text-white border-green-500"
                            : "bg-zinc-500 text-white border-zinc-500"
                          : "bg-background border-border hover:bg-muted"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Zone *" error={isPending("zone")}>
                <Select value={zoneBucket} onValueChange={(v) => { touch("zoneBucket"); setZoneBucket(v); }}>
                  <SelectTrigger className={cn("h-8 w-full text-xs", invalidCls("zone"))}>
                    <SelectValue placeholder="Select zone..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedZones.map((z) => (
                      <SelectItem key={z.id} value={z.name}>{z.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Assign Lead *" error={isPending("assignee")}>
                <Select value={assigneeId} onValueChange={(v) => { touch("assignee"); setAssigneeId(v); }}>
                  <SelectTrigger className={cn("h-8 w-full text-xs", invalidCls("assignee"))}>
                    <SelectValue placeholder={zoneFilteredMembers.length ? "Select member..." : "Select zone first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {zoneFilteredMembers.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Stage">
                <Select value={stage} onValueChange={(v) => setStage(v)}>
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(STAGES).sort().map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>

          {/* Notes — compact, optional */}
          <FieldGroup label="Notes (optional)">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Special requests">
                <Input
                  value={specialReqs}
                  onChange={(e) => { touch("specialReqs"); setSpecialReqs(e.target.value); }}
                  placeholder="Veg, attached washroom..."
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="Internal notes">
                <Input
                  value={notes}
                  onChange={(e) => { touch("notes"); setNotes(e.target.value); }}
                  placeholder="Notes for team..."
                  className="h-8 text-xs"
                />
              </Field>
            </div>
          </FieldGroup>

          {/* Error summary — only show if blocking */}
          {blocking && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              <span className="font-semibold">Still needed: </span>
              {errors.join(", ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-0.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function Field({
  label, children, error,
}: {
  label: string; children: React.ReactNode; error?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <Label className={cn("text-[10px] uppercase tracking-wide text-muted-foreground", error && "text-destructive")}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function ChipGroup({
  options, value, onChange, error, small,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  small?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", error && "ring-1 ring-destructive/40 rounded-md p-0.5")}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(value === o ? "" : o)}
          className={cn(
            "rounded border transition-colors",
            small ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
            value === o
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border hover:bg-muted text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
