import * as fs from "fs";

const file = "src/components/impact/ImpactQueueHeaderControls.tsx";
let content = fs.readFileSync(file, "utf8");

// Add customDateRange to QueueFilters
content = content.replace(
  `  advanced: {`,
  `  customDateRange?: { start: string; end: string };\n  advanced: {`
);

// Replace activeSummary logic
const oldSummaryLogic = `    if (filters.quickFilters.length > 0) parts.push(\`\\\${filters.quickFilters.length} Quick\`);`;
const newSummaryLogic = `    if (filters.quickFilters.length > 0) {
       const labelMap: Record<string, string> = {
         "tour-today": "Tour Today",
         "feedback-missing": "Feedback Missing",
         "quote-pending": "Quote Pending",
         "movein-0-7": "Move-In < 7 Days",
         "no-activity-48h": "No Activity > 48h",
         "property-not-selected": "Property Not Selected",
       };
       if (filters.quickFilters.length === 1) parts.push(labelMap[filters.quickFilters[0]] || "1 Filter");
       else parts.push(\`\${filters.quickFilters.length} Filters\`);
    }`;
content = content.replace(oldSummaryLogic, newSummaryLogic);

// Introduce localFilters state and Apply/Clear buttons
content = content.replace(
  `  const [open, setOpen] = useState(false);`,
  `  const [open, setOpen] = useState(false);\n  const [localFilters, setLocalFilters] = useState<QueueFilters>(filters);\n\n  useEffect(() => {\n    if (open) setLocalFilters(filters);\n  }, [open, filters]);`
);

content = content.replace(
  `  const updateFilter = (updater: (prev: QueueFilters) => QueueFilters) => {\n    onApply(updater(filters));\n  };`,
  `  const updateFilter = (updater: (prev: QueueFilters) => QueueFilters) => {\n    setLocalFilters(updater(localFilters));\n  };`
);

// Update ALL references inside the popover from filters to localFilters
// We will just do a regex replace between <PopoverContent> and </PopoverContent>
// But since the activeSummary should use filters, that's fine.
content = content.replace(/filters\.dateRange/g, "localFilters.dateRange");
content = content.replace(/filters\.status/g, "localFilters.status");
content = content.replace(/filters\.quickFilters/g, "localFilters.quickFilters");
content = content.replace(/filters\.area/g, "localFilters.area");
content = content.replace(/filters\.advanced/g, "localFilters.advanced");
content = content.replace(/filters\.assignment/g, "localFilters.assignment"); // Just in case

// Add Custom Range rendering
const oldDateRange = `                    onClick={() => updateFilter(p => ({ ...p, dateRange: item.k }))}
                    className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors", localFilters.dateRange === item.k ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background text-slate-600 border-border hover:bg-muted")}
                  >
                    {item.l}
                  </button>
                ))}
              </div>
            </div>`;

const newDateRange = `                    onClick={() => updateFilter(p => ({ ...p, dateRange: item.k }))}
                    className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors", localFilters.dateRange === item.k ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background text-slate-600 border-border hover:bg-muted")}
                  >
                    {item.l}
                  </button>
                ))}
                {localFilters.dateRange === "custom" && (
                  <div className="w-full mt-2 flex items-center gap-2">
                    <input type="date" className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
                       value={localFilters.customDateRange?.start || ""}
                       onChange={(e) => updateFilter(p => ({ ...p, customDateRange: { start: e.target.value, end: p.customDateRange?.end || "" } }))}
                    />
                    <span className="text-muted-foreground text-[10px]">to</span>
                    <input type="date" className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
                       value={localFilters.customDateRange?.end || ""}
                       onChange={(e) => updateFilter(p => ({ ...p, customDateRange: { start: p.customDateRange?.start || "", end: e.target.value } }))}
                    />
                  </div>
                )}
              </div>
            </div>`;
// Need to add { k: "custom", l: "Custom Range" } to Date Range array
content = content.replace(
  `{ k: "all", l: "All Time" }`,
  `{ k: "all", l: "All Time" },\n                  { k: "custom", l: "Custom Range" }`
);

