import { useState } from "react";
import { useCRM10x } from "@/lib/crm10x/store";
import type {
  DecisionAuthority, FlexibilityScore, Gender, LangPref, LeadSource, RoomTypePref,
} from "@/lib/crm10x/types";
import type { Lead } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CalendarClock, CheckCircle2, ChevronDown, ChevronUp, History } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export function LeadDeepProfile({ lead, defaultOpen = false }: { lead: Lead; defaultOpen?: boolean }) {
  const profile = useCRM10x((s) => s.profiles[lead.id]);
  const upsert = useCRM10x((s) => s.upsertProfile);
  const addShiftingDate = useCRM10x((s) => s.addShiftingDate);
  const [open, setOpen] = useState(defaultOpen);
  const [newShift, setNewShift] = useState("");
  const [shiftReason, setShiftReason] = useState("");

  const f = profile ?? { leadId: lead.id, updatedAt: new Date().toISOString() };
  const history = f.shiftingHistory ?? [];

  const submitShift = () => {
    if (!newShift) { toast.error("Pick a date"); return; }
    addShiftingDate(lead.id, {
      shiftingDate: new Date(newShift).toISOString(),
      reason: shiftReason || undefined,
      loggedBy: lead.assignedTcmId,
    });
    toast.success("Shifting date updated - old entry kept in history");
    setNewShift(""); setShiftReason("");
  };

  const completion = countFilled(f as unknown as Record<string, unknown>) * 10; // out of ~100

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/40"
      >
        <span className="font-semibold flex items-center gap-2">
          Deep profile
          <span className="text-[10px] text-muted-foreground">{completion}% complete</span>
          {completion >= 80 && <CheckCircle2 className="h-3 w-3 text-success" />}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="p-3 space-y-3 border-t border-border">
          <div className="grid grid-cols-2 gap-2">
            <Field label="PG type">
              <OptionPills
                value={f.gender ?? ""}
                options={[
                  { value: "boys-pg", label: "Boys PG" },
                  { value: "girls-pg", label: "Girls PG" },
                  { value: "co-live", label: "Co-live" },
                ]}
                onChange={(v) => upsert({ leadId: lead.id, gender: v as Gender })}
              />
            </Field>
            <Field label="Room">
              <OptionPills
                value={f.roomType ?? ""}
                options={[
                  { value: "single", label: "Single" },
                  { value: "double", label: "Double" },
                  { value: "triple", label: "Triple" },
                  { value: "any", label: "Any" },
                ]}
                onChange={(v) => upsert({ leadId: lead.id, roomType: v as RoomTypePref })}
              />
            </Field>
            <Field label="Source">
              <OptionPills
                value={f.source ?? ""}
                options={[
                  { value: "whatsapp", label: "WhatsApp" },
                  { value: "website", label: "Website" },
                  { value: "referral", label: "Referral" },
                  { value: "indiamart", label: "IndiaMart" },
                  { value: "google", label: "Google" },
                  { value: "walk-in", label: "Walk-in" },
                  { value: "other", label: "Other" },
                ]}
                onChange={(v) => upsert({ leadId: lead.id, source: v as LeadSource })}
              />
            </Field>
            <Field label="Decision-maker">
              <OptionPills
                value={f.decisionMaker ?? ""}
                options={[
                  { value: "self", label: "Self" },
                  { value: "parents", label: "Parents" },
                  { value: "company-hr", label: "Company / HR" },
                ]}
                onChange={(v) => upsert({ leadId: lead.id, decisionMaker: v as DecisionAuthority })}
              />
            </Field>
            <Field label="Location feasibility">
              <OptionPills
                value={f.locationFeasible === undefined ? "" : f.locationFeasible ? "yes" : "no"}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
                onChange={(v) => upsert({ leadId: lead.id, locationFeasible: v === "yes" })}
              />
            </Field>
            <Field label="Flexibility">
              <OptionPills
                value={f.flexibility ? String(f.flexibility) : ""}
                options={[
                  { value: "1", label: "Fixed only" },
                  { value: "2", label: "Can adjust room" },
                  { value: "3", label: "Can adjust area" },
                  { value: "4", label: "Can adjust budget" },
                  { value: "5", label: "Very flexible" },
                ]}
                onChange={(v) => upsert({ leadId: lead.id, flexibility: Number(v) as FlexibilityScore })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Company / college">
              <Input
                className="h-8 text-xs"
                value={f.companyOrCollege ?? ""}
                onChange={(e) => upsert({ leadId: lead.id, companyOrCollege: e.target.value })}
              />
            </Field>
            <Field label="Best time to call">
              <Input
                className="h-8 text-xs"
                placeholder="e.g. after 6 PM"
                value={f.bestCallTime ?? ""}
                onChange={(e) => upsert({ leadId: lead.id, bestCallTime: e.target.value })}
              />
            </Field>
            <Field label="Stated budget (₹)">
              <Input
                type="number" className="h-8 text-xs"
                value={f.budgetStated ?? ""}
                onChange={(e) => upsert({ leadId: lead.id, budgetStated: Number(e.target.value) })}
              />
            </Field>
            <Field label="Max budget (₹)">
              <Input
                type="number" className="h-8 text-xs"
                value={f.budgetMax ?? ""}
                onChange={(e) => upsert({ leadId: lead.id, budgetMax: Number(e.target.value) })}
              />
            </Field>
            <Field label="PGs shortlisted">
              <Input
                type="number" className="h-8 text-xs"
                value={f.shortlistedCount ?? ""}
                onChange={(e) => upsert({ leadId: lead.id, shortlistedCount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Referral name">
              <Input
                className="h-8 text-xs"
                value={f.referralName ?? ""}
                onChange={(e) => upsert({ leadId: lead.id, referralName: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm" variant={f.verifiedBudget ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => { upsert({ leadId: lead.id, verifiedBudget: !f.verifiedBudget }); toast.success("Budget verification updated"); }}
            >
              {f.verifiedBudget ? "✓ Budget verified" : "Mark budget verified"}
            </Button>
            <Button
              size="sm" variant={f.verifiedMoveIn ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => { upsert({ leadId: lead.id, verifiedMoveIn: !f.verifiedMoveIn }); toast.success("Move-in verification updated"); }}
            >
              {f.verifiedMoveIn ? "✓ Move-in verified" : "Mark move-in verified"}
            </Button>
          </div>

          {/* Shifting-date history (versioned, never deletes) */}
          <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                <CalendarClock className="h-3.5 w-3.5 text-accent" />
                Shifting date history
              </div>
              {f.preferredMoveInDate && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  Active: {format(new Date(f.preferredMoveInDate), "MMM d, yyyy")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">New shifting date</Label>
                <Input type="date" className="h-8 text-xs" value={newShift} onChange={(e) => setNewShift(e.target.value)} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Reason</Label>
                <Input className="h-8 text-xs" placeholder="parents wanted next month…" value={shiftReason} onChange={(e) => setShiftReason(e.target.value)} />
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={submitShift}>Update</Button>
            </div>
            {history.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-border">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <History className="h-3 w-3" /> Past entries · Gharpayy never forgets
                </div>
                {history.slice(0, 6).map((h, i) => (
                  <div key={`${h.ts}-${i}`} className="flex items-center justify-between text-[11px]">
                    <span>
                      <span className={i === 0 ? "font-semibold text-foreground" : "text-muted-foreground line-through"}>
                        {format(new Date(h.shiftingDate), "MMM d, yyyy")}
                      </span>
                      {h.reason && <span className="text-muted-foreground"> · {h.reason}</span>}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {format(new Date(h.ts), "MMM d")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function OptionPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-8 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
            value === option.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function countFilled(p: Record<string, unknown>): number {
  const keys = [
    "gender","roomType","source","decisionMaker",
    "locationFeasible","companyOrCollege","budgetStated","verifiedBudget",
    "verifiedMoveIn","flexibility",
  ];
  return keys.filter((k) => {
    const v = p[k];
    return v !== undefined && v !== null && v !== "";
  }).length;
}
