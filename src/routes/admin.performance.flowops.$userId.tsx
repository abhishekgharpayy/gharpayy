import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/admin/components/AdminShell";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft, Calendar as CalendarIcon, Phone, CheckCircle2, ChevronRight, ChevronDown } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export const Route = createFileRoute("/admin/performance/flowops/$userId")({
  component: FlowOpsDetail,
});

function getDateRange(preset: string) {
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (preset === "today") return { start: start.toISOString(), end: end.toISOString() };
  if (preset === "this_week") { start.setDate(start.getDate() - start.getDay()); return { start: start.toISOString(), end: end.toISOString() }; }
  if (preset === "last_7") { start.setDate(start.getDate() - 7); return { start: start.toISOString(), end: end.toISOString() }; }
  if (preset === "this_month") { start.setDate(1); return { start: start.toISOString(), end: end.toISOString() }; }
  if (preset === "last_30") { start.setDate(start.getDate() - 30); return { start: start.toISOString(), end: end.toISOString() }; }
  return { start: undefined, end: undefined };
}

function FlowOpsDetail() {
  const { userId } = Route.useParams();
  const searchParams = Route.useSearch() as { startDate?: string; endDate?: string };
  const [datePreset, setDatePreset] = useState("this_month");

  const range = getDateRange(datePreset);
  const startDate = range.start || searchParams.startDate;
  const endDate = range.end || searchParams.endDate;

  const { data, isLoading } = useQuery({
    queryKey: ["admin_performance_flowops_detail", userId, startDate, endDate],
    queryFn: () => api.performance.flowopsDetail(userId, { startDate, endDate }),
  });

  if (isLoading || !data) {
    return (
      <AdminShell title="Loading Profile..." sub="Fetching performance data">
        <div className="space-y-4"><Skeleton className="h-[200px] w-full" /><Skeleton className="h-[400px] w-full" /></div>
      </AdminShell>
    );
  }

  const exportCSV = (filename: string, rows: any[]) => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(","),
      ...rows.map(row => keys.map(k => `"${String(row[k]).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${filename}.csv`;
    a.click();
  };

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--emerald-500))', 'hsl(var(--accent))', 'hsl(var(--destructive))'];

  return (
    <AdminShell 
      title={data.name}
      sub={`Flow Ops · Joined ${new Date(data.joinDate).toLocaleDateString()}`}
      actions={
        <div className="flex gap-2 items-center">
          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-[160px] bg-background">
              <CalendarIcon size={14} className="mr-2 opacity-50" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_7">Last 7 Days</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_30">Last 30 Days</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div className="mb-4">
        <Link to="/admin/performance" search={{ startDate, endDate }} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
          <ArrowLeft size={14} /> Back to Performance Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <StatCard title="Leads Contacted" value={data.leadsContacted} vsTeam={data.comparisonToTeamAvg.find((x:any)=>x.metric==='Leads Contacted')?.teamAverage} format="number" />
        <StatCard title="Tours Scheduled" value={data.toursScheduled} vsTeam={undefined} format="number" />
        <StatCard title="Conversion Rate" value={data.conversionRate} vsTeam={data.comparisonToTeamAvg.find((x:any)=>x.metric.includes('Conversion'))?.teamAverage} format="percent" />
        <StatCard title="Leads Dropped" value={data.leadsDropped} vsTeam={undefined} format="number" />
        <StatCard title="Follow-up Rate" value={data.followUpRate} vsTeam={undefined} format="percent" />
        <StatCard title="Avg Response" value={data.avgResponseTime} vsTeam={undefined} format="hours" />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead Sources</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.leadSourceBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="count" label={({source}) => source}>
                  {data.leadSourceBreakdown.map((_:any, index:number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Response Time</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.responseTimeDistribution} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                <Bar dataKey="count" name="Leads" fill="hsl(var(--emerald-500))" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row justify-between items-center pb-2">
            <CardTitle className="text-base">Leads Contacted & Timelines</CardTitle>
            <Button size="sm" variant="outline" onClick={() => exportCSV('leads_contacted', data.leadsList)}><Download size={14} className="mr-1"/> Export</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Lead Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>First Contacted</TableHead>
                  <TableHead>Follow-ups</TableHead>
                  <TableHead>Tour Scheduled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.leadsList.map((l: any) => (
                  <ExpandableLeadRow key={l.leadId} lead={l} timeline={data.followUpTimeline.find((t:any)=>t.leadId===l.leadId)?.contacts} />
                ))}
                {!data.leadsList.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No leads found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

    </AdminShell>
  );
}

function ExpandableLeadRow({ lead, timeline }: { lead: any, timeline?: any[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setExpanded(!expanded)}>
        <TableCell className="w-[40px]">
          {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium">{lead.leadName} <div className="text-[10px] font-normal text-muted-foreground">{lead.phone}</div></TableCell>
        <TableCell className="capitalize">{lead.source}</TableCell>
        <TableCell>{new Date(lead.firstContactedAt).toLocaleDateString()}</TableCell>
        <TableCell className="font-mono">{lead.followUpCount}</TableCell>
        <TableCell>
          <Badge variant="outline" className={lead.tourScheduled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-muted text-muted-foreground'}>
            {lead.tourScheduled ? 'Yes' : 'No'}
          </Badge>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/10">
          <TableCell colSpan={6} className="p-0 border-b">
            <div className="p-4 md:p-6 animate-in slide-in-from-top-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Touchpoint Timeline</h4>
              {timeline && timeline.length > 0 ? (
                <div className="relative border-l border-border ml-2 space-y-4">
                  {timeline.map((t: any, i: number) => (
                    <div key={i} className="pl-6 relative">
                      <div className="absolute w-3 h-3 bg-primary rounded-full -left-[6.5px] top-1" />
                      <div className="text-sm font-medium">{t.response}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <Phone size={10} /> {t.method} · {new Date(t.contactedAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  <div className="pl-6 relative">
                    <div className="absolute w-3 h-3 bg-emerald-500 rounded-full -left-[6.5px] top-1 flex items-center justify-center">
                      <CheckCircle2 size={8} className="text-white" />
                    </div>
                    <div className="text-sm font-medium text-emerald-500">End of records</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No detailed timeline available for this lead.</div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function StatCard({ title, value, vsTeam, format }: { title: string, value: number, vsTeam?: number, format: 'number'|'percent'|'hours' }) {
  const formattedValue = format === 'number' ? value.toLocaleString() : format === 'percent' ? `${value.toFixed(1)}%` : `${value}h`;
  let diffText = null;
  let isGood = true;

  if (vsTeam !== undefined) {
    const diff = value - vsTeam;
    isGood = diff >= 0;
    diffText = diff > 0 ? `+${diff.toFixed(format==='percent'?1:0)}${format==='percent'?'%':''}` : `${diff.toFixed(format==='percent'?1:0)}${format==='percent'?'%':''}`;
  }

  return (
    <div className="bg-card/50 backdrop-blur border border-border p-4 rounded-xl flex flex-col justify-center text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className="text-2xl font-bold font-mono">{formattedValue}</div>
      {vsTeam !== undefined && (
        <div className={`text-[10px] mt-1 ${isGood ? 'text-emerald-500' : 'text-destructive'}`}>
          {diffText} vs team avg
        </div>
      )}
    </div>
  );
}
