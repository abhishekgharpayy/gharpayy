import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import type { Lead, Property } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Plus, Search, FileText, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  renderQuotationMessage,
  formatINR,
  type QuotationStatus,
  useQuotationsQuery,
  useAddQuotation,
  useSetQuotationStatus,
} from "@/lib/crm10x/quotations";
import { waLink } from "@/lib/crm10x/templates";

const ROOM_TYPES = ["Shared", "Private", "Double Sharing", "Triple Sharing"];
const QUICK_VALIDITY = [
  { v: 15, label: "15 min" },
  { v: 20, label: "20 min" },
  { v: 30, label: "30 min" },
  { v: 60, label: "1 hr" },
  { v: 120, label: "2 hr" },
  { v: 360, label: "6 hr" },
  { v: 720, label: "12 hr" },
];

const STATUS_TONE: Record<QuotationStatus, string> = {
  sent: "bg-accent/15 text-accent border-accent/30",
  paid: "bg-success/15 text-success border-success/30",
  "not-paid": "bg-destructive/15 text-destructive border-destructive/30",
  expired: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function QuotationBuilder({ lead }: { lead: Lead }) {
  const properties = useApp((s) => s.properties);
  const addProperty = useApp((s) => s.addProperty);
  const { mutate: add } = useAddQuotation();
  const { data: allQuotes = [] } = useQuotationsQuery(lead.id);
  const { mutate: setStatus } = useSetQuotationStatus();

  const leadQuotes = useMemo(
    () => allQuotes.filter((q) => q.leadId === lead.id),
    [allQuotes, lead.id],
  );

  const [open, setOpen] = useState(false);

  // Property picker state
  const [propQuery, setPropQuery] = useState("");
  const [propId, setPropId] = useState<string | "">("");
  const [customName, setCustomName] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newPropArea, setNewPropArea] = useState(lead.preferredArea ?? "");
  const [newPropPrice, setNewPropPrice] = useState<number>(lead.budget ?? 12000);

  // Quotation fields
  const [roomType, setRoomType] = useState("Shared");
  const [roomNumber, setRoomNumber] = useState("");
  const [actualRent, setActualRent] = useState<number>(15000);
  const [discounted, setDiscounted] = useState<number>(12000);
  const [deposit, setDeposit] = useState<number>(5000);
  const [prebook, setPrebook] = useState<number>(5000);
  const [maintenance, setMaintenance] = useState<number>(3000);
  const [maintenanceType, setMaintenanceType] = useState<"One-Time" | "Monthly">("One-Time");
  const [lockIn, setLockIn] = useState("3 Months");
  const [notice, setNotice] = useState("30 Days");
  const [validityMin, setValidityMin] = useState<number>(20);

  const filteredProps = useMemo(() => {
    const q = propQuery.trim().toLowerCase();
    if (!q) return properties.slice(0, 8);
    return properties
      .filter((p) => p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q))
      .slice(0, 8);
  }, [properties, propQuery]);

  const selectedProp = propId ? properties.find((p) => p.id === propId) : undefined;
  const resolvedPropertyName =
    selectedProp?.name || customName.trim() || propQuery.trim() || "";

  const validUntilISO = useMemo(
    () => new Date(Date.now() + validityMin * 60_000).toISOString(),
    [validityMin],
  );

  const draft = {
    propertyName: resolvedPropertyName || "[Property Name]",
    roomType,
    roomNumber: roomNumber.trim() || undefined,
    actualRent,
    discountedPrice: discounted,
    deposit,
    prebook,
    maintenance,
    maintenanceType,
    lockIn,
    notice,
    validUntilISO,
  };

  const message = renderQuotationMessage(draft);
  const canSend = resolvedPropertyName.length > 0 && discounted > 0;

  const handleAddNewProperty = () => {
    const name = customName.trim() || propQuery.trim();
    if (!name) {
      toast.error("Enter a property name");
      return;
    }
    const created: Property = addProperty({
      name,
      area: newPropArea || lead.preferredArea || "—",
      pricePerBed: newPropPrice || discounted,
      totalBeds: 1,
      vacantBeds: 1,
    });
    setPropId(created.id);
    setCustomName("");
    setAddingNew(false);
    toast.success(`Added "${name}"`);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message);
    toast.success("Copied to clipboard");
  };

  const handleSend = () => {
    if (!canSend) {
      toast.error("Pick a property and set a discounted price");
      return;
    }
    add({
      leadId: lead.id,
      tcmId: lead.assignedTcmId || "tcm-current",
      propertyId: selectedProp?.id,
      propertyName: resolvedPropertyName,
      roomType,
      roomNumber: roomNumber.trim() || undefined,
      actualRent,
      discountedPrice: discounted,
      deposit,
      prebook,
      maintenance,
      maintenanceType,
      lockIn,
      notice,
      validityMinutes: validityMin,
      validUntilISO,
      message,
    });
    window.open(waLink(lead.phone, message), "_blank", "noopener,noreferrer");
    toast.success(`Quotation sent · ${formatINR(discounted)}`);
    setOpen(false);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" /> Quotation
          {leadQuotes.length > 0 && (
            <span className="text-[10px] text-muted-foreground">· {leadQuotes.length} sent</span>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> New quote
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm">Send quotation to {lead.name}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div className="space-y-3">
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Property
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="h-8 text-xs pl-7"
                      placeholder="Search supply or type a name…"
                      value={propQuery}
                      onChange={(e) => {
                        setPropQuery(e.target.value);
                        setPropId("");
                      }}
                    />
                  </div>
                  {!addingNew && filteredProps.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {filteredProps.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setPropId(p.id);
                            setPropQuery(p.name);
                            setActualRent(Math.round(p.pricePerBed * 1.2));
                            setDiscounted(p.pricePerBed);
                          }}
                          className={`w-full text-left text-xs px-2 py-1.5 rounded border ${
                            propId === p.id
                              ? "bg-primary/10 border-primary/40"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <div className="font-medium">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {p.area} · {formatINR(p.pricePerBed)}/bed · {p.vacantBeds} vacant
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {!addingNew && propQuery && filteredProps.length === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs gap-1"
                      onClick={() => {
                        setCustomName(propQuery);
                        setAddingNew(true);
                      }}
                    >
                      <Plus className="h-3 w-3" /> Add "{propQuery}" as new property
                    </Button>
                  )}
                  {addingNew && (
                    <div className="space-y-2 border-t border-border pt-2">
                      <Input
                        className="h-8 text-xs"
                        placeholder="Property name"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Area"
                          value={newPropArea}
                          onChange={(e) => setNewPropArea(e.target.value)}
                        />
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          placeholder="Price/bed"
                          value={newPropPrice}
                          onChange={(e) => setNewPropPrice(Number(e.target.value))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs flex-1" onClick={handleAddNewProperty}>
                          Save property
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setAddingNew(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Room type</Label>
                    <Select value={roomType} onValueChange={setRoomType}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROOM_TYPES.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Room # (optional)</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="504"
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Actual rent</Label>
                    <Input type="number" className="h-8 text-xs" value={actualRent}
                      onChange={(e) => setActualRent(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Discounted</Label>
                    <Input type="number" className="h-8 text-xs" value={discounted}
                      onChange={(e) => setDiscounted(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Deposit</Label>
                    <Input type="number" className="h-8 text-xs" value={deposit}
                      onChange={(e) => setDeposit(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Prebook</Label>
                    <Input type="number" className="h-8 text-xs" value={prebook}
                      onChange={(e) => setPrebook(Number(e.target.value))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Maintenance</Label>
                    <Input type="number" className="h-8 text-xs" value={maintenance}
                      onChange={(e) => setMaintenance(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Type</Label>
                    <Select value={maintenanceType} onValueChange={(v) => setMaintenanceType(v as "One-Time" | "Monthly")}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="One-Time" className="text-xs">One-Time</SelectItem>
                        <SelectItem value="Monthly" className="text-xs">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Lock-in</Label>
                    <Input className="h-8 text-xs" value={lockIn} onChange={(e) => setLockIn(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Notice</Label>
                    <Input className="h-8 text-xs" value={notice} onChange={(e) => setNotice(e.target.value)} />
                  </div>
                </div>

                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Offer valid for</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {QUICK_VALIDITY.map((q) => (
                      <button
                        key={q.v}
                        onClick={() => setValidityMin(q.v)}
                        className={`text-[11px] px-2 py-1 rounded border ${
                          validityMin === q.v
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  WhatsApp preview
                </div>
                <div className="rounded-lg p-3" style={{ background: "#075E54" }}>
                  <div
                    className="rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words font-mono"
                    style={{ background: "#DCF8C6", color: "#111", borderRadius: "12px 12px 2px 12px" }}
                  >
                    {message}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={handleCopy}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                  <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={handleSend} disabled={!canSend}>
                    <ExternalLink className="h-3 w-3" /> Send via WhatsApp
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {leadQuotes.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">No quotations sent yet.</div>
      ) : (
        <div className="space-y-1.5">
          {leadQuotes.slice(0, 4).map((q) => {
            const expired =
              q.status === "sent" && new Date(q.validUntilISO).getTime() < Date.now();
            const effective: QuotationStatus = expired ? "expired" : q.status;
            return (
              <div key={q.id} className="rounded border border-border p-2 text-[11px] space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">
                    {q.propertyName} · {q.roomType}
                    {q.roomNumber ? ` #${q.roomNumber}` : ""}
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[effective]}`}>
                    {effective}
                  </Badge>
                </div>
                <div className="text-muted-foreground">
                  {formatINR(q.discountedPrice)} <span className="line-through">{formatINR(q.actualRent)}</span> · prebook {formatINR(q.prebook)}
                  <span className="ml-1">· {new Date(q.sentAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                </div>
                {q.status === "sent" && !expired && (
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => setStatus({ id: q.id, leadId: lead.id, status: "paid" })}>
                      <Check className="h-2.5 w-2.5" /> Paid
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => setStatus({ id: q.id, leadId: lead.id, status: "not-paid" })}>
                      <X className="h-2.5 w-2.5" /> Not paid
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                      onClick={() => setStatus({ id: q.id, leadId: lead.id, status: "cancelled" })}>
                      Cancel
                    </Button>
                  </div>
                )}
                {q.status === "sent" && expired && (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                    onClick={() => setStatus({ id: q.id, leadId: lead.id, status: "expired" })}>
                    Mark expired
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