content = content.replace(oldDateRange, newDateRange);

// Remove Team Filter block
const teamFilterStart = content.indexOf(`{/* SECTION 2: TEAM FILTER */}`);
const statusFilterStart = content.indexOf(`{/* SECTION 3: STATUS FILTER */}`);
if (teamFilterStart > -1 && statusFilterStart > -1) {
  content = content.substring(0, teamFilterStart) + content.substring(statusFilterStart);
}

// Remove My Leads and Unassigned from Status
content = content.replace(`{ k: "my-leads", l: "My Leads" },\n                  `, "");
content = content.replace(`{ k: "unassigned", l: "Unassigned" },\n                  `, "");

// Change "Advanced Filters" to "More Filters"
content = content.replace(/Advanced Filters/g, "More Filters");

// Move Area block into More Filters
const areaBlockStart = content.indexOf(`{/* SECTION 4: PREFERRED AREA */}`);
const advFilterStart = content.indexOf(`{/* SECTION 5: ADVANCED FILTERS */}`);
if (areaBlockStart > -1 && advFilterStart > -1) {
  const areaBlock = content.substring(areaBlockStart, advFilterStart);
  content = content.substring(0, areaBlockStart) + content.substring(advFilterStart);
  // Insert inside More Filters CollapsibleContent
  const contentStart = content.indexOf(`<CollapsibleContent className="pt-4 space-y-6">`) + `<CollapsibleContent className="pt-4 space-y-6">`.length;
  content = content.substring(0, contentStart) + "\n" + areaBlock + "\n" + content.substring(contentStart);
}

// Add Apply button at the bottom of PopoverContent
const bottomMark = `</Collapsible>
          </div>
        </PopoverContent>`;
const newBottom = `</Collapsible>
            <div className="pt-4 mt-6 border-t border-border flex justify-between items-center pb-2">
              <Button variant="ghost" onClick={() => setLocalFilters(defaultQueueFilters)} className="text-xs">Clear All</Button>
              <Button onClick={() => { onApply(localFilters); setOpen(false); }} className="text-xs px-6">Apply Filters</Button>
            </div>
          </div>
        </PopoverContent>`;
content = content.replace(bottomMark, newBottom);

// Update ImpactTeamCombobox
const oldTeamCombobox = `export function ImpactTeamCombobox({
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
}`;

const newTeamCombobox = `export function ImpactTeamCombobox({
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

  const isSpecific = assignment !== "all" && assignment !== "my-leads" && assignment !== "unassigned";

  return (
    <div className="flex items-center gap-1">
      <Select value={isSpecific ? "specific" : assignment} onValueChange={(val) => {
        if (val === "specific") setOpen(true);
        else onChange(val);
      }}>
        <SelectTrigger className="h-8 w-40 text-[11px] bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-[11px]">All Owners</SelectItem>
          <SelectItem value="my-leads" className="text-[11px]">My Leads</SelectItem>
          <SelectItem value="unassigned" className="text-[11px]">Unassigned</SelectItem>
          {isSpecific && (
            <SelectItem value="specific" className="text-[11px]">
               {tcms.find((t) => t.id === assignment)?.name || "Specific Owner"}
            </SelectItem>
          )}
          {!isSpecific && <SelectItem value="specific" className="text-[11px]">Specific Owner...</SelectItem>}
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="w-0 h-0 overflow-hidden" />
        </PopoverTrigger>
        <PopoverContent className="w-[18rem] p-0 shadow-lg" align="start">
          <Command>
            <CommandInput placeholder="Search owner..." className="h-9 text-[11px]" />
            <CommandEmpty className="text-[11px] py-3 text-center text-muted-foreground">No owner found.</CommandEmpty>
            <CommandList className="max-h-48">
              <CommandGroup>
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
    </div>
  );
}`;

content = content.replace(oldTeamCombobox, newTeamCombobox);

fs.writeFileSync(file, content);
