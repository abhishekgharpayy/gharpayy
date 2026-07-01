import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Beaker,
  MoreHorizontal,
  Pin,
  SlidersHorizontal,
  Check,
  ChevronsUpDown,
  ChevronDown,
  Calendar
} from "lucide-react";
import { ImpactFocusInventoryPanel } from "@/components/impact/ImpactFocusInventoryPanel";
import { useCRM10x } from "@/lib/crm10x/store";
import type { ActiveView } from "./impact-queue-types";

export type QueueFilters = {
  activeView: ActiveView;
  dateRange: string;
  customDate?: string;
  quickFilters: string[];
  area: string;
  advanced: {
    type: string;
    room: string;
    need: string;
    objections: string[];
    qualification: string[];
  };
};

export const defaultQueueFilters: QueueFilters = {
  activeView: "all",
  dateRange: "all",
  quickFilters: [],
  area: "all",
  advanced: {
    type: "all",
    room: "all",
    need: "all",
    objections: [],
    qualification: [],
  }
};

export function ImpactFiltersPopover({
  filters,
  uniqueAreas,
  onApply,
  onOpenMessageLab,
  tcms
}: {
  filters: QueueFilters;
  uniqueAreas: string[];
  onApply: (next: QueueFilters) => void;
  onOpenMessageLab: () => void;
  tcms?: Array<{id: string; name?: string}>;
}) {
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<QueueFilters>(filters);

  useEffect(() => {
    if (open) setLocalFilters(filters);
  }, [open, filters]);
  const allObjections = useCRM10x((s) => s.objections);

  const updateFilter = (updater: (prev: QueueFilters) => QueueFilters) => {
    setLocalFilters(updater(localFilters!));
  };

  const applyChanges = () => {
    onApply(localFilters);
    setOpen(false);
  };

  const reset = () => {
    onApply({ ...defaultQueueFilters, activeView: filters.activeView });
    setOpen(false);
  };

  const toggleAdvancedArray = (key: 'objections' | 'qualification', item: string) => {
    updateFilter((prev) => {
      const arr = prev.advanced[key];
      const newArr = arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
      return { ...prev, advanced: { ...prev.advanced, [key]: newArr } };
    });
  };

  const [memberOpen, setMemberOpen] = useState(false);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 shrink-0 rounded-md border px-3 text-[11px] font-semibold flex items-center gap-1.5 transition-colors border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">More Filters</span>
            <span className="sm:hidden">Filters</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(95vw,32rem)] p-0 flex flex-col max-h-[85vh] shadow-xl">
          <div className="p-4 overflow-y-auto space-y-6">
            
            {/* SECTION 1: AREA */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Area</p>
              <Select value={localFilters.area} onValueChange={(area) => updateFilter((prev) => ({ ...prev, area }))}>
                <SelectTrigger className="h-9 text-[11px] bg-background"><SelectValue placeholder="All areas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[11px]">All areas</SelectItem>
                  {uniqueAreas.map((area) => (
                    <SelectItem key={area} value={area} className="text-[11px]">{area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ADVANCED FILTERS */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                  Advanced Filters
                  <ChevronDown className="h-4 w-4" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Room</p>
                    <Select value={localFilters.advanced.room} onValueChange={(val) => updateFilter(p => ({ ...p, advanced: { ...p.advanced, room: val }}))}>
                      <SelectTrigger className="h-8 text-[11px] bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-[11px]">All rooms</SelectItem>
                        <SelectItem value="Private" className="text-[11px]">Private</SelectItem>
                        <SelectItem value="Shared" className="text-[11px]">Shared</SelectItem>
                        <SelectItem value="Both" className="text-[11px]">Both</SelectItem>
                        <SelectItem value="Studio" className="text-[11px]">Studio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</p>
                    <Select value={localFilters.advanced.type} onValueChange={(val) => updateFilter(p => ({ ...p, advanced: { ...p.advanced, type: val }}))}>
                      <SelectTrigger className="h-8 text-[11px] bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-[11px]">All types</SelectItem>
                        <SelectItem value="Student" className="text-[11px]">Student</SelectItem>
                        <SelectItem value="Working" className="text-[11px]">Working</SelectItem>
                        <SelectItem value="Intern" className="text-[11px]">Intern</SelectItem>
                        <SelectItem value="Family" className="text-[11px]">Family</SelectItem>
                        <SelectItem value="Other" className="text-[11px]">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Needs</p>
                    <Select value={localFilters.advanced.need} onValueChange={(val) => updateFilter(p => ({ ...p, advanced: { ...p.advanced, need: val }}))}>
                      <SelectTrigger className="h-8 text-[11px] bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-[11px]">All needs</SelectItem>
                        <SelectItem value="Boys" className="text-[11px]">Boys</SelectItem>
                        <SelectItem value="Girls" className="text-[11px]">Girls</SelectItem>
                        <SelectItem value="Coed" className="text-[11px]">Coed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deep Profile & Qualification</p>
                  <div className="space-y-2">
                    {[
                      { k: "profile-complete", l: "Deep Profile Complete" },
                      { k: "profile-incomplete", l: "Deep Profile Incomplete" },
                      { k: "budget-verified", l: "Budget Verified" },
                      { k: "budget-unverified", l: "Budget Unverified" }
                    ].map(opt => (
                      <label key={opt.k} className="flex cursor-pointer items-start gap-2 text-[11px] font-medium leading-tight">
                        <Checkbox checked={localFilters.advanced.qualification.includes(opt.k)} onCheckedChange={() => toggleAdvancedArray("qualification", opt.k)} />
                        {opt.l}
                      </label>
                    ))}
                  </div>
                </div>
                
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Objections</p>
                  <div className="flex flex-wrap gap-2.5">
                    {[
                      { k: "food-not-available", l: "Food" },
                      { k: "price-too-high", l: "Budget" },
                      { k: "location-not-suitable", l: "Distance" },
                      { k: "room-too-small", l: "Room" },
                      { k: "needs-family-approval", l: "Parent" },
                      { k: "other", l: "Other" }
                    ].map(opt => {
                      const active = localFilters.advanced.objections.includes(opt.k);
                      return (
                        <button 
                          key={opt.k}
                          onClick={() => toggleAdvancedArray("objections", opt.k)}
                          className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors", active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background text-muted-foreground hover:bg-muted")}
                        >
                          {opt.l}
                        </button>
                      )
                    })}
                  </div>
                </div>

              </CollapsibleContent>
            </Collapsible>

          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 bg-muted/20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 rounded-md border border-border bg-background px-3 text-[11px] font-semibold flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Tools
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Queue extras
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={(event) => {
                    event.preventDefault();
                    setOpen(false);
                    onOpenMessageLab();
                  }}
                >
                  <Beaker className="mr-1 h-3 w-3 text-accent" />
                  Message lab
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-8 px-4 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={reset}>
                Clear All
              </Button>
              <Button size="sm" className="h-8 px-4 text-xs font-semibold shadow-sm" onClick={applyChanges}>
                Apply Filters
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ImpactFocusPopover({
  tcmFilter,
  tcmOptions,
  onFilterArea,
}: {
  tcmFilter: string;
  tcmOptions: Array<{ id: string; fullName?: string; name?: string; zone?: string; zones?: string[] }>;
  onFilterArea?: (area: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 shrink-0 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/5 flex items-center gap-1.5 transition-colors"
        >
          <Pin className="h-3.5 w-3.5 text-accent" />
          <span className="hidden sm:inline">Today&apos;s focus</span>
          <span className="sm:hidden">Focus</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,24rem)] p-3">
        <ImpactFocusInventoryPanel
          tcmFilter={tcmFilter}
          tcmOptions={tcmOptions}
          onPropertyTap={(area) => {
            onFilterArea?.(area);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function ImpactQueueMetaBar({
  leadCount,
  view,
}: {
  leadCount: number;
  view: string;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border/70 bg-background px-3 py-1 text-[10px] text-muted-foreground">
      <span>
        {leadCount} lead{leadCount !== 1 ? "s" : ""} in queue
      </span>
    </div>
  );
}

export function ImpactDateDropdown({
  filters,
  onChange,
}: {
  filters: QueueFilters;
  onChange: (dateRange: string, customDate?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customVal, setCustomVal] = useState(filters.customDate || "");

  const getLabel = () => {
    switch (filters.dateRange) {
      case "today": return "Today";
      case "yesterday": return "Yesterday";
      case "last7": return "Last 7 Days";
      case "custom": return "Custom Range";
      default: return "All Time";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-8 rounded-md border border-border bg-background px-3 text-[11px] font-semibold flex items-center gap-1.5 transition-colors text-muted-foreground hover:bg-muted/50 hover:text-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {getLabel()}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <div className="flex flex-col">
          {[
            { k: "all", l: "All Time" },
            { k: "today", l: "Today" },
            { k: "yesterday", l: "Yesterday" },
            { k: "last7", l: "Last 7 Days" },
            { k: "custom", l: "Custom Range" },
          ].map(opt => (
            <div key={opt.k} className="flex flex-col">
              <button
                className={cn("flex items-center px-2 py-1.5 text-sm rounded-sm hover:bg-muted text-left", filters.dateRange === opt.k && "bg-muted font-medium")}
                onClick={() => {
                  if (opt.k !== "custom") {
                    onChange(opt.k);
                    setOpen(false);
                  } else {
                    onChange("custom", customVal);
                  }
                }}
              >
                {opt.l}
              </button>
              {opt.k === "custom" && filters.dateRange === "custom" && (
                <div className="p-2 border-t mt-1 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-8">From</span>
                    <input type="date" value={customVal.split(":")[0] || ""} onChange={(e) => {
                      const to = customVal.split(":")[1] || "";
                      const newVal = `${e.target.value}:${to}`;
                      setCustomVal(newVal);
                      onChange("custom", newVal);
                    }} className="h-8 w-full rounded-md border border-input text-xs px-2 bg-background" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-8">To</span>
                    <input type="date" value={customVal.split(":")[1] || ""} onChange={(e) => {
                      const from = customVal.split(":")[0] || "";
                      const newVal = `${from}:${e.target.value}`;
                      setCustomVal(newVal);
                      onChange("custom", newVal);
                    }} className="h-8 w-full rounded-md border border-input text-xs px-2 bg-background" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ImpactQueueSwitcher({
  activeView,
  counts,
  onChange
}: {
  activeView: ActiveView;
  counts: Record<ActiveView, number>;
  onChange: (view: ActiveView) => void;
}) {
  const views: { k: ActiveView; l: string }[] = [
    { k: "all", l: "All Leads" },
    { k: "tours-today", l: "Tours Today" },
    { k: "feedback-missing", l: "Feedback Missing" },
    { k: "quote-pending", l: "Quote Pending" },
    { k: "movein-0-7", l: "Move-In < 7 Days" },
    { k: "no-activity-48h", l: "No Activity > 48h" },
  ];

  return (
    <div className="flex flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
      {views.map((v) => {
         const active = activeView === v.k;
         return (
           <button
             key={v.k}
             onClick={() => onChange(v.k)}
             className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors shadow-sm", active ? "bg-slate-800 text-white border-slate-800 dark:bg-foreground dark:text-background" : "bg-card text-slate-600 border-border hover:bg-muted hover:text-foreground")}
           >
             {v.l} ({counts[v.k] ?? 0})
           </button>
         );
      })}
    </div>
  );
}

export function ImpactActiveFiltersSummary({ filters, tcms }: { filters: QueueFilters, tcms?: Array<{id: string; name?: string}> }) {
  const parts: string[] = [];

  if (filters.dateRange !== "all") {
    const dr = {
      today: "Today",
      yesterday: "Yesterday",
      last7: "Last 7 Days",
      custom: `Range: ${filters.customDate?.replace(":", " to ")}`,
    }[filters.dateRange];
    if (dr) parts.push(dr);
  }

  if (filters.area !== "all") {
    parts.push(filters.area);
  }

  const adv = filters.advanced;
  if (adv.type !== "all") parts.push(`Type: ${adv.type}`);
  if (adv.room !== "all") parts.push(`Room: ${adv.room}`);
  if (adv.need !== "all") parts.push(`Need: ${adv.need}`);
  if (adv.qualification.length > 0) parts.push(`${adv.qualification.length} Qual. Filters`);
  if (adv.objections.length > 0) parts.push(`${adv.objections.length} Objections`);

  if (parts.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium truncate max-w-[300px]">
      <span className="truncate">{parts.join(" • ")}</span>
    </div>
  );
}

