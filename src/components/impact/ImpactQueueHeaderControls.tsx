import { useEffect, useState } from "react";
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
  CHIP_LABELS,
  type QueueChipFilter,
  type ViewMode,
} from "@/lib/crm10x/impact-queue-prefs";
import {
  Beaker,
  Flame,
  MoreHorizontal,
  Pin,
  SlidersHorizontal,
} from "lucide-react";
import { ImpactFocusInventoryPanel } from "@/components/impact/ImpactFocusInventoryPanel";

export type QueueFilters = {
  chip: QueueChipFilter;
  area: string;
  type: string;
  room: string;
  need: string;
};

const HEAT_OPTIONS: Array<{ key: QueueChipFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "cold", label: "Cold" },
  { key: "overdue", label: "Overdue only" },
];

const SECONDARY_FILTERS: Array<{ key: QueueChipFilter; label: string }> = [
  { key: "tour-today", label: "Tour today" },
  { key: "quote-pending", label: "Quote pending" },
];

function filterSummary(filters: QueueFilters): string {
  const parts = [
    CHIP_LABELS[filters.chip] ?? "All leads",
    filters.area === "all" ? "All areas" : filters.area,
    filters.type === "all" ? "All types" : filters.type,
  ];
  if (filters.room !== "all") parts.push(filters.room);
  if (filters.need !== "all") parts.push(filters.need);
  return parts.join(" • ");
}

function filtersActive(filters: QueueFilters): boolean {
  return (
    filters.chip !== "all" ||
    filters.area !== "all" ||
    filters.type !== "all" ||
    filters.room !== "all" ||
    filters.need !== "all"
  );
}

export function ImpactFiltersPopover({
  filters,
  uniqueAreas,
  onApply,
  onOpenMessageLab,
}: {
  filters: QueueFilters;
  uniqueAreas: string[];
  onApply: (next: QueueFilters) => void;
  onOpenMessageLab: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<QueueFilters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const activeSecondary = SECONDARY_FILTERS.find((item) => item.key === draft.chip);

  const apply = () => {
    onApply(draft);
    setOpen(false);
  };

  const reset = () => {
    const cleared: QueueFilters = {
      chip: "all",
      area: "all",
      type: "all",
      room: "all",
      need: "all",
    };
    setDraft(cleared);
    onApply(cleared);
    setOpen(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 shrink-0 rounded-md border px-2.5 text-[11px] font-medium flex items-center gap-1.5 transition-colors",
              filtersActive(filters)
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/5",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto max-w-[min(92vw,42rem)] p-0">
          <div className="grid divide-x divide-border sm:grid-cols-4">
            <div className="p-3 min-w-[7.5rem]">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Heat
              </p>
              <div className="space-y-2">
                {HEAT_OPTIONS.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center gap-2 text-[11px]"
                  >
                    <Checkbox
                      checked={draft.chip === item.key}
                      onCheckedChange={() => setDraft((prev) => ({ ...prev, chip: item.key }))}
                    />
                    <span className="flex items-center gap-1">
                      {item.key === "hot" ? <Flame className="h-3 w-3 text-danger" /> : null}
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  More
                </p>
                {SECONDARY_FILTERS.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center gap-2 text-[11px]"
                  >
                    <Checkbox
                      checked={draft.chip === item.key}
                      onCheckedChange={() => setDraft((prev) => ({ ...prev, chip: item.key }))}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="p-3 min-w-[8.5rem]">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Location
              </p>
              <Select
                value={draft.area}
                onValueChange={(area) => setDraft((prev) => ({ ...prev, area }))}
              >
                <SelectTrigger className="h-8 text-[11px] bg-background">
                  <SelectValue placeholder="All areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[11px]">All areas</SelectItem>
                  {uniqueAreas.map((area) => (
                    <SelectItem key={area} value={area} className="text-[11px]">{area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Type
              </p>
              <Select
                value={draft.type}
                onValueChange={(type) => setDraft((prev) => ({ ...prev, type }))}
              >
                <SelectTrigger className="h-8 text-[11px] bg-background">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
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

            <div className="p-3 min-w-[8rem]">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Room
              </p>
              <Select
                value={draft.room}
                onValueChange={(room) => setDraft((prev) => ({ ...prev, room }))}
              >
                <SelectTrigger className="h-8 text-[11px] bg-background">
                  <SelectValue placeholder="All rooms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[11px]">All rooms</SelectItem>
                  <SelectItem value="Private" className="text-[11px]">Private</SelectItem>
                  <SelectItem value="Shared" className="text-[11px]">Shared</SelectItem>
                  <SelectItem value="Both" className="text-[11px]">Both</SelectItem>
                  <SelectItem value="Studio" className="text-[11px]">Studio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 min-w-[8rem]">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Needs
              </p>
              <Select
                value={draft.need}
                onValueChange={(need) => setDraft((prev) => ({ ...prev, need }))}
              >
                <SelectTrigger className="h-8 text-[11px] bg-background">
                  <SelectValue placeholder="All needs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[11px]">All needs</SelectItem>
                  <SelectItem value="Boys" className="text-[11px]">Boys</SelectItem>
                  <SelectItem value="Girls" className="text-[11px]">Girls</SelectItem>
                  <SelectItem value="Coed" className="text-[11px]">Coed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "h-7 rounded-md border px-2 text-[10px] font-semibold flex items-center gap-1",
                    activeSecondary
                      ? "border-warning bg-warning/10 text-warning"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <MoreHorizontal className="h-3 w-3" />
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
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={reset}>
                Reset
              </Button>
              <Button size="sm" className="h-7 text-[11px]" onClick={apply}>
                Apply
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
  view: ViewMode;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border/70 bg-background px-3 py-1 text-[10px] text-muted-foreground">
      <span>
        {leadCount} lead{leadCount !== 1 ? "s" : ""} in queue
      </span>
    </div>
  );
}
