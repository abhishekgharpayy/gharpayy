import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";
import { PGS } from "@/property-genius/data/pgs";
import type { PG } from "@/types/entities";
import { LeadPropertyDossier } from "@/components/impact/LeadPropertyDossier";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api/client";
import { useQuotationsQuery, useSetQuotationStatus, formatINR, type Quotation } from "@/lib/crm10x/quotations";
import { useTcmContacts } from "@/lib/crm10x/tcm-contacts";
import { useLeadInterests, useToggleInterest } from "@/lib/crm10x/lead-interests";
import { useCheckin, useUpsertCheckin, usePatchCheckin, STAGE_LABEL, riskLevel, RISK_CLASS, RISK_LABEL, type CheckIn } from "@/lib/checkins/store";
import type { ActivityLog, Lead, Property, TCM, Tour } from "@/lib/types";
import {
  resolvePropertyById,
  searchPropertyCatalog,
  allCatalogProperties,
  type CatalogProperty,
} from "@/lib/crm10x/property-catalog";
import {
  IMPACT_TEMPLATES, renderImpactTemplate,
  type ImpactScenario, type ImpactTpl, type ImpactTplCtx,
} from "@/lib/crm10x/impact-templates";
import {
  scoreLead, computeNBA, pressureColor, intentChip,
  type NextBestAction,
} from "@/lib/crm10x/impact-scoring";
import { QuotationBuilder } from "@/components/crm10x/QuotationBuilder";
import { SmartDossier } from "@/components/crm10x/SmartDossier";
import { CheckInPanel } from "@/components/checkins/CheckInPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { dispatch } from "@/lib/api/command-bus";
import {
  Calendar, CheckCircle2, ChevronRight, ClipboardCopy,
  ExternalLink, FileText, Flame, LayoutGrid, ListOrdered, Phone, Plus,
  Search, Send, Sparkles, Target, Timer, UserCheck, Wallet, Zap,
  Beaker, Home, Pin, X, Heart, Star, Activity, TrendingUp, Bell, Sunrise,
  RotateCcw, KeyRound, ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { useMountedNow } from "@/hooks/use-now";
import { useAuditLog } from "@/lib/crm10x/audit-log";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { waLink } from "@/lib/crm10x/templates";

/* ================================================================== */
/*  Impact Queue — 10x                                                 */
/*  Priority Stack + Stage Board · Live counters · NBA per card        */
/*  Multi-variant templates · Negotiation playbook · Direct book       */
/* ================================================================== */

function todayISO() {
  const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10);
}
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw.trim();
  if (digits.startsWith("91") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return raw.trim().startsWith("+") ? raw.trim() : `+${digits}`;
}
function phonesMatch(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "").slice(-10);
  const db = b.replace(/\D/g, "").slice(-10);
  return da.length >= 10 && da === db;
}
function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}
function isThisWeek(iso: string) {
  const d = new Date(iso); const n = new Date();
  const diff = (+n - +d) / 86_400_000;
  return diff >= 0 && diff <= 7;
}
function isThisMonth(iso: string) {
  const d = new Date(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}
function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function fmtTime(iso: string) {
  const d = parseInstant(iso);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(d);
}
function fmtWhen(iso: string) {
  const d = parseInstant(iso);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(d);
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = parseInstant(iso);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(d);
}
function fmtRel(iso: string, nowMs: number) {
  const d = parseInstant(iso);
  if (!d) return "—";
  const ms = +d - nowMs;
  const m = Math.round(ms / 60000);
  if (Math.abs(m) < 60) return `${m > 0 ? "in " : ""}${Math.abs(m)}m${m < 0 ? " ago" : ""}`;
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return `${h > 0 ? "in " : ""}${Math.abs(h)}h${h < 0 ? " ago" : ""}`;
  return fmtWhen(iso);
}
function fmtActivityTime(iso: string) {
  const d = parseInstant(iso);
  if (!d) return "—";
  const now = Date.now();
  const diff = now - +d;
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes || 1} min ago`;
  if (d.toDateString() === new Date().toDateString()) return `Today ${fmtTime(iso)}`;
  return fmtWhen(iso);
}

async function copyText(text: string, label = "Copied — paste in WhatsApp") {
  try {
    await navigator.clipboard?.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Copy failed");
  }
}

function openWhatsApp(phone: string, text: string) {
  window.open(waLink(phone, text), "_blank", "noopener,noreferrer");
  toast.success("Opened WhatsApp");
}

const actionButtonClass =
  "transition-colors hover:bg-accent/10 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function isValidPhone(v: string) {
  return /^\d{10}$/.test(v.trim());
}

function parsePastedText(text: string): { name?: string; phone?: string; location?: string } {
  const phone = text.match(/\b[6-9]\d{9}\b/)?.[0];
  const words = text.replace(phone ?? "", "").trim().split(/\s+/);
  const locationKeywords = [
    "koramangala","bellandur","hsr","whitefield","indiranagar",
    "marathahalli","btm","hebbal","electronic city","jayanagar",
    "jp nagar","yelahanka","sarjapur","bannerghatta"
  ];
  const location = words.find(w =>
    locationKeywords.some(k => w.toLowerCase().includes(k))
  );
  const name = words
    .filter(w => w !== location && !/\d/.test(w))
    .slice(0, 2)
    .join(" ");
  return {
    name: name || undefined,
    phone: phone || undefined,
    location: location || undefined,
  };
}

type IntentFilter = "all" | "hot" | "warm" | "cold";
type ViewMode = "stack" | "board";
type ColumnKey = "inbox" | "scheduled" | "onTour" | "quoted" | "booked";
const COLUMNS: { key: ColumnKey; label: string; tint: string; icon: typeof Sparkles }[] = [
  { key: "inbox",     label: "Inbox",          tint: "border-l-info",    icon: Sparkles },
  { key: "scheduled", label: "Tour scheduled", tint: "border-l-accent",  icon: Calendar },
  { key: "onTour",    label: "On tour today",  tint: "border-l-warning", icon: UserCheck },
  { key: "quoted",    label: "Quote sent",     tint: "border-l-primary", icon: FileText },
  { key: "booked",    label: "Booked",         tint: "border-l-success", icon: CheckCircle2 },
];

/* ------------------------------------------------------------------ */

export function ImpactQueue() {
  const { role, currentTcmId, tcms, leads, tours, properties, bookings } = useApp();
  const { data: quotes = [] } = useQuotationsQuery();

  const [tcmFilter, setTcmFilter] = useState<string>(role === "tcm" ? currentTcmId : "all");
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<IntentFilter>("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyTourToday, setOnlyTourToday] = useState(false);
  const [onlyQuotePending, setOnlyQuotePending] = useState(false);
  const [view, setView] = useState<ViewMode>("board");
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);

  /* --------- 10x live tick: re-rank every 60s --------- */
  // Start at 0 on SSR + first client render to avoid hydration mismatches.
  const [tick, setTick] = useState(0);
  const [lastRerank, setLastRerank] = useState<number>(0);
  useEffect(() => {
    setLastRerank(Date.now());
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setLastRerank(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  /* --------- per-lead enrichment (NBA + score) --------- */
  type Enriched = {
    lead: Lead;
    openTour?: Tour;
    lastQuote?: Quotation;
    nba: NextBestAction;
    score: number;
    column: ColumnKey;
  };

  const enriched: Enriched[] = useMemo(() => {
    const tFilter = (lead: Lead) =>
      (tcmFilter === "all" || lead.assignedTcmId === tcmFilter) &&
      (intent === "all" || lead.intent === intent) &&
      (!query.trim() ||
        lead.name.toLowerCase().includes(query.toLowerCase()) ||
        lead.phone.includes(query));

    return leads.filter(tFilter).map((lead) => {
      const ts = tours
        .filter((t) => t.leadId === lead.id)
        .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
      const openTour = ts.find((t) => t.status === "scheduled");
      const lastQuote = quotes
        .filter((q) => q.leadId === lead.id)
        .sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt))[0];

      let column: ColumnKey = "inbox";
      if (lead.stage === "booked") column = "booked";
      else if (lead.stage === "quote-sent") column = "quoted";
      else if (lastQuote && (lastQuote.status === "sent" || lastQuote.status === "paid")) column = "quoted";
      else if (lead.stage === "on-tour") column = "onTour";
      else if (openTour && isToday(openTour.scheduledAt)) column = "onTour";
      else if (openTour) column = "scheduled";

      const nba = computeNBA(lead, openTour, lastQuote);
      const { score } = scoreLead(lead, openTour, lastQuote);
      return { lead, openTour, lastQuote, nba, score, column };
    });
  }, [leads, tours, quotes, tcmFilter, query, intent]);

  /* --------- filter chips --------- */
  const filtered = useMemo(() => {
    return enriched.filter((e) => {
      if (onlyOverdue && e.nba.pressure !== "escalate") return false;
      if (onlyTourToday && !(e.openTour && isToday(e.openTour.scheduledAt))) return false;
      if (onlyQuotePending && !(e.lastQuote?.status === "sent")) return false;
      // Hide closed deals unless filtering by booked column
      if (e.lead.stage === "dropped") return false;
      return true;
    });
  }, [enriched, onlyOverdue, onlyTourToday, onlyQuotePending]);

  const stackSorted = useMemo(
    () => [...filtered].sort((a, b) => b.score - a.score),
    [filtered],
  );

  const boardBuckets = useMemo(() => {
    const b: Record<ColumnKey, Enriched[]> = {
      inbox: [], scheduled: [], onTour: [], quoted: [], booked: [],
    };
    filtered.forEach((e) => b[e.column].push(e));
    Object.keys(b).forEach((k) => {
      b[k as ColumnKey].sort((a, b) => b.score - a.score);
    });
    return b;
  }, [filtered]);

  /* --------- live counters --------- */
  const counters = useMemo(() => {
    const scopedTours = tcmFilter === "all" ? tours : tours.filter((t) => t.tcmId === tcmFilter);
    const scopedQuotes = tcmFilter === "all" ? quotes : quotes.filter((q) => q.tcmId === tcmFilter);
    const scopedBookings = tcmFilter === "all" ? bookings : bookings.filter((b) => b.tcmId === tcmFilter);
    const toursToday = scopedTours.filter((t) => isToday(t.scheduledAt) && t.status === "scheduled").length;
    const quotesWeek = scopedQuotes.filter((q) => isThisWeek(q.sentAt)).length;
    const bookingsMonth = scopedBookings.filter((b) => isThisMonth(b.ts)).length;
    return { toursToday, quotesWeek, bookingsMonth };
  }, [tours, quotes, bookings, tcmFilter]);

  const quotesThisWeek = useMemo(() => {
    const scoped = tcmFilter === "all" ? quotes : quotes.filter((q) => q.tcmId === tcmFilter);
    return scoped
      .filter((q) => isThisWeek(q.sentAt))
      .sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt));
  }, [quotes, tcmFilter]);

  // Visible targets — tweak as the BBD target evolves.
  const targets = { toursToday: 4, quotesWeek: 10, bookingsMonth: 6 };
  const tone = (got: number, target: number) =>
    got >= target ? "text-success border-success/30 bg-success/10"
    : got >= target * 0.5 ? "text-warning border-warning/30 bg-warning/10"
    : "text-danger border-danger/30 bg-danger/10";

  const escalations = stackSorted.filter((e) => e.nba.pressure === "escalate").length;

  return (
    <div className="space-y-3">
      {/* ---------------- 10x Command Bar ---------------- */}
      <TenXCommandBar
        lastRerank={lastRerank}
        escalations={escalations}
        counters={counters}
        targets={targets}
        stackSorted={stackSorted}
        tick={tick}
        onFocusLead={(leadId, name) => {
          setQuery(name);
          setFocusLeadId(leadId);
        }}
      />

      {/* ---------------- Header ---------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-semibold">
            Conversion engine · one screen
          </div>
          <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
            Impact Queue
            {escalations > 0 && (
              <Badge variant="outline" className="text-[10px] bg-danger/10 text-danger border-danger/40 gap-1">
                <Zap className="h-3 w-3" /> {escalations} escalating
              </Badge>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            Work top-down. Every lead has a Next Best Action. Nothing falls through.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QuickAddLead defaultTcmId={tcmFilter !== "all" ? tcmFilter : currentTcmId} />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 pl-7 text-xs w-52"
              placeholder="Search lead or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={tcmFilter} onValueChange={setTcmFilter}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All TCMs</SelectItem>
              {tcms.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              className={`h-8 px-2 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 ${view === "stack" ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`}
              onClick={() => setView("stack")}>
              <ListOrdered className="h-3 w-3" /> Stack
            </button>
            <button
              className={`h-8 px-2 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 ${view === "board" ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`}
              onClick={() => setView("board")}>
              <LayoutGrid className="h-3 w-3" /> Board
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- Live counters ---------------- */}
      <div className="grid grid-cols-3 gap-2">
        <Counter label="Tours today" got={counters.toursToday} target={targets.toursToday} tone={tone(counters.toursToday, targets.toursToday)} icon={Calendar} />
        <QuotesWeekCounter
          quotes={quotesThisWeek}
          leads={leads}
          got={counters.quotesWeek}
          target={targets.quotesWeek}
          tone={tone(counters.quotesWeek, targets.quotesWeek)}
          onFocusLead={(name) => setQuery(name)}
        />
        <Counter label="Bookings this month" got={counters.bookingsMonth} target={targets.bookingsMonth} tone={tone(counters.bookingsMonth, targets.bookingsMonth)} icon={Target} />
      </div>

      {/* ---------------- Today's Focus Inventory + Message Lab ---------------- */}
      <FocusInventoryStrip tcmFilter={tcmFilter} />

      {/* ---------------- Filter chips ---------------- */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <Chip active={intent === "all"} onClick={() => setIntent("all")}>All</Chip>
        <Chip active={intent === "hot"} onClick={() => setIntent("hot")} tone="danger"><Flame className="h-3 w-3" /> Hot</Chip>
        <Chip active={intent === "warm"} onClick={() => setIntent("warm")} tone="warning">Warm</Chip>
        <Chip active={intent === "cold"} onClick={() => setIntent("cold")}>Cold</Chip>
        <span className="text-muted-foreground/40">·</span>
        <Chip active={onlyOverdue} onClick={() => setOnlyOverdue((v) => !v)} tone="danger">
          Overdue only
        </Chip>
        <Chip active={onlyTourToday} onClick={() => setOnlyTourToday((v) => !v)} tone="warning">
          Tour today
        </Chip>
        <Chip active={onlyQuotePending} onClick={() => setOnlyQuotePending((v) => !v)}>
          Quote pending
        </Chip>
        <MessageLabButton tcms={tcms} />
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""} in queue
        </span>
      </div>

      {/* ---------------- View ---------------- */}
      {view === "stack" ? (
        <div className="space-y-2">
          {stackSorted.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-10 text-center text-xs text-muted-foreground">
              Queue clear. Add a lead or relax 🌱
            </div>
          )}
          {stackSorted.map((e, i) => (
            <LeadRow key={e.lead.id} rank={i + 1} enriched={e} tcms={tcms} properties={properties} />
          ))}
        </div>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <div className="grid grid-cols-5 gap-2 h-[calc(100vh-360px)] min-h-[360px] min-w-[720px]">
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                className={`min-w-0 h-full overflow-y-auto overflow-x-hidden rounded-lg border-l-2 ${c.tint} border-t border-r border-b border-border bg-muted/20 p-2`}
              >
              <div className="sticky top-0 z-10 flex items-center justify-between px-1 pb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="text-[11px] font-semibold flex items-center gap-1.5">
                  <c.icon className="h-3 w-3" /> {c.label}
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {boardBuckets[c.key].length}
                </span>
              </div>
              <div className="space-y-2">
                {boardBuckets[c.key].length === 0 && (
                  <div className="text-[11px] italic text-muted-foreground px-2 py-6 text-center">
                    Nothing here.
                  </div>
                )}
                {boardBuckets[c.key].map((e) => (
                  <LeadRow
                    key={e.lead.id}
                    enriched={e}
                    tcms={tcms}
                    properties={properties}
                    compact
                    autoOpen={focusLeadId === e.lead.id}
                    onAutoOpenConsumed={() => setFocusLeadId(null)}
                  />
                ))}
              </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Atoms                                                              */
/* ================================================================== */

function Counter({
  label, got, target, tone, icon: Icon,
}: { label: string; got: number; target: number; tone: string; icon: typeof Calendar }) {
  const pct = Math.min(100, Math.round((got / Math.max(target, 1)) * 100));
  return (
    <div className={`rounded-lg border ${tone} p-3`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <span className="text-[10px] font-mono opacity-80">{got}/{target}</span>
      </div>
      <div className="text-2xl font-display font-semibold mt-1">{got}</div>
      <div className="h-1 rounded-full bg-background/40 mt-1 overflow-hidden">
        <div className="h-full bg-current opacity-70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const QUOTE_STATUS_TONE: Record<Quotation["status"], string> = {
  sent: "bg-accent/15 text-accent border-accent/30",
  paid: "bg-success/15 text-success border-success/30",
  "not-paid": "bg-destructive/15 text-destructive border-destructive/30",
  expired: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function QuotesWeekCounter({
  quotes,
  leads,
  got,
  target,
  tone,
  onFocusLead,
}: {
  quotes: Quotation[];
  leads: Lead[];
  got: number;
  target: number;
  tone: string;
  onFocusLead: (leadName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.min(100, Math.round((got / Math.max(target, 1)) * 100));
  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-lg border ${tone} p-3 text-left transition hover:ring-2 hover:ring-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <FileText className="h-3 w-3" /> Quotes this week
          </div>
          <span className="text-[10px] font-mono opacity-80">{got}/{target}</span>
        </div>
        <div className="text-2xl font-display font-semibold mt-1">{got}</div>
        <div className="h-1 rounded-full bg-background/40 mt-1 overflow-hidden">
          <div className="h-full bg-current opacity-70" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[10px] text-muted-foreground mt-1.5">Tap to view all quotes →</div>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm">Quotes this week</SheetTitle>
            <SheetDescription className="text-xs">
              {got} quotation{got !== 1 ? "s" : ""} sent in the last 7 days
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {quotes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">No quotes sent this week yet.</p>
            ) : (
              quotes.map((q) => {
                const lead = leadById.get(q.leadId);
                const expired = q.status === "sent" && (parseInstant(q.validUntilISO)?.getTime() ?? Infinity) < Date.now();
                const status = expired ? "expired" : q.status;
                return (
                  <div key={q.id} className="rounded-lg border border-border p-3 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{lead?.name ?? "Unknown lead"}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{q.propertyName} · {q.roomType}</div>
                      </div>
                      <Badge variant="outline" className={`text-[9px] shrink-0 ${QUOTE_STATUS_TONE[status]}`}>
                        {status}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatINR(q.discountedPrice)}
                      <span className="line-through ml-1">{formatINR(q.actualRent)}</span>
                      {" · "}
                      {fmtDate(q.sentAt)}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {lead && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px]"
                          onClick={() => {
                            onFocusLead(lead.name);
                            setOpen(false);
                            toast.success(`Filtered to ${lead.name}`);
                          }}
                        >
                          Find lead
                        </Button>
                      )}
                      {lead?.phone && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] gap-1"
                          onClick={() => {
                            window.open(waLink(lead.phone, q.message), "_blank", "noopener,noreferrer");
                            toast.success("Opened WhatsApp");
                          }}
                        >
                          <ExternalLink className="h-3 w-3" /> Resend
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => void navigator.clipboard.writeText(q.message).then(() => toast.success("Copied"))}
                      >
                        <ClipboardCopy className="h-3 w-3" /> Copy
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Chip({
  active, onClick, children, tone = "default",
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
  tone?: "default" | "danger" | "warning";
}) {
  const base = "h-6 px-2 rounded-full text-[10px] uppercase tracking-wider font-semibold border flex items-center gap-1 transition";
  const activeStyle =
    tone === "danger" ? "bg-danger text-danger-foreground border-danger" :
    tone === "warning" ? "bg-warning text-warning-foreground border-warning" :
    "bg-foreground text-background border-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? activeStyle : "bg-card text-muted-foreground border-border hover:border-foreground/40"}`}>
      {children}
    </button>
  );
}

