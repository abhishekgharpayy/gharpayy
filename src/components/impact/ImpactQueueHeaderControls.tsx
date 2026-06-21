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
  ChevronDown
} from "lucide-react";
import { ImpactFocusInventoryPanel } from "@/components/impact/ImpactFocusInventoryPanel";
import { useCRM10x } from "@/lib/crm10x/store";

export type QueueFilters = {
  dateRange: string;
  assignment: string;
  status: string;
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
  dateRange: "all",
  assignment: "all",
  status: "all",
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
  const allObjections = useCRM10x((s) => s.objections);

  // Directly call onApply whenever we want to instantly filter.
  // We can just use the provided `filters` as source of truth.
  
  const updateFilter = (updater: (prev: QueueFilters) => QueueFilters) => {
    onApply(updater(filters));
  };

  const reset = () => {
    onApply(defaultQueueFilters);
  };

  const toggleQuickFilter = (item: string) => {
    updateFilter((prev) => {
      const arr = prev.quickFilters;
      if (arr.includes(item)) {
        return { ...prev, quickFilters: arr.filter((x) => x !== item) };
      }
      return { ...prev, quickFilters: [...arr, item] };
    });
  };

  const toggleAdvancedArray = (key: 'objections' | 'qualification', item: string) => {
    updateFilter((prev) => {
      const arr = prev.advanced[key];
      const newArr = arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
      return { ...prev, advanced: { ...prev.advanced, [key]: newArr } };
    });
  };

  // Compute active filters summary string
  const activeSummary = useMemo(() => {
    const parts = [];
    if (filters.dateRange === "today") parts.push("Today");
    if (filters.dateRange === "yesterday") parts.push("Yesterday");
    if (filters.dateRange === "last7") parts.push("Last 7 Days");
    if (filters.dateRange === "last30") parts.push("Last 30 Days");
    
    if (filters.assignment !== "all") {
       const tcm = tcms?.find(t => t.id === filters.assignment);
       if (tcm?.name) parts.push(tcm.name.split(" ")[0]);
       else parts.push("Assigned");
    }
    
    if (filters.status !== "all") {
       if (filters.status === "my-leads") parts.push("My Leads");
       if (filters.status === "needs-action") parts.push("Needs Action");
       if (filters.status === "at-risk") parts.push("At Risk");
       if (filters.status === "unassigned") parts.push("Unassigned");
       if (filters.status === "booked") parts.push("Booked");
       if (filters.status === "dropped") parts.push("Dropped");
    }
    
    if (filters.quickFilters.length > 0) parts.push(`\${filters.quickFilters.length} Quick`);
    
    return parts.length > 0 ? parts.join(" • ") : "Filters";
  }, [filters, tcms]);

  const [memberOpen, setMemberOpen] = useState(false);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 shrink-0 rounded-md border px-3 text-[11px] font-semibold flex items-center gap-1.5 transition-colors",
              activeSummary !== "Filters"
                ? "border-accent bg-accent/10 text-accent-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/5",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {activeSummary}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(95vw,32rem)] p-0 flex flex-col max-h-[85vh] shadow-xl">
          <div className="p-4 overflow-y-auto space-y-6">
            
            {/* SECTION 1: DATE RANGE */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Date Range</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { k: "today", l: "Today" },
                  { k: "yesterday", l: "Yesterday" },
                  { k: "last7", l: "Last 7 Days" },
                  { k: "last30", l: "Last 30 Days" },
                  { k: "all", l: "All Time" }
                ].map((item) => (
                  <button
                    key={item.k}
                    onClick={() => updateFilter(p => ({ ...p, dateRange: item.k }))}
                    className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors", filters.dateRange === item.k ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background text-slate-600 border-border hover:bg-muted")}
                  >
                    {item.l}
                  </button>
                ))}
              </div>
            </div>

            {/* SECTION 2: TEAM FILTER */}
            {tcms && tcms.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Team Member</p>
                <Popover open={memberOpen} onOpenChange={setMemberOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={memberOpen} className="h-9 w-full justify-between text-xs bg-background">
                      {filters.assignment === "all" ? "All Members" : tcms.find((t) => t.id === filters.assignment)?.name}
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[28rem] p-0 shadow-lg">
                    <Command>
                      <CommandInput placeholder="Search member..." className="h-9 text-xs" />
                      <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">No member found.</CommandEmpty>
                      <CommandList className="max-h-48">
                        <CommandGroup>
                          <CommandItem value="all" onSelect={() => { updateFilter(p => ({ ...p, assignment: "all" })); setMemberOpen(false); }} className="text-xs">
                            <Check className={cn("mr-2 h-3.5 w-3.5", filters.assignment === "all" ? "opacity-100" : "opacity-0")} />
                            All Members
                          </CommandItem>
                          {tcms.map((t) => (
                            <CommandItem key={t.id} value={t.name || t.id} onSelect={() => { updateFilter(p => ({ ...p, assignment: t.id })); setMemberOpen(false); }} className="text-xs">
                              <Check className={cn("mr-2 h-3.5 w-3.5", filters.assignment === t.id ? "opacity-100" : "opacity-0")} />
                              {t.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* SECTION 3: STATUS FILTER */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { k: "all", l: "All Leads" },
                  { k: "my-leads", l: "My Leads" },
                  { k: "needs-action", l: "Needs Action" },
                  { k: "at-risk", l: "At Risk" },
                  { k: "unassigned", l: "Unassigned" },
                  { k: "booked", l: "Booked" },
                  { k: "dropped", l: "Dropped" }
                ].map((item) => (
                  <button
                    key={item.k}
                    onClick={() => updateFilter(p => ({ ...p, status: item.k }))}
                    className={cn("rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors shadow-sm", filters.status === item.k ? "bg-slate-800 text-white border-slate-800 dark:bg-foreground dark:text-background" : "bg-card text-slate-700 border-border hover:bg-muted/50")}
                  >
                    {item.l}
                  </button>
                ))}
              </div>
            </div>

            {/* SECTION 4: QUICK FILTERS */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Quick Interventions</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { k: "tour-today", l: "Tour Today" },
                  { k: "feedback-missing", l: "Feedback Missing" },
                  { k: "quote-pending", l: "Quote Pending" },
                  { k: "movein-0-7", l: "Move-In < 7 Days" },
                  { k: "no-activity-48h", l: "No Activity > 48h" },
                  { k: "property-not-selected", l: "Property Not Selected" }
                ].map((item) => {
                  const active = filters.quickFilters.includes(item.k);
                  return (
                    <button
                      key={item.k}
                      onClick={() => toggleQuickFilter(item.k)}
                      className={cn("rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors", active ? "bg-warning/20 text-warning-foreground border-warning/40 shadow-sm" : "bg-card text-slate-600 border-border hover:bg-muted")}
                    >
                      {item.l}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* SECTION 5: AREA */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Area</p>
              <Select value={filters.area} onValueChange={(area) => updateFilter((prev) => ({ ...prev, area }))}>
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
                    <Select value={filters.advanced.room} onValueChange={(val) => updateFilter(p => ({ ...p, advanced: { ...p.advanced, room: val }}))}>
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
                    <Select value={filters.advanced.type} onValueChange={(val) => updateFilter(p => ({ ...p, advanced: { ...p.advanced, type: val }}))}>
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
                    <Select value={filters.advanced.need} onValueChange={(val) => updateFilter(p => ({ ...p, advanced: { ...p.advanced, need: val }}))}>
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
                        <Checkbox checked={filters.advanced.qualification.includes(opt.k)} onCheckedChange={() => toggleAdvancedArray("qualification", opt.k)} />
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
                      const active = filters.advanced.objections.includes(opt.k);
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
            
            <Button size="sm" variant="ghost" className="h-8 px-4 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={reset}>
              Clear All
            </Button>
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

export function ImpactTeamCombobox({
  assignment,
  tcms,
  onChange,
}: {
  assignment: string;
  tcms: Array<{id: string; name?: string}>;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!tcms || tcms.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-8 w-48 justify-between text-[11px] bg-background">
          {assignment === "all" ? "All Members" : tcms.find((t) => t.id === assignment)?.name}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[18rem] p-0 shadow-lg">
        <Command>
          <CommandInput placeholder="Search member..." className="h-9 text-[11px]" />
          <CommandEmpty className="text-[11px] py-3 text-center text-muted-foreground">No member found.</CommandEmpty>
          <CommandList className="max-h-48">
            <CommandGroup>
              <CommandItem value="all" onSelect={() => { onChange("all"); setOpen(false); }} className="text-[11px]">
                <Check className={cn("mr-2 h-3.5 w-3.5", assignment === "all" ? "opacity-100" : "opacity-0")} />
                All Members
              </CommandItem>
              {tcms.map((t) => (
                <CommandItem key={t.id} value={t.name || t.id} onSelect={() => { onChange(t.id); setOpen(false); }} className="text-[11px]">
                  <Check className={cn("mr-2 h-3.5 w-3.5", assignment === t.id ? "opacity-100" : "opacity-0")} />
                  {t.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
