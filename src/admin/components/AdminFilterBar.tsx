import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { X, ChevronDown, ChevronUp, Check } from "lucide-react";
import type { AdminFilters } from "@/admin/lib/filter-schema";
import { defaultAdminFilters } from "@/admin/lib/filter-schema";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

interface Props {
  filters: AdminFilters;
  onChange: (f: AdminFilters) => void;
  tcms: Array<{ id: string; name: string; zone?: string; zones?: string[] }>;
  sources?: string[];
  stages?: string[];
  addedByOptions?: string[];
}

const STAGES = ["new", "contacted", "tour-scheduled", "tour-done", "negotiation", "booked", "dropped"];
const STATUSES: Array<"open" | "booked" | "lost" | "dormant"> = ["open", "booked", "lost", "dormant"];
const BUCKETS: Array<"cold" | "warm" | "hot"> = ["cold", "warm", "hot"];

export function AdminFilterBar({ filters, onChange, tcms, sources = [], stages = STAGES, addedByOptions = [] }: Props) {
  const [savedViewName, setSavedViewName] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  const { data: usersData } = useQuery({
    queryKey: ["admin_users_lite"],
    queryFn: () => api.users.listLite(),
  });
  
  const usersList = usersData?.items || [];
  const usersMap = useMemo(() => {
    const map = new Map<string, string>();
    usersList.forEach(u => map.set(u._id, u.name));
    return map;
  }, [usersList]);

  const addedByLabels = useMemo(() => {
    const labels: Record<string, string> = { system: "System" };
    addedByOptions.forEach(id => {
      if (id !== "system") labels[id] = usersMap.get(id) || id;
    });
    return labels;
  }, [addedByOptions, usersMap]);

  const zones = useMemo(() => {
    const allZones = new Set<string>();
    tcms.forEach(t => {
      if (t.zone) allZones.add(t.zone);
      if (t.zones) t.zones.forEach(z => allZones.add(z));
    });
    return Array.from(allZones).sort();
  }, [tcms]);

  const deduplicatedTcms = useMemo(() => {
    const map = new Map<string, typeof tcms[0]>();
    tcms.forEach(t => map.set(t.id, t));
    return Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
  }, [tcms]);

  const tcmLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    deduplicatedTcms.forEach(t => labels[t.id] = t.name);
    return labels;
  }, [deduplicatedTcms]);
  const tcmIds = useMemo(() => deduplicatedTcms.map(t => t.id), [deduplicatedTcms]);

  const toggle = <K extends keyof AdminFilters>(key: K, value: string) => {
    const cur = filters[key] as unknown as string[];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...filters, [key]: next });
  };

  const reset = () => onChange(defaultAdminFilters);

  const saveView = () => {
    if (!savedViewName.trim()) return;
    const views: Record<string, AdminFilters> = JSON.parse(localStorage.getItem("admin.views") ?? "{}");
    views[savedViewName] = filters;
    localStorage.setItem("admin.views", JSON.stringify(views));
    setSavedViewName("");
  };

  const savedViews: Record<string, AdminFilters> = useMemo(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("admin.views") ?? "{}");
    } catch {
      return {};
    }
  }, []);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.stage?.length) count++;
    if (filters.status?.length) count++;
    if (filters.probBucket?.length) count++;
    if (filters.assignedTo?.length) count++;
    if (filters.zone?.length) count++;
    if (filters.source?.length) count++;
    if (filters.dormant?.length) count++;
    if (filters.dateAdded?.length) count++;
    if (filters.addedBy?.length) count++;
    if (filters.hasVisit !== undefined) count++;
    if (filters.booked !== undefined) count++;
    return count;
  }, [filters]);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-xl border border-border bg-card/60 shadow-sm"
    >
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 flex items-center gap-1.5 px-2 hover:bg-muted/50">
              <span className="text-sm font-semibold">Filters</span>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </Button>
          </CollapsibleTrigger>
          {activeFiltersCount > 0 && (
            <span className="bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full border border-primary/20">
              {activeFiltersCount} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Input
            placeholder="Search by name, phone, area, TCM…"
            value={filters.q}
            onChange={(e) => onChange({ ...filters, q: e.target.value })}
            className="h-8 w-[240px] text-xs bg-background"
          />
          {activeFiltersCount > 0 && (
            <button onClick={reset} className="text-xs text-destructive hover:underline font-medium px-2">
              Reset all
            </button>
          )}
        </div>
      </div>

      <CollapsibleContent className="p-4 space-y-4">
        {/* Top Controls: Sort & Saved Views */}
        <div className="flex items-center gap-3 justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold w-28 flex-shrink-0">Sort By</span>
            <Select value={filters.sort} onValueChange={(v) => onChange({ ...filters, sort: v })}>
              <SelectTrigger className="h-8 w-[180px] text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated:desc">Last updated</SelectItem>
                <SelectItem value="prob:desc">Probability ↓</SelectItem>
                <SelectItem value="prob:asc">Probability ↑</SelectItem>
                <SelectItem value="value:desc">Expected ₹ ↓</SelectItem>
                <SelectItem value="name:asc">Name A→Z</SelectItem>
                <SelectItem value="stage:asc">Stage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Input
              placeholder="Save view as…"
              value={savedViewName}
              onChange={(e) => setSavedViewName(e.target.value)}
              className="h-8 w-40 text-xs bg-background"
            />
            <Button size="sm" variant="outline" onClick={saveView} className="h-8 text-xs bg-background">
              Save View
            </Button>
            {Object.keys(savedViews).length > 0 && (
              <Select onValueChange={(v) => onChange(savedViews[v])}>
                <SelectTrigger className="h-8 w-36 text-xs bg-background">
                  <SelectValue placeholder="Load View…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(savedViews).map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Filter Rows as Dropdowns in Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <DropdownFilterRow label="STAGE" values={stages} active={filters.stage} onToggle={(v) => toggle("stage", v)} />
          <DropdownFilterRow label="STATUS" values={STATUSES} active={filters.status} onToggle={(v) => toggle("status", v)} />
          <DropdownFilterRow label="PROBABILITY" values={BUCKETS} active={filters.probBucket} onToggle={(v) => toggle("probBucket", v)} />
          {tcmIds.length > 0 && (
            <DropdownFilterRow label="TCM" values={tcmIds} labels={tcmLabels} active={filters.assignedTo} onToggle={(v) => toggle("assignedTo", v)} />
          )}
          <DropdownFilterRow label="ZONE" values={zones} active={filters.zone} onToggle={(v) => toggle("zone", v)} />
          {sources.length > 0 && (
            <DropdownFilterRow label="SOURCE" values={sources} active={filters.source} onToggle={(v) => toggle("source", v)} />
          )}
          <DropdownFilterRow label="DORMANT" values={["30d", "60d", "90d"]} active={filters.dormant} onToggle={(v) => toggle("dormant", v)} />
          <DropdownFilterRow label="DATE ADDED" values={["today", "yesterday", "this-week", "this-month"]} active={filters.dateAdded || []} onToggle={(v) => toggle("dateAdded", v)} />
          {addedByOptions.length > 0 && (
            <DropdownFilterRow label="ADDED BY" values={addedByOptions} labels={addedByLabels} active={filters.addedBy || []} onToggle={(v) => toggle("addedBy", v)} />
          )}
          
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">QUICK</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Chip label="Has visit" isActive={filters.hasVisit === true} onClick={() => onChange({ ...filters, hasVisit: filters.hasVisit === true ? undefined : true })} />
              <Chip label="Booked" isActive={filters.booked === true} onClick={() => onChange({ ...filters, booked: filters.booked === true ? undefined : true })} />
              <Chip label="Not booked" isActive={filters.booked === false} onClick={() => onChange({ ...filters, booked: filters.booked === false ? undefined : false })} />
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DropdownFilterRow({
  label,
  values,
  active,
  onToggle,
  labels,
}: {
  label: string;
  values: readonly string[] | string[];
  active: readonly string[] | undefined;
  onToggle: (v: string) => void;
  labels?: Record<string, string>;
}) {
  if (!values.length) return null;
  const activeArr = active || [];
  
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Active pills */}
        {activeArr.map(v => (
          <div key={v} className="flex items-center gap-1 bg-primary text-primary-foreground border border-primary rounded-full pl-3 pr-1 py-1 text-xs font-medium shadow-sm">
            <span>{labels?.[v] ?? v}</span>
            <button 
              onClick={() => onToggle(v)}
              className="hover:bg-primary-foreground/20 rounded-full p-0.5 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        
        {/* Select trigger */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs rounded-full px-3 bg-background hover:border-primary/50 hover:text-primary">
              Select {label.toLowerCase()} ▾
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <Command>
              <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="text-xs" />
              <CommandList>
                <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No results found.</CommandEmpty>
                <CommandGroup>
                  {values.map(v => {
                    const name = labels?.[v] ?? v;
                    const isSelected = activeArr.includes(v);
                    return (
                      <CommandItem
                        key={v}
                        value={name}
                        onSelect={() => onToggle(v)}
                        className="text-xs cursor-pointer"
                      >
                        <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                          <Check className={cn("h-3 w-3")} />
                        </div>
                        {name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function Chip({ label, isActive, onClick }: { label: string; isActive?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-xs rounded-full px-3 py-1 transition-colors cursor-pointer",
        isActive
          ? "bg-primary text-primary-foreground font-medium border border-primary shadow-sm"
          : "border border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary"
      )}
    >
      {label}
    </button>
  );
}