/* ================================================================== */
/*  Lead row — collapses to summary, expands to Command Mode           */
/* ================================================================== */

type EnrichedLite = {
  lead: Lead; openTour?: Tour; lastQuote?: Quotation;
  nba: NextBestAction; score: number; column: ColumnKey;
};

function LeadRow({
  enriched, rank, tcms, properties, compact, autoOpen, onAutoOpenConsumed,
}: {
  enriched: EnrichedLite; rank?: number; tcms: TCM[]; properties: Property[]; compact?: boolean;
  autoOpen?: boolean; onAutoOpenConsumed?: () => void;
}) {
  const { lead, openTour, lastQuote, nba, column } = enriched;
  const [open, setOpen] = useState(false);
  const tcm = tcms.find((t) => t.id === lead.assignedTcmId);
  const catalogProperty = openTour
    ? resolvePropertyById(openTour.propertyId, properties)
    : undefined;
  const colMeta = COLUMNS.find((c) => c.key === column)!;

  useEffect(() => {
    if (autoOpen) {
      setOpen(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpen, onAutoOpenConsumed]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full text-left rounded-md border bg-card hover:border-accent/60 hover:bg-muted/30 transition-colors px-3 py-2 flex items-center gap-3 group ${compact ? "" : ""}`}>
        {rank !== undefined && (
          <div className="w-7 h-7 rounded-md bg-muted text-[11px] font-mono font-semibold flex items-center justify-center shrink-0 group-hover:bg-accent/20">
            #{rank}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold truncate">{lead.name}</span>
            <Badge variant="outline" className={`text-[9px] uppercase ${intentChip(lead.intent)}`}>{lead.intent}</Badge>
            {!compact && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <colMeta.icon className="h-2.5 w-2.5" /> {colMeta.label}
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <Phone className="h-2.5 w-2.5" /> {lead.phone}
            <span>·</span><span>{lead.preferredArea}</span>
            {!compact && <><span>·</span><span>{formatINR(lead.budget)}</span></>}
            {tcm && !compact && <><span>·</span><span>{tcm.name.split(" ")[0]}</span></>}
          </div>
          {/* NBA chip — always visible so users see the next move at a glance */}
          <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${pressureColor(nba.pressure)}`}>
            <Sparkles className="h-2.5 w-2.5" /> {nba.label}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-accent" />
      </button>
      <LeadDrawer
        open={open}
        onOpenChange={setOpen}
        enriched={enriched}
        tcm={tcm}
        catalogProperty={catalogProperty}
        opsProperties={properties}
      />
    </>
  );
}

/* ================================================================== */
/*  Lead Drawer — every action for one lead lives here                 */
/* ================================================================== */

const InterestedPropertiesPicker = LeadInterestedPropertiesPicker;

function LeadInterestedPropertiesPicker({ lead }: { lead: Lead }) {
  const properties = useApp((s) => s.properties);
  const { data: interests = [] } = useLeadInterests(lead.id);
  const { mutate: toggleInterest } = useToggleInterest();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const liked = interests
    .map((id) => resolvePropertyById(id, properties))
    .filter(Boolean) as CatalogProperty[];

  const list = useMemo(
    () => searchPropertyCatalog(query, properties, { preferredArea: lead.preferredArea, limit: 16 }),
    [properties, query, lead.preferredArea],
  );

  const sortedList = useMemo(
    () =>
      [...list].sort((a, b) => {
        const af = interests.includes(a.id) ? 0 : 1;
        const bf = interests.includes(b.id) ? 0 : 1;
        if (af !== bf) return af - bf;
        return (b.vacantBeds ?? 1) - (a.vacantBeds ?? 1);
      }),
    [list, interests],
  );

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-card via-card to-accent/5 p-3 space-y-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-danger" />
          <span className="text-[11px] uppercase tracking-wider font-semibold">
            Interested properties
          </span>
          <span className="text-[10px] text-muted-foreground">
            · pin 2–3 the lead is leaning toward
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] gap-1"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="h-3 w-3" /> {open ? "Close" : "Add"}
        </Button>
      </div>

      {liked.length === 0 && !open && (
        <p className="text-[11px] text-muted-foreground italic">
          No favourites yet — tap <span className="font-semibold">Add</span> to pin the rooms they liked.
        </p>
      )}

      {liked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {liked.map((p, i) => (
            <div
              key={p.id}
              className="group text-[10px] rounded-md border border-accent/40 bg-accent/10 px-2 py-1 flex items-center gap-1.5"
            >
              <Star className="h-3 w-3 text-accent" />
              <span className="font-semibold">#{i + 1} {p.name}</span>
              <span className="text-muted-foreground">· {p.area} · {formatINR(p.pricePerBed)}</span>
              {p.source === "hub" && (
                <Badge variant="outline" className="text-[8px]">Hub</Badge>
              )}
              {p.vacantBeds !== undefined && (
                <Badge
                  variant="outline"
                  className={`text-[9px] ${
                    p.vacantBeds > 0
                      ? "bg-success/10 text-success border-success/40"
                      : "bg-danger/10 text-danger border-danger/40"
                  }`}
                >
                  {p.vacantBeds}/{p.totalBeds ?? "—"}
                </Badge>
              )}
              <button
                type="button"
                onClick={() => toggleInterest({ leadId: lead.id, propertyId: p.id })}
                className="opacity-40 hover:opacity-100 hover:text-danger"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-1.5 pt-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              className="h-7 pl-7 text-xs"
              placeholder="Search property…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-44 overflow-y-auto space-y-1 rounded-md border border-border p-1">
            {sortedList.map((p) => {
              const on = interests.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleInterest({ leadId: lead.id, propertyId: p.id })}
                  className={`w-full text-left text-[11px] px-2 py-1 rounded border flex items-center gap-2 transition ${
                    on
                      ? "bg-accent/10 border-accent/50"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      on ? "bg-accent border-accent text-accent-foreground" : "border-border"
                    }`}
                  >
                    {on && <Heart className="h-2 w-2" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {p.area} · {formatINR(p.pricePerBed)}/bed
                      {p.source === "hub" ? " · Property Hub" : ""}
                    </div>
                  </div>
                  {p.vacantBeds !== undefined && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] ${
                        p.vacantBeds > 0
                          ? "bg-success/10 text-success border-success/40"
                          : "bg-danger/10 text-danger border-danger/40"
                      }`}
                    >
                      {p.vacantBeds}/{p.totalBeds ?? "—"}
                    </Badge>
                  )}
                </button>
              );
            })}
            {sortedList.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                No matches.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadDrawer({
  open, onOpenChange, enriched, tcm, catalogProperty, opsProperties,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enriched: EnrichedLite;
  tcm?: TCM;
  catalogProperty?: CatalogProperty;
  opsProperties: Property[];
}) {
  const { lead, openTour, lastQuote, nba, column } = enriched;
  const colMeta = COLUMNS.find((c) => c.key === column)!;
  const [now, mounted] = useMountedNow(30_000);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulePrefill, setSchedulePrefill] = useState<PG | null>(null);

  const handlePickPg = (pg: PG) => {
    setSchedulePrefill(pg);
    setScheduleOpen(true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden bg-gradient-to-b from-card via-card to-background"
      >
        {/* Glossy header */}
        <SheetHeader className="relative px-5 pt-5 pb-3 border-b border-border space-y-2 bg-gradient-to-br from-accent/10 via-card to-primary/5 backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle className="text-base font-display">{lead.name}</SheetTitle>
            <Badge variant="outline" className={`text-[9px] uppercase ${intentChip(lead.intent)}`}>{lead.intent}</Badge>
            <Badge variant="outline" className="text-[9px] uppercase gap-1">
              <colMeta.icon className="h-2.5 w-2.5" /> {colMeta.label}
            </Badge>
          </div>
          <SheetDescription className="text-[11px] flex items-center gap-1 flex-wrap">
            <Phone className="h-3 w-3" /> {lead.phone}
            <span>·</span><span>{lead.preferredArea}</span>
            <span>·</span><span>{formatINR(lead.budget)}</span>
            {tcm && <><span>·</span><span>TCM: {tcm.name}</span></>}
          </SheetDescription>

          {/* NBA banner */}
          <div className={`rounded-md border px-3 py-2 ${pressureColor(nba.pressure)}`}>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Next best action</div>
            <div className="text-sm font-semibold">{nba.label}</div>
            <div className="text-[10px] opacity-80">{nba.reason}</div>
          </div>

          {/* Context badges */}
          {(openTour || lastQuote) && (
            <div className="flex flex-wrap gap-1.5">
              {openTour && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Calendar className="h-3 w-3" />
                  {catalogProperty?.name ?? "Property"} · {fmtTime(openTour.scheduledAt)} ({mounted ? fmtRel(openTour.scheduledAt, now) : "—"})
                </Badge>
              )}
              {lastQuote && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <FileText className="h-3 w-3" />
                  {formatINR(lastQuote.discountedPrice)} · {lastQuote.propertyName} · {lastQuote.status}
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>

        {/* Body — scrollable, all actions in one place */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 space-y-3">
            <SmartDossier lead={lead} />
            <LeadPropertyDossier lead={lead} onPickPg={handlePickPg} />
          </div>
          <CommandActions
            lead={lead}
            tcm={tcm}
            openTour={openTour}
            lastQuote={lastQuote}
            catalogProperty={catalogProperty}
            opsProperties={opsProperties}
            column={column}
            scheduleOpen={scheduleOpen}
            schedulePrefill={schedulePrefill}
            onScheduleOpenChange={setScheduleOpen}
            onSchedulePrefillClear={() => setSchedulePrefill(null)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ================================================================== */
/*  Command Actions — the full toolbelt for a single lead              */
/* ================================================================== */

function CommandActions({
  lead, tcm, openTour, lastQuote, catalogProperty, opsProperties, column,
  scheduleOpen, schedulePrefill, onScheduleOpenChange, onSchedulePrefillClear,
}: {
  lead: Lead; tcm?: TCM; openTour?: Tour; lastQuote?: Quotation;
  catalogProperty?: CatalogProperty; opsProperties: Property[];
  column: ColumnKey;
  scheduleOpen?: boolean;
  schedulePrefill?: PG | null;
  onScheduleOpenChange?: (v: boolean) => void;
  onSchedulePrefillClear?: () => void;
}) {
  const completeTour = useApp((s) => s.completeTour);
  const markTourStarted = useApp((s) => s.markTourStarted);
  const setQuotationStatus = useSetQuotationStatus();
  const setLeadIntent = useApp((s) => s.setLeadIntent);
  const setLeadStage = useApp((s) => s.setLeadStage);
  const logCall = useApp((s) => s.logCall);
  const activities = useApp((s) => s.activities);
  const currentUser = useIdentityStore((s) => s.currentUser);
  const auditLog = useAuditLog((s) => s.log);
  const { data: checkin } = useCheckin(lead.id);
  const [now, mounted] = useMountedNow(30_000);
  const [loggingCall, setLoggingCall] = useState(false);

  const tcmPhone = useTcmContacts((s) => s.phones[tcm?.id ?? ""]);

  const updateIntent = async (intent: Lead["intent"]) => {
    const previous = lead.intent;
    setLeadIntent(lead.id, intent);
    try {
      await api.command({
        _id: `cmd-${crypto.randomUUID()}`,
        type: "cmd.lead.update",
        issuedAt: new Date().toISOString(),
        payload: { leadId: lead.id, patch: { intent } },
      });
      toast.success(`Intent → ${intent}`);
    } catch (error) {
      setLeadIntent(lead.id, previous);
      toast.error(error instanceof Error ? error.message : "Intent update failed");
    }
  };

  const dropLead = async () => {
    try {
      await setLeadStage(lead.id, "dropped");
      toast("Lead dropped");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Drop failed");
    }
  };

  const logCallAction = async () => {
    const at = new Date().toISOString();
    setLoggingCall(true);
    logCall(lead.id);
    auditLog({
      actorId: currentUser.id,
      actorName: currentUser.name,
      entityType: "lead",
      entityId: lead.id,
      action: "call_logged",
      summary: `Call logged by ${currentUser.name}`,
      after: { type: "call_logged", leadId: lead.id, actorId: currentUser.id, actorName: currentUser.name, at, meta: { callType: "manual" } },
    });
    try {
      await api.command({
        _id: `cmd-${crypto.randomUUID()}`,
        type: "cmd.activity.log",
        issuedAt: new Date().toISOString(),
        payload: {
          entityType: "lead",
          entityId: lead.id,
          kind: "call",
          subject: "Call logged",
          body: "Call logged from Impact Queue",
          direction: "outbound",
          outcome: "neutral",
          meta: { source: "impact_queue" },
        },
      });
      toast.success("Call logged");
    } catch (error) {
      toast.error("Failed to log call");
    } finally {
      setLoggingCall(false);
    }
  };

  const baseCtx: ImpactTplCtx = useMemo(() => ({
    leadName: lead.name.split(" ")[0],
    agentName: tcm?.name,
    agentPhone: tcmPhone,
    propertyName: catalogProperty?.name ?? lastQuote?.propertyName,
    propertyAddress: catalogProperty?.area,
    tourWhen: openTour ? fmtWhen(openTour.scheduledAt) : undefined,
    roomType: lastQuote?.roomType,
    price: lastQuote?.discountedPrice,
    altPrice: lastQuote ? Math.max(0, lastQuote.discountedPrice - 1500) : undefined,
    area: lead.preferredArea,
    budget: lead.budget,
    moveIn: fmtDate(lead.moveInDate),
  }), [lead, tcm, tcmPhone, catalogProperty, lastQuote, openTour]);

  /* primary scenario picker (changes with state) */
  const primaryScenario: ImpactScenario = useMemo(() => {
    if (lastQuote?.status === "paid") return "booking-confirm";
    if (lastQuote?.status === "sent") return "quote-followup";
    if (lead.stage === "negotiation") return "negotiate-hold";
    if (openTour) {
      if (!mounted) return "tour-confirm";
      const mins = (+new Date(openTour.scheduledAt) - now) / 60000;
      if (mins < -30) return "quote-followup";
      if (mins < 60 * 4) return "tour-reminder";
      return "tour-confirm";
    }
    if (lead.stage === "dropped") return "revival";
    return "first-touch";
  }, [lead.stage, lastQuote, openTour, mounted, now]);

  return (
    <div className="space-y-3">
      {/* Interested properties — what the lead is leaning toward */}
      <InterestedPropertiesPicker lead={lead} />

      {/* Action toolbar — context-aware */}
      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
        {(column === "inbox" || scheduleOpen) && (
          <ScheduleTourDialog
            lead={lead}
            open={scheduleOpen}
            onOpenChange={(v) => {
              onScheduleOpenChange?.(v);
              if (!v) onSchedulePrefillClear?.();
            }}
            prefillPg={schedulePrefill}
            showTrigger={column === "inbox"}
          />
        )}

        {column === "scheduled" && openTour && (
          <>
            <ConfirmTourButton lead={lead} tour={openTour} />
            <Button size="sm" variant="outline" className={`h-7 text-[10px] gap-1 ${actionButtonClass}`}
              onClick={() => { void markTourStarted(openTour.id).then(() => toast.success("Tour marked live")).catch(() => toast.error("Failed to start tour")); }}>
              <UserCheck className="h-3 w-3" /> Mark started
            </Button>
          </>
        )}

        {column === "onTour" && openTour && (
          <>
            <Button size="sm" variant="outline" className={`h-7 text-[10px] gap-1 ${actionButtonClass}`}
              onClick={() => {
                void completeTour(openTour.id)
                  .then(() => toast.success("Tour completed"))
                  .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to complete tour"));
              }}>
              <CheckCircle2 className="h-3 w-3" /> Tour done
            </Button>
          </>
        )}

        {column === "quoted" && lastQuote && (
          <>
            {lastQuote.status === "sent" && (
              <>
                <Button size="sm" className={`h-7 text-[10px] gap-1 ${actionButtonClass}`}
                  onClick={() => { setQuotationStatus.mutate({ id: lastQuote.id, leadId: lastQuote.leadId, status: "paid" }); toast.success("Quote accepted · paid"); }}>
                  <Wallet className="h-3 w-3" /> Mark paid
                </Button>
                <Button size="sm" variant="outline" className={`h-7 text-[10px] ${actionButtonClass}`}
                  onClick={() => { setQuotationStatus.mutate({ id: lastQuote.id, leadId: lastQuote.leadId, status: "not-paid" }); toast("Marked not paid"); }}>
                  Not paid
                </Button>
              </>
            )}
            <BookingDialog lead={lead} quote={lastQuote} openTour={openTour} />
          </>
        )}

        {column === "booked" && (
          <div className="text-[10px] text-success font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Closed
          </div>
        )}

        {/* Always-available — Quote sits next to Negotiate so the pair is one motion */}
        <NegotiationPlaybook lead={lead} leadPhone={lead.phone} ctx={baseCtx} />
        <QuotationDialog lead={lead} label={lastQuote ? "Re-quote" : "Quotation"} />
        <Button size="sm" variant="ghost" className={`h-7 text-[10px] gap-1 ${actionButtonClass}`}
          onClick={() => void logCallAction()} disabled={loggingCall}>
          {loggingCall ? <RotateCcw className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />} Log call
        </Button>
        <DirectBookButton lead={lead} openTour={openTour} opsProperties={opsProperties} />
        <CheckInOpsButton lead={lead} catalogProperty={catalogProperty} quote={lastQuote} existing={checkin} />
      </div>

      {checkin && <CheckInAuditReport checkin={checkin} lead={lead} compact />}
      <LeadActivityTimeline activities={activities.filter((a) => a.leadId === lead.id)} tcms={useApp.getState().tcms} />

      {/* Tier override */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        Override intent:
        {(["hot", "warm", "cold"] as const).map((t) => (
          <button key={t}
            onClick={() => void updateIntent(t)}
            className={`px-2 py-0.5 rounded-full border uppercase tracking-wider ${lead.intent === t ? intentChip(t) : "border-border"}`}>
            {t}
          </button>
        ))}
        <span className="mx-1">·</span>
        {lead.stage !== "dropped" && (
          <button onClick={() => void dropLead()}
            className="px-2 py-0.5 rounded-full border border-border hover:text-danger">
            Drop
          </button>
        )}
      </div>

      {/* Template messenger */}
      <TemplateMessenger
        leadPhone={lead.phone}
        initialScenario={primaryScenario}
        ctx={baseCtx}
      />
    </div>
  );
}

/* ================================================================== */
/*  Template Messenger — 3+ variants per scenario, copy + send         */
/* ================================================================== */

function TemplateMessenger({
  leadPhone, initialScenario, ctx,
}: {
  leadPhone: string; initialScenario: ImpactScenario; ctx: ImpactTplCtx;
}) {
  const [scenario, setScenario] = useState<ImpactScenario>(initialScenario);
  const variants = IMPACT_TEMPLATES[scenario];
  const [tplId, setTplId] = useState<string>(variants[0].id);
  const tpl = variants.find((v) => v.id === tplId) ?? variants[0];
  const [draft, setDraft] = useState(renderImpactTemplate(tpl, ctx));
  const [copied, setCopied] = useState(false);

  // re-render when scenario / template changes
  const apply = (s: ImpactScenario, id?: string) => {
    const next = IMPACT_TEMPLATES[s];
    const chosen = next.find((v) => v.id === id) ?? next[0];
    setScenario(s);
    setTplId(chosen.id);
    setDraft(renderImpactTemplate(chosen, ctx));
  };
  const reset = () => setDraft(renderImpactTemplate(tpl, ctx));

  const copy = async () => {
    await copyText(draft, "Copied!");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  const send = () => {
    if (!leadPhone.trim()) {
      toast.warning("Set lead phone first");
      return;
    }
    openWhatsApp(leadPhone, draft);
  };

  const scenarioSets: Record<string, { label: string; scenario: ImpactScenario }> = {
    first: { label: "First touch", scenario: "first-touch" },
    follow: { label: "Follow up", scenario: "quote-followup" },
    post: { label: "Post tour", scenario: "tour-noshow" },
  };
  const selectedSet = Object.entries(scenarioSets).find(([, item]) => item.scenario === scenario)?.[0] ?? "first";

  return (
    <div className="rounded-md border border-border bg-card/60 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          WhatsApp template
        </div>
        <Select value={selectedSet} onValueChange={(v) => apply(scenarioSets[v].scenario)}>
          <SelectTrigger className="h-7 text-[11px] w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(scenarioSets).map(([k, item]) => (
              <SelectItem key={k} value={k} className="text-xs">{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1">
        {variants.map((v) => (
          <button key={v.id}
            onClick={() => apply(scenario, v.id)}
            className={`h-6 px-2 rounded text-[10px] uppercase tracking-wider font-semibold border ${tpl.id === v.id ? "bg-accent text-accent-foreground border-accent" : "bg-card text-muted-foreground border-border hover:border-foreground/40"}`}>
            {v.label}
          </button>
        ))}
      </div>

      <Textarea
        rows={6}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="text-[12px] font-mono leading-relaxed"
      />

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" className={`h-7 text-[10px] gap-1 ${actionButtonClass}`} onClick={send}>
          <ExternalLink className="h-3 w-3" /> Send via WhatsApp
        </Button>
        <Button size="sm" variant="outline" className={`h-7 text-[10px] gap-1 ${actionButtonClass}`} onClick={() => void copy()}>
          <ClipboardCopy className="h-3 w-3" /> {copied ? "Copied!" : "Copy text"}
        </Button>
        <Button size="sm" variant="ghost" className={`h-7 text-[10px] ${actionButtonClass}`} onClick={reset}>
          Reset
        </Button>
        {!ctx.agentPhone && (
          <span className="text-[10px] text-warning self-center">
            ⚠ Set the TCM phone (in “Confirm tour”) so it auto-fills
          </span>
        )}
      </div>
    </div>
  );
}

function LeadActivityTimeline({ activities, tcms }: { activities: ActivityLog[]; tcms: TCM[] }) {
  const rows = activities
    .slice()
    .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))
    .slice(0, 5);

  const actorName = (actor: string) =>
    tcms.find((t) => t.id === actor)?.name ?? (actor === "flow-ops" ? "Flow Ops" : actor === "system" ? "System" : actor);

  return (
    <div className="rounded-md border border-border bg-card/70 p-2 space-y-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
        <Activity className="h-3 w-3" /> Activity
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">No activity logged yet.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded border border-border/70 p-1.5 text-[11px]">
              {a.kind === "call_logged" ? <Phone className="h-3 w-3 text-accent mt-0.5" /> : <Activity className="h-3 w-3 text-muted-foreground mt-0.5" />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {a.kind === "call_logged" ? `Call logged by ${actorName(a.actor)}` : a.text}
                </div>
                <div className="text-[10px] text-muted-foreground">{fmtActivityTime(a.ts)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Negotiation playbook — 3 scripted paths                            */
/* ================================================================== */

function NegotiationPlaybook({
  lead, leadPhone, ctx,
}: { lead: Lead; leadPhone: string; ctx: ImpactTplCtx }) {
  const [open, setOpen] = useState(false);
  const setLeadStage = useApp((s) => s.setLeadStage);
  const currentUser = useApp((s) => s.tcms.find((t) => t.id === s.currentTcmId));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function resolveTemplate(template: string, lead: Lead, ctx: ImpactTplCtx): string {
    return template
      .replace(/\{price\}/g,
        lead.budget ? `₹${lead.budget.toLocaleString("en-IN")}` : "")
      .replace(/\{altPrice\}/g,
        lead.budget ? `₹${(lead.budget * 0.9).toLocaleString("en-IN")}` : "")
      .replace(/\{propertyName\}/g, ctx.propertyName ?? "the property")
      .replace(/\{roomType\}/g, "triple")
      .replace(/\{leadName\}/g, lead.name ?? "")
      .replace(/\{agentName\}/g, ctx.agentName ?? currentUser?.name ?? "")
      .replace(/\{[^}]+\}/g, "");
  }

  const send = (msg: string, label: string) => {
    if (!leadPhone.trim()) {
      toast.warning("Set lead phone first");
      return;
    }
    openWhatsApp(leadPhone, msg);
    setLeadStage(lead.id, "negotiation");
    toast.success(`${label} sent`);
  };

  const paths: { key: ImpactScenario; title: string; tag: string }[] = [
    { key: "negotiate-hold",  title: "Hold price · add value", tag: "Keep rent, sweeten the deal" },
    { key: "negotiate-alt",   title: "Alternate room/property", tag: "Lower-priced swap" },
    { key: "negotiate-floor", title: "Floor price offer",       tag: "Manager-approved minimum" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={`h-7 text-[10px] gap-1 ${actionButtonClass}`}>
          <Sparkles className="h-3 w-3" /> Negotiate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle className="text-sm">Negotiation playbook · {lead.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-160px)] pb-6 scroll-smooth">
          {paths.map((p) => (
            <div key={p.key} className="border border-border rounded-lg p-3 space-y-2">
              <div>
                <div className="text-xs font-semibold">{p.title}</div>
                <div className="text-[10px] text-muted-foreground">{p.tag}</div>
              </div>
              <div className="space-y-1.5">
                {IMPACT_TEMPLATES[p.key].map((tpl) => {
                  const msg = resolveTemplate(tpl.body, lead, ctx);
                  return (
                    <div key={tpl.id} className="rounded bg-muted/40 p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] uppercase">{tpl.label}</Badge>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1"
                            onClick={() => {
                              void copyText(msg, "Copied!");
                              setCopiedId(tpl.id);
                              window.setTimeout(() => setCopiedId((id) => id === tpl.id ? null : id), 2000);
                            }}>
                            <ClipboardCopy className="h-3 w-3" /> {copiedId === tpl.id ? "Copied!" : "Copy"}
                          </Button>
                          <Button size="sm" className="h-6 text-[10px] gap-1"
                            onClick={() => send(msg, tpl.label)}>
                            <Send className="h-3 w-3" /> Send
                          </Button>
                        </div>
                      </div>
                      <div className="text-[11px] whitespace-pre-wrap font-mono leading-relaxed">{msg}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/*  Quick Add Lead                                                     */
/* ================================================================== */

function QuickAddLead({ defaultTcmId }: { defaultTcmId: string }) {
  const tcms = useApp((s) => s.tcms);
  const addLead = useApp((s) => s.addLead);
  const autoAssignLead = useApp((s) => s.autoAssignLead);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [budget, setBudget] = useState(12000);
  const [moveIn, setMoveIn] = useState(todayISO());
  const [intent, setIntent] = useState<Lead["intent"]>("warm");
  const [tcmId, setTcmId] = useState<string>(defaultTcmId);
  const [autoRoute, setAutoRoute] = useState(true);
  const [touched, setTouched] = useState({ name: false, phone: false, area: false });
  const [submitting, setSubmitting] = useState(false);

  const errors = {
    name: name.trim().length >= 2 ? "" : "Name must be at least 2 characters.",
    phone: isValidPhone(phone) ? "" : "Phone must be exactly 10 digits.",
    area: area.trim() ? "" : "Preferred location is required.",
  };
  const canSubmit = !errors.name && !errors.phone && !errors.area && !submitting;

  const reset = () => {
    setName(""); setPhone(""); setArea(""); setBudget(12000);
    setMoveIn(todayISO()); setIntent("warm"); setTcmId(defaultTcmId); setAutoRoute(true);
    setTouched({ name: false, phone: false, area: false });
    setSubmitting(false);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const parsed = parsePastedText(event.clipboardData.getData("text"));
    if (!parsed.name && !parsed.phone && !parsed.location) return;
    event.preventDefault();
    setName(parsed.name ?? "");
    setPhone(parsed.phone ?? "");
    setArea(parsed.location ?? "");
    setTouched({ name: false, phone: false, area: false });
  };

  const finishSuccess = (message = "Lead added to Impact Queue") => {
    setOpen(false);
    reset();
    toast.success(message);
  };

  const submit = async () => {
    setTouched({ name: true, phone: true, area: true });
    if (!canSubmit) return;

    const phoneE164 = normalizePhone(phone);
    const nameTrim = name.trim();
    const areaTrim = area.trim();
    const moveInIso = new Date(moveIn).toISOString();

    setSubmitting(true);
    try {
      const result = await dispatch({
        type: "cmd.lead.create",
        payload: {
          name: nameTrim,
          phone: phoneE164,
          source: "manual",
          budget,
          moveInDate: moveInIso,
          preferredArea: areaTrim,
          zoneId: null,
          intent,
          assigneeId: autoRoute ? undefined : tcmId,
        },
      });

      const data = (result as { data?: { leadId?: string; duplicate?: boolean } }).data;

      if (!result.ok) {
        const appeared = useApp.getState().leads.some(
          (l) => phonesMatch(l.phone, phoneE164) && l.name === nameTrim,
        );
        if (appeared) {
          finishSuccess();
          return;
        }
        toast.error(`Failed to add lead: ${result.error ?? "Try again."}`);
        return;
      }

      if (data?.duplicate) {
        finishSuccess("Lead already in queue");
        return;
      }

      const newLeadId = data?.leadId;
      const cur = useApp.getState().leads;
      const alreadyThere = newLeadId
        ? cur.some((l) => l.id === newLeadId)
        : cur.some((l) => phonesMatch(l.phone, phoneE164));

      if (!alreadyThere) {
        const lead = addLead({
          id: newLeadId,
          name: nameTrim,
          phone: phoneE164,
          preferredArea: areaTrim,
          budget,
          moveInDate: moveInIso,
          intent,
          assignedTcmId: autoRoute ? undefined : tcmId,
        });
        if (autoRoute && tcms.length > 0) {
          try {
            autoAssignLead(lead.id);
          } catch (err) {
            console.warn("Auto-route skipped:", err);
          }
        }
      }

      finishSuccess();
    } catch (error) {
      console.error("Add lead error:", error);
      const appeared = useApp.getState().leads.some(
        (l) => phonesMatch(l.phone, phoneE164) && l.name === nameTrim,
      );
      if (appeared) finishSuccess();
      else toast.error("Failed to add lead. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs gap-1">
          <Plus className="h-3 w-3" /> Add lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Add lead → Impact Queue</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">
              <Input className="h-8 text-xs" value={name} onPaste={handlePaste} onBlur={() => setTouched((t) => ({ ...t, name: true }))} onChange={(e) => setName(e.target.value)} />
              {touched.name && errors.name && <p className="mt-1 text-[10px] text-danger">{errors.name}</p>}
            </Field>
            <Field label="Phone">
              <Input className="h-8 text-xs" value={phone} onPaste={handlePaste} onBlur={() => setTouched((t) => ({ ...t, phone: true }))} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="9xxxxxxxxx" />
              {touched.phone && errors.phone && <p className="mt-1 text-[10px] text-danger">{errors.phone}</p>}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Preferred area">
              <Input className="h-8 text-xs" value={area} onPaste={handlePaste} onBlur={() => setTouched((t) => ({ ...t, area: true }))} onChange={(e) => setArea(e.target.value)} />
              {touched.area && errors.area && <p className="mt-1 text-[10px] text-danger">{errors.area}</p>}
            </Field>
            <Field label="Budget (₹/mo)">
              <Input className="h-8 text-xs" type="number" value={budget} onPaste={handlePaste} onChange={(e) => setBudget(Number(e.target.value))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Move-in by">
              <Input className="h-8 text-xs" type="date" value={moveIn} onPaste={handlePaste} onChange={(e) => setMoveIn(e.target.value)} />
            </Field>
            <Field label="Intent">
              <Select value={intent} onValueChange={(v) => setIntent(v as Lead["intent"]) }>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hot" className="text-xs">Hot</SelectItem>
                  <SelectItem value="warm" className="text-xs">Warm</SelectItem>
                  <SelectItem value="cold" className="text-xs">Cold</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase text-muted-foreground">Assign</Label>
              <button
                onClick={() => setAutoRoute((v) => !v)}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${autoRoute ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground"}`}>
                {autoRoute ? "Auto-route ON" : "Auto-route OFF"}
              </button>
            </div>
            {!autoRoute && (
              <Select value={tcmId} onValueChange={setTcmId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tcms.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name} · {t.zone} · {Math.round(t.conversionRate * 100)}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {autoRoute && (
              <p className="text-[10px] text-muted-foreground">
                System will pick the best TCM by zone, load, conversion rate & response speed.
              </p>
            )}
          </div>

          <Button
            className={`w-full h-8 text-xs ${actionButtonClass}`}
            onClick={() => void submit()}
            disabled={!canSubmit || submitting}
          >
            {submitting && <RotateCcw className="h-3 w-3 mr-1 animate-spin" />}
            {submitting ? "Adding..." : "Add to queue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Schedule Tour                                                      */
/* ================================================================== */

function ScheduleTourDialog({
  lead,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  prefillPg,
  showTrigger = true,
}: {
  lead: Lead;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  prefillPg?: PG | null;
  showTrigger?: boolean;
}) {
  const tcms = useApp((s) => s.tcms);
  const scheduleTour = useApp((s) => s.scheduleTour);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [selectedAgent, setSelectedAgent] = useState(lead.assignedTcmId ?? "");
  const [propertySearch, setPropertySearch] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<PG | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const today = todayISO();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("11:00");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open && prefillPg) {
      setSelectedProperty(prefillPg);
      setPropertySearch(prefillPg.name);
    }
  }, [open, prefillPg]);

  const filteredProperties = useMemo(() => {
    const q = propertySearch.trim().toLowerCase();
    let list = PGS;
    if (q) {
      list = PGS.filter(p => p.name.toLowerCase().includes(q) || p.area?.toLowerCase().includes(q));
    } else if (lead.preferredArea) {
      const byArea = PGS.filter(p => p.area.toLowerCase().includes(lead.preferredArea.toLowerCase()));
      if (byArea.length > 0) list = byArea;
    }
    return list.slice(0, 6);
  }, [propertySearch, lead.preferredArea]);

  const scheduleErrors = {
    property: selectedProperty ? "" : "Property is required.",
    agent: selectedAgent ? "" : "Agent is required.",
    date: date && date >= today ? "" : "Date must be today or future.",
    time: time ? "" : "Time slot is required.",
  };
  const canSchedule = !scheduleErrors.property && !scheduleErrors.agent && !scheduleErrors.date && !scheduleErrors.time;

  const handleScheduleTour = async () => {
    setSubmitted(true);
    if (!canSchedule) return;
    const iso = new Date(`${date}T${time}:00`).toISOString();
    setScheduling(true);
    try {
      await scheduleTour({
        leadId: lead.id,
        propertyId: selectedProperty!.id,
        tcmId: selectedAgent,
        scheduledAt: iso,
      });
      toast.success("Tour scheduled successfully");
      setOpen(false);
      setPropertySearch("");
      setSelectedProperty(null);
      setSubmitted(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to schedule tour. Try again.");
    } finally {
      setScheduling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button size="sm" className="h-7 text-[10px] gap-1">
            <Calendar className="h-3 w-3" /> Schedule
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm">Schedule tour · {lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-muted-foreground">PROPERTY</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search or type new name..."
                value={propertySearch}
                onChange={e => { setPropertySearch(e.target.value); setSelectedProperty(null); }}
                className="w-full border border-border rounded-md pl-7 pr-3 py-1.5 text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-primary h-8"
              />
            </div>
            {propertySearch || !selectedProperty ? (
              <div className="max-h-40 overflow-y-auto mt-1 space-y-1 border border-border rounded-md divide-y divide-border">
                {filteredProperties.length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                    No properties found
                  </div>
                )}
                {filteredProperties.map((property) => (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => {
                      setSelectedProperty(property);
                      setPropertySearch(property.name);
                    }}
                    className={cn(
                      "w-full text-left text-xs px-2 py-1.5 transition-colors",
                      selectedProperty?.id === property.id ? "bg-primary/10" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="font-medium">{property.name}</div>
                    <div className="text-[10px] text-muted-foreground">{property.area} · Property Hub</div>
                  </button>
                ))}
              </div>
            ) : null}
            {submitted && scheduleErrors.property && (
              <p className="mt-1 text-[10px] text-danger">{scheduleErrors.property}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-muted-foreground">ASSIGN TO</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-primary h-8"
            >
              <option value="">Select agent...</option>
              {tcms.map((agent) => (
                <option key={agent.id} value={agent.id} className="bg-background">
                  {agent.name} · {agent.zone ?? ""}
                </option>
              ))}
            </select>
            {submitted && scheduleErrors.agent && (
              <p className="mt-1 text-[10px] text-danger">{scheduleErrors.agent}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase text-muted-foreground">Date</label>
              <Input type="date" className="h-8 text-xs" value={date} onChange={(e) => setDate(e.target.value)} min={today} />
              {submitted && scheduleErrors.date && <p className="mt-1 text-[10px] text-danger">{scheduleErrors.date}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase text-muted-foreground">Time</label>
              <Input type="time" className="h-8 text-xs" value={time} onChange={(e) => setTime(e.target.value)} />
              {submitted && scheduleErrors.time && <p className="mt-1 text-[10px] text-danger">{scheduleErrors.time}</p>}
            </div>
          </div>

          <Button
            className={`w-full h-8 text-xs ${actionButtonClass}`}
            onClick={() => void handleScheduleTour()}
            disabled={scheduling || (submitted && !canSchedule)}
          >
            {scheduling && <RotateCcw className="h-3 w-3 mr-1 animate-spin" />}
            {scheduling ? "Scheduling..." : "Schedule tour"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/*  Confirm tour → send TCM details (with phone save)                  */
/* ================================================================== */

function ConfirmTourButton({ lead, tour }: { lead: Lead; tour: Tour }) {
  const tcms = useApp((s) => s.tcms);
  const opsProperties = useApp((s) => s.properties);
  const catalogProperty = resolvePropertyById(tour.propertyId, opsProperties);
  const tcm = tcms.find((item) => item.id === tour.tcmId);
  const phones = useTcmContacts((s) => s.phones);
  const setPhone = useTcmContacts((s) => s.setPhone);
  const [open, setOpen] = useState(false);
  const [phone, setPhoneLocal] = useState(phones[tour.tcmId] ?? "");

  const message = useMemo(() => {
    const tpl = IMPACT_TEMPLATES["tour-confirm"][0];
    return renderImpactTemplate(tpl, {
      leadName: lead.name.split(" ")[0],
      agentName: tcm?.name ?? "Gharpayy TCM",
      agentPhone: phone || "(coming soon)",
      propertyName: catalogProperty?.name ?? "Property",
      propertyAddress: catalogProperty?.area,
      tourWhen: fmtWhen(tour.scheduledAt),
    });
  }, [lead.name, phone, catalogProperty?.name, catalogProperty?.area, tcm?.name, tour.scheduledAt]);

  const handleSend = () => {
    if (phone) setPhone(tour.tcmId, normalizePhone(phone));
    openWhatsApp(lead.phone, message);
    toast.success("Confirmation ready");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
          <Send className="h-3 w-3" /> Confirm tour
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm">Confirm tour to {lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">TCM phone (saved for next time)</Label>
            <Input className="h-8 text-xs" placeholder="+91 9xxxxxxxxx" value={phone} onChange={(event) => setPhoneLocal(event.target.value)} />
          </div>
          <div className="rounded-lg p-3" style={{ background: "#075E54" }}>
            <div className="rounded-xl px-3 py-2 text-[12px] whitespace-pre-wrap font-mono" style={{ background: "#DCF8C6", color: "#111", borderRadius: "12px 12px 2px 12px" }}>
              {message}
            </div>
          </div>
          <Button className="w-full h-8 text-xs gap-1" onClick={handleSend}>
            <ExternalLink className="h-3 w-3" /> Send via WhatsApp
          </Button>
          <ReminderRow tour={tour} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReminderRow({ tour }: { tour: Tour }) {
  const addFollowUp = useApp((s) => s.addFollowUp);
  const opts = [
    { label: "2 h before", min: 120 },
    { label: "1 h before", min: 60 },
    { label: "30 m before", min: 30 },
  ];
  const setReminder = (min: number) => {
    const due = new Date(+new Date(tour.scheduledAt) - min * 60_000).toISOString();
    addFollowUp({
      leadId: tour.leadId,
      tourId: tour.id,
      tcmId: tour.tcmId,
      dueAt: due,
      priority: "high",
      reason: `Tour reminder · ${opts.find((option) => option.min === min)?.label}`,
    });
    toast.success("Reminder set");
  };
  return (
    <div className="border-t border-border pt-2">
      <div className="text-[10px] uppercase text-muted-foreground font-semibold mb-1 flex items-center gap-1">
        <Timer className="h-2.5 w-2.5" /> Reminder
      </div>
      <div className="flex gap-1">
        {opts.map((option) => (
          <Button key={option.min} size="sm" variant="outline" className="h-7 text-[10px] flex-1" onClick={() => setReminder(option.min)}>
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function QuotationDialog({ lead, label = "Send quotation", variant = "default" }: { lead: Lead; label?: string; variant?: "default" | "ghost" }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant === "ghost" ? "ghost" : "default"} className={`h-7 text-[10px] gap-1 ${actionButtonClass}`}>
          <FileText className="h-3 w-3" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-sm">Quotation · {lead.name}</DialogTitle></DialogHeader>
        <QuotationBuilder lead={lead} embedded onSent={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function BookingDialog({ lead, quote, openTour }: { lead: Lead; quote: Quotation; openTour?: Tour }) {
  const closeDeal = useApp((s) => s.closeDeal);
  const { mutate: upsertCheckin } = useUpsertCheckin();
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(quote.discountedPrice);
  const [closing, setClosing] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className={`h-7 text-[10px] gap-1 bg-success text-success-foreground hover:bg-success/90 ${actionButtonClass}`}>
          <CheckCircle2 className="h-3 w-3" /> Book
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-sm">Close booking · {lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-[11px] text-muted-foreground">
            {quote.propertyName} · {quote.roomType}{quote.roomNumber ? ` #${quote.roomNumber}` : ""}
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Monthly rent</Label>
            <Input type="number" className="h-8 text-xs" value={amt} onChange={(event) => setAmt(Number(event.target.value))} />
          </div>
          <div className="text-[10px] text-muted-foreground">
            Prebook collected: {formatINR(quote.prebook)} · Deposit: {formatINR(quote.deposit)}
          </div>
          <Button
            className={`w-full h-8 text-xs ${actionButtonClass}`}
            disabled={closing}
            onClick={() => {
              setClosing(true);
              try {
                closeDeal({
                  leadId: lead.id,
                  tourId: openTour?.id ?? "manual",
                  propertyId: quote.propertyId ?? openTour?.propertyId ?? "",
                  tcmId: lead.assignedTcmId,
                  amount: amt,
                });
                upsertCheckin({
                  leadId: lead.id,
                  rent: amt,
                  deposit: quote.deposit,
                  propertyId: quote.propertyId ?? openTour?.propertyId,
                  propertyName: quote.propertyName,
                });
                toast.success("Booking closed");
                setOpen(false);
              } catch {
                toast.error("Booking failed");
              } finally {
                setClosing(false);
              }
            }}
          >
            {closing && <RotateCcw className="h-3 w-3 mr-1 animate-spin" />}
            Confirm booking
          </Button>
          {!openTour && <div className="text-[10px] text-warning">No tour found — booking will be marked as direct.</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DirectBookButton({
  lead, openTour, opsProperties,
}: {
  lead: Lead; openTour?: Tour; opsProperties: Property[];
}) {
  const properties = opsProperties;
  const closeDeal = useApp((s) => s.closeDeal);
  const addProperty = useApp((s) => s.addProperty);
  const { mutateAsync: upsertCheckin } = useUpsertCheckin();
  const { mutateAsync: patchCheckin } = usePatchCheckin();
  const [open, setOpen] = useState(false);
  const [propQuery, setPropQuery] = useState("");
  const [propId, setPropId] = useState(openTour?.propertyId ?? "");
  const [propName, setPropName] = useState("");
  const [rent, setRent] = useState(lead.budget);
  const [moveIn, setMoveIn] = useState(todayISO());
  const [mode, setMode] = useState<"upi" | "card" | "cash" | "bank">("upi");
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(
    () => searchPropertyCatalog(propQuery, properties, { preferredArea: lead.preferredArea, limit: 8 }),
    [properties, propQuery, lead.preferredArea],
  );

  const submit = async () => {
    let pid = propId;
    let name = propName || propQuery.trim();
    if (!pid && name) {
      const created = addProperty({ name, area: lead.preferredArea, pricePerBed: rent, totalBeds: 1, vacantBeds: 1 });
      pid = created.id;
      name = created.name;
    }
    if (!pid) {
      toast.error("Pick or add a property");
      return;
    }
    if (rent <= 0) {
      toast.error("Rent must be greater than zero");
      return;
    }
    setSubmitting(true);
    try {
      closeDeal({ leadId: lead.id, tourId: openTour?.id ?? "direct", propertyId: pid, tcmId: lead.assignedTcmId, amount: rent });
      const resolved = resolvePropertyById(pid, properties);
      const ci = await upsertCheckin({
        leadId: lead.id,
        rent,
        propertyId: pid,
        propertyName: resolved?.name ?? name,
      });
      if (moveIn && ci) {
        await patchCheckin({
          id: ci.id,
          leadId: lead.id,
          patch: { checkInDate: new Date(moveIn).toISOString() },
        });
      }
      toast.success(`Direct booking · ${lead.name} · ${formatINR(rent)}`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Direct booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={`h-7 text-[10px] gap-1 ${actionButtonClass}`}>
          <Wallet className="h-3 w-3" /> Direct book
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm">Direct book · {lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-[10px] text-muted-foreground">Skip the funnel. Use this when the lead is ready right now.</p>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Property</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-8 pl-7 text-xs" placeholder="Search or type new" value={propQuery} onChange={(event) => { setPropQuery(event.target.value); setPropId(""); }} />
            </div>
            <div className="max-h-32 overflow-y-auto mt-1 space-y-1">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPropId(item.id);
                    setPropQuery(item.name);
                    setPropName(item.name);
                    setRent(item.pricePerBed);
                  }}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded border ${propId === item.id ? "bg-primary/10 border-primary/40" : "border-border hover:bg-muted/50"}`}
                >
                  <div className="font-medium">{item.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {item.area} · {formatINR(item.pricePerBed)}/bed
                    {item.source === "hub" ? " · Property Hub" : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Monthly rent"><Input type="number" className="h-8 text-xs" value={rent} onChange={(event) => setRent(Number(event.target.value))} /></Field>
            <Field label="Move-in"><Input type="date" className="h-8 text-xs" value={moveIn} onChange={(event) => setMoveIn(event.target.value)} /></Field>
          </div>
          <Field label="Payment mode">
            <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upi" className="text-xs">UPI</SelectItem>
                <SelectItem value="card" className="text-xs">Card</SelectItem>
                <SelectItem value="cash" className="text-xs">Cash</SelectItem>
                <SelectItem value="bank" className="text-xs">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Button className={`w-full h-8 text-xs ${actionButtonClass}`} onClick={() => void submit()} disabled={submitting}>
            {submitting && <RotateCcw className="h-3 w-3 mr-1 animate-spin" />}
            Confirm direct booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CheckInOpsButton({ lead, existing }: { lead: Lead; property?: Property; quote?: Quotation; existing?: CheckIn | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={existing ? "default" : "outline"} className={`h-7 text-[10px] gap-1 ${actionButtonClass}`}>
          <KeyRound className="h-3 w-3" /> Check-in
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-sm">Check-in command · {lead.name}</DialogTitle></DialogHeader>
        <CheckInPanel lead={lead} />
      </DialogContent>
    </Dialog>
  );
}

function CheckInAuditReport({ checkin, lead, compact = false }: { checkin: CheckIn; lead: Lead; compact?: boolean }) {
  const risk = riskLevel(checkin);
  return (
    <div className="rounded-md border border-border bg-card/70 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <ScrollText className="h-3 w-3" /> Check-in audit report
        </div>
        <Badge variant="outline" className={`text-[9px] ${RISK_CLASS[risk]}`}>{RISK_LABEL[risk]}</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
        <AuditMetric label="Stage" value={STAGE_LABEL[checkin.stage]} />
        <AuditMetric label="Room" value={checkin.roomNumber || "Pending"} />
        <AuditMetric label="Balance" value={formatINR(checkin.balanceDue)} />
        <AuditMetric label="Delays" value={String(checkin.delays.length)} danger={checkin.delays.length >= 2} />
      </div>
      {!compact && (
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {checkin.history.slice().reverse().map((entry, index) => (
            <div key={`${entry.at}-${index}`} className="flex items-start gap-2 text-[10px] rounded border border-border/70 p-1.5">
              <span className="font-mono text-muted-foreground shrink-0">{fmtWhen(entry.at)}</span>
              <span className="flex-1">{entry.note ?? `${lead.name}: ${STAGE_LABEL[entry.stage]}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditMetric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded border p-1.5 ${danger ? "border-danger/40 bg-danger/5 text-danger" : "border-border bg-muted/20"}`}>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold truncate">{value}</div>
    </div>
  );
}

/* ================================================================== */
/*  Focus Inventory Strip — what each TCM is pushing TODAY             */
/* ================================================================== */

function FocusInventoryStrip({ tcmFilter }: { tcmFilter: string }) {
  const tcms = useApp((s) => s.tcms);
  const properties = useApp((s) => s.properties);
  const focusProps = useTcmContacts((s) => s.focusProps);
  const [manageOpen, setManageOpen] = useState(false);

  const activeTcm =
    tcmFilter !== "all" ? tcms.find((t) => t.id === tcmFilter) : undefined;

  const rows = useMemo(() => {
    const list = activeTcm ? [activeTcm] : tcms;
    return list.map((t) => {
      const ids = focusProps[t.id] ?? [];
      const props = ids
        .map((id) => resolvePropertyById(id, properties))
        .filter(Boolean) as CatalogProperty[];
      const vacant = props.reduce((a, p) => a + (p.vacantBeds ?? 0), 0);
      return { tcm: t, props, vacant };
    });
  }, [activeTcm, tcms, focusProps, properties]);

  const allEmpty = rows.every((r) => r.props.length === 0);

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Pin className="h-3.5 w-3.5 text-accent" />
          <span className="text-[11px] uppercase tracking-wider font-semibold">
            Today's focus inventory
          </span>
          <span className="text-[10px] text-muted-foreground">
            · what to push first
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px] gap-1"
          onClick={() => setManageOpen(true)}
        >
          <Home className="h-3 w-3" /> Manage focus
        </Button>
      </div>

      {allEmpty ? (
        <p className="text-[11px] text-muted-foreground italic">
          No focus properties yet. Click <span className="font-semibold">Manage focus</span> to pin 3–5 properties per teammate so they know exactly what to push first today.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ tcm, props, vacant }) => (
            <div key={tcm.id} className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-6 h-6 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center">
                  {tcm.initials}
                </div>
                <span className="text-[11px] font-semibold">{tcm.name.split(" ")[0]}</span>
                <Badge variant="outline" className="text-[9px] uppercase">
                  {vacant} beds free
                </Badge>
              </div>
              {props.length === 0 ? (
                <span className="text-[10px] text-muted-foreground italic">No focus set</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {props.map((p) => (
                    <div
                      key={p.id}
                      className={`text-[10px] rounded-md border px-2 py-1 flex items-center gap-1.5 ${
                        (p.vacantBeds ?? 1) === 0
                          ? "border-danger/40 bg-danger/5 text-muted-foreground"
                          : "border-border bg-card"
                      }`}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-muted-foreground">· {p.area}</span>
                      {p.source === "hub" && (
                        <Badge variant="outline" className="text-[8px]">Hub</Badge>
                      )}
                      {p.vacantBeds !== undefined && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${
                            p.vacantBeds > 0
                              ? "bg-success/10 text-success border-success/40"
                              : "bg-danger/10 text-danger border-danger/40"
                          }`}
                        >
                          {p.vacantBeds}/{p.totalBeds ?? "—"}
                        </Badge>
                      )}
                      <span className="text-muted-foreground">{formatINR(p.pricePerBed)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ManageFocusDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        defaultTcmId={activeTcm?.id ?? tcms[0]?.id ?? ""}
      />
    </div>
  );
}

function ManageFocusDialog({
  open, onOpenChange, defaultTcmId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTcmId: string;
}) {
  const tcms = useApp((s) => s.tcms);
  const properties = useApp((s) => s.properties);
  const focusProps = useTcmContacts((s) => s.focusProps);
  const toggleFocusProp = useTcmContacts((s) => s.toggleFocusProp);
  const clearFocus = useTcmContacts((s) => s.clearFocus);
  const [tcmId, setTcmId] = useState(defaultTcmId);
  const [query, setQuery] = useState("");

  const focused = focusProps[tcmId] ?? [];
  const list = useMemo(() => {
    const base = searchPropertyCatalog(query, properties, { limit: 40 });
    return [...base].sort((a, b) => {
      const af = focused.includes(a.id) ? 0 : 1;
      const bf = focused.includes(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return (b.vacantBeds ?? 1) - (a.vacantBeds ?? 1);
    });
  }, [properties, query, focused]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Pin className="h-4 w-4" /> Manage focus inventory
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">TCM</Label>
              <Select value={tcmId} onValueChange={setTcmId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tcms.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name} · {t.zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Search</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Property name or area"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {focused.length} property{focused.length === 1 ? "" : "ies"} pinned
            </span>
            {focused.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] gap-1 text-danger"
                onClick={() => { clearFocus(tcmId); toast("Focus cleared"); }}
              >
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1 border border-border rounded-md p-2">
            {list.map((p) => {
              const on = focused.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleFocusProp(tcmId, p.id)}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded border flex items-center gap-2 transition ${
                    on
                      ? "bg-accent/10 border-accent/50"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${on ? "bg-accent border-accent text-accent-foreground" : "border-border"}`}>
                    {on && <CheckCircle2 className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {p.area} · {formatINR(p.pricePerBed)}/bed
                      {p.source === "hub" ? " · Property Hub" : ""}
                    </div>
                  </div>
                  {p.vacantBeds !== undefined && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] ${
                        p.vacantBeds > 0
                          ? "bg-success/10 text-success border-success/40"
                          : "bg-danger/10 text-danger border-danger/40"
                      }`}
                    >
                      {p.vacantBeds}/{p.totalBeds ?? "—"}
                    </Badge>
                  )}
                </button>
              );
            })}
            {list.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-4">
                No properties match.
              </p>
            )}
          </div>

          <Button className="w-full h-8 text-xs" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/*  Message Lab — preview every template variant, copy/send each       */
/* ================================================================== */

function MessageLabButton({ tcms }: { tcms: TCM[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-6 px-2 rounded-full text-[10px] uppercase tracking-wider font-semibold border border-accent/50 text-accent bg-accent/10 hover:bg-accent/20 flex items-center gap-1"
      >
        <Beaker className="h-3 w-3" /> Message Lab
      </button>
      <MessageLabSheet open={open} onOpenChange={setOpen} tcms={tcms} />
    </>
  );
}

function MessageLabSheet({ open, onOpenChange, tcms }: { open: boolean; onOpenChange: (v: boolean) => void; tcms: TCM[] }) {
  const opsProperties = useApp((s) => s.properties);
  const catalog = useMemo(() => allCatalogProperties(opsProperties), [opsProperties]);
  const phones = useTcmContacts((s) => s.phones);
  const [tcmId, setTcmId] = useState(tcms[0]?.id ?? "");
  const [propId, setPropId] = useState(catalog[0]?.id ?? "");
  const [leadName, setLeadName] = useState("Aakash");
  const [leadPhone, setLeadPhone] = useState("");
  const [tourWhen, setTourWhen] = useState("Tomorrow, 11:00 AM");
  const [price, setPrice] = useState<number>(12000);
  const [altPrice, setAltPrice] = useState<number>(10500);
  const [budget, setBudget] = useState<number>(13000);
  const tcm = tcms.find((item) => item.id === tcmId);
  const property = catalog.find((item) => item.id === propId);

  const ctx: ImpactTplCtx = useMemo(() => ({
    leadName,
    agentName: tcm?.name,
    agentPhone: phones[tcmId] ?? "",
    propertyName: property?.name,
    propertyAddress: property?.area,
    tourWhen,
    roomType: "Shared · Triple",
    price,
    altPrice,
    area: property?.area,
    budget,
    moveIn: fmtDate(new Date().toISOString()),
  }), [leadName, tcm?.name, phones, tcmId, property?.name, property?.area, tourWhen, price, altPrice, budget]);

  const scenarios = Object.keys(IMPACT_TEMPLATES) as ImpactScenario[];
  const copy = (text: string) => copyText(text);
  const send = (text: string) => {
    if (!leadPhone.trim()) {
      toast.warning("Set lead phone first");
      return;
    }
    openWhatsApp(leadPhone, text);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border space-y-2">
          <SheetTitle className="text-base font-display flex items-center gap-2">
            <Beaker className="h-4 w-4 text-accent" /> Message Lab
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            Every template, every variant. Tweak the context, then copy or send each one.
          </SheetDescription>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Field label="Lead name"><Input className="h-8 text-xs" value={leadName} onChange={(event) => setLeadName(event.target.value)} /></Field>
            <Field label="Lead phone"><Input className="h-8 text-xs" placeholder="+91 9xxxxxxxxx" value={leadPhone} onChange={(event) => setLeadPhone(event.target.value)} /></Field>
            <Field label="TCM">
              <Select value={tcmId} onValueChange={setTcmId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{tcms.map((item) => <SelectItem key={item.id} value={item.id} className="text-xs">{item.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Property">
              <Select value={propId} onValueChange={setPropId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {catalog.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="text-xs">
                      {item.name}{item.source === "hub" ? " · Hub" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tour when"><Input className="h-8 text-xs" value={tourWhen} onChange={(event) => setTourWhen(event.target.value)} /></Field>
            <Field label="Budget"><Input className="h-8 text-xs" type="number" value={budget} onChange={(event) => setBudget(Number(event.target.value))} /></Field>
            <Field label="Price"><Input className="h-8 text-xs" type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></Field>
            <Field label="Alt price"><Input className="h-8 text-xs" type="number" value={altPrice} onChange={(event) => setAltPrice(Number(event.target.value))} /></Field>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {scenarios.map((scenario) => (
            <section key={scenario} className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{scenario.replace(/-/g, " ")}</div>
              {IMPACT_TEMPLATES[scenario].map((tpl) => {
                const text = renderImpactTemplate(tpl, ctx);
                return (
                  <div key={tpl.id} className="rounded-lg border border-border bg-card p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[9px] uppercase">{tpl.label}</Badge>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => copy(text)}>
                          <ClipboardCopy className="h-3 w-3" /> Copy
                        </Button>
                        <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => send(text)}>
                          <Send className="h-3 w-3" /> Send
                        </Button>
                      </div>
                    </div>
                    <div className="text-[11px] whitespace-pre-wrap font-mono leading-relaxed">{text}</div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ================================================================== */
/*  10x Command Bar — live recompute pulse, streak, SLA, digest        */
/* ================================================================== */

function TenXCommandBar({
  lastRerank, escalations, counters, targets, stackSorted, tick, onFocusLead,
}: {
  lastRerank: number;
  escalations: number;
  counters: { toursToday: number; quotesWeek: number; bookingsMonth: number };
  targets: { toursToday: number; quotesWeek: number; bookingsMonth: number };
  stackSorted: Array<{ lead: { id: string; name: string }; score: number; nba: { label: string; pressure: string }; column: string }>;
  tick: number;
  onFocusLead?: (leadId: string, name: string) => void;
}) {
  const streak = counters.toursToday + counters.quotesWeek + counters.bookingsMonth;
  const breach = escalations;
  const top5 = stackSorted.slice(0, 5);
  const stalled = stackSorted.filter((e) => e.nba.pressure === "escalate").slice(0, 5);
  const moved = Math.min(streak, 99);

  const ago = lastRerank === 0 ? 0 : Math.max(0, Math.floor((Date.now() - lastRerank) / 1000));
  const agoLabel = lastRerank === 0 ? "—" : ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`;
  void tick;

  const progress = Math.min(100, Math.round(((counters.bookingsMonth / Math.max(targets.bookingsMonth, 1)) * 100)));

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-accent/10 via-card to-primary/5 backdrop-blur-xl">
      <div className="h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <div className="flex flex-wrap items-center gap-4 p-3">
        <div className="flex items-center gap-2">
          <div className="relative h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
            <span className="absolute inset-0 rounded-full bg-success" />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Live re-rank</div>
            <div className="text-xs font-mono">{agoLabel} · auto 60s</div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-success/15 text-success flex items-center justify-center">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Streak</div>
            <div className="text-base font-display font-semibold leading-none">{moved}<span className="text-[10px] text-muted-foreground ml-1">moved</span></div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <div className={`relative h-9 w-9 rounded-md flex items-center justify-center ${breach > 0 ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground"}`}>
            <Bell className="h-4 w-4" />
            {breach > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-danger animate-pulse" />}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">SLA breach</div>
            <div className={`text-base font-display font-semibold leading-none ${breach > 0 ? "text-danger" : ""}`}>{breach}<span className="text-[10px] text-muted-foreground ml-1">leads</span></div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2 min-w-[160px]">
          <div className="h-9 w-9 rounded-md bg-primary/15 text-primary flex items-center justify-center">
            <Activity className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Month target</div>
              <div className="text-[10px] font-mono text-muted-foreground">{counters.bookingsMonth}/{targets.bookingsMonth}</div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
              <div className="h-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="ml-auto gap-1.5 text-xs">
              <Sunrise className="h-3.5 w-3.5" /> Daily digest
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Sunrise className="h-4 w-4 text-accent" /> Today's digest</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Moved</div>
                  <div className="text-xl font-display font-semibold">{moved}</div>
                </div>
                <div className="rounded-md border border-border p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Stalled</div>
                  <div className="text-xl font-display font-semibold text-danger">{stalled.length}</div>
                </div>
                <div className="rounded-md border border-border p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Booked</div>
                  <div className="text-xl font-display font-semibold text-success">{counters.bookingsMonth}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Tomorrow's top 5</div>
                <ol className="space-y-1">
                  {top5.length === 0 && <li className="text-xs text-muted-foreground italic">Queue clear.</li>}
                  {top5.map((e, i) => (
                    <li key={e.lead.id}>
                      <button
                        type="button"
                        onClick={() => onFocusLead?.(e.lead.id, e.lead.name)}
                        className="w-full flex items-center gap-2 text-xs rounded-md border border-border bg-card p-2 text-left hover:border-accent/50 hover:bg-accent/5 transition"
                      >
                        <span className="h-5 w-5 rounded-full bg-accent/15 text-accent text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                        <span className="font-medium truncate flex-1">{e.lead.name}</span>
                        <Badge variant="outline" className="text-[9px]">{e.nba.label}</Badge>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>

              {stalled.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-danger font-semibold mb-1">Stalled — escalate</div>
                  <ul className="space-y-1">
                    {stalled.map((e) => (
                      <li key={e.lead.id}>
                        <button
                          type="button"
                          onClick={() => onFocusLead?.(e.lead.id, e.lead.name)}
                          className="w-full flex items-center gap-2 text-xs rounded-md border border-danger/30 bg-danger/5 p-2 text-left hover:border-danger/50 transition"
                        >
                          <Zap className="h-3 w-3 text-danger" />
                          <span className="font-medium truncate flex-1">{e.lead.name}</span>
                          <Badge variant="outline" className="text-[9px] border-danger/40 text-danger">{e.nba.label}</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                size="sm"
                className="w-full gap-1.5"
                onClick={() => {
                  const txt = `*Daily digest*\nMoved: ${moved}  ·  Stalled: ${stalled.length}  ·  Booked: ${counters.bookingsMonth}\n\nTomorrow's top 5:\n${top5.map((e, i) => `${i + 1}. ${e.lead.name} — ${e.nba.label}`).join("\n")}`;
                  navigator.clipboard?.writeText(txt);
                  toast.success("Digest copied — paste into WhatsApp");
                }}
              >
                <ClipboardCopy className="h-3.5 w-3.5" /> Copy digest for WhatsApp
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Separator() {
  return <div className="h-8 w-px bg-border" />;
}

/* ... rest of file omitted for brevity ... */
