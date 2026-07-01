import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft, TrendingUp, Calendar as CalendarIcon, MapPin } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export const Route = createFileRoute("/admin/performance/tcm/$userId")({
  component: TCMDetail,
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

function TCMDetail() {
  const { userId } = Route.useParams();
  const searchParams = Route.useSearch() as { startDate?: string; endDate?: string };
  const [datePreset, setDatePreset] = useState("this_month");

  const range = getDateRange(datePreset);
  const startDate = range.start || searchParams.startDate;
  const endDate = range.end || searchParams.endDate;

  const { data, isLoading } = useQuery({
    queryKey: ["admin_performance_tcm_detail", userId, startDate, endDate],
    queryFn: () => api.performance.tcmDetail(userId, { startDate, endDate }),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Loading Profile...</h1>
          <p className="text-sm text-muted-foreground">Fetching performance data</p>
        </div>
        <Skeleton className="h-[200px] w-full" /><Skeleton className="h-[400px] w-full" />
      </div>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{data.name}</h1>
          <p className="text-sm text-muted-foreground">TCM · Joined {new Date(data.joinDate).toLocaleDateString()}</p>
        </div>
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
      </div>
      <div className="mb-4">
        <Link to="/admin/performance" search={{ startDate, endDate }} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
          <ArrowLeft size={14} /> Back to Performance Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <StatCard title="Tours Completed" value={data.toursCompleted} vsTeam={data.comparisonToTeamAvg.find((x:any)=>x.metric==='Tours Completed')?.teamAverage} format="number" />
        <StatCard title="Conversion Rate" value={data.conversionRate} vsTeam={data.comparisonToTeamAvg.find((x:any)=>x.metric.includes('Conversion'))?.teamAverage} format="percent" />
        <StatCard title="Bookings" value={data.bookingsConverted} vsTeam={data.comparisonToTeamAvg.find((x:any)=>x.metric==='Bookings')?.teamAverage} format="number" />
        <StatCard title="Cancellations" value={data.toursCancelled} vsTeam={undefined} format="number" />
        <StatCard title="Avg Tour Time" value={data.avgTourDuration} vsTeam={undefined} format="mins" />
        <StatCard title="Leads Rcvd" value={data.leadsReceived} vsTeam={undefined} format="number" />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weeklyTrend} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                <Line yAxisId="left" type="monotone" dataKey="toursCompleted" name="Tours" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="bookings" name="Bookings" stroke="hsl(var(--chart-2))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peak Activity (Hours)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.peakHours.sort((a:any,b:any)=>a.hour.localeCompare(b.hour))} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                <Bar dataKey="toursCount" name="Tours" fill="hsl(var(--accent))" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row justify-between items-center pb-2">
            <CardTitle className="text-base">Tours History</CardTitle>
            <Button size="sm" variant="outline" onClick={() => exportCSV('tours_history', data.toursList)}><Download size={14} className="mr-1"/> Export</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Scheduled At</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.toursList.map((t: any) => (
                  <TableRow key={t.tourId}>
                    <TableCell className="font-medium">{t.propertyName}</TableCell>
                    <TableCell>{t.clientName}</TableCell>
                    <TableCell>{new Date(t.scheduledAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={t.outcome === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : t.outcome === 'cancelled' ? 'bg-destructive/10 text-destructive border-destructive/20' : ''}>
                        {t.outcome}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!data.toursList.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No tours found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row justify-between items-center pb-2">
            <CardTitle className="text-base">Bookings Converted</CardTitle>
            <Button size="sm" variant="outline" onClick={() => exportCSV('bookings_converted', data.bookingsList)}><Download size={14} className="mr-1"/> Export</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bookingsList.map((b: any) => (
                  <TableRow key={b.bookingId}>
                    <TableCell className="font-medium">{b.propertyName}</TableCell>
                    <TableCell>{b.clientName}</TableCell>
                    <TableCell className="font-mono text-emerald-500">₹{b.value.toLocaleString()}</TableCell>
                    <TableCell>{new Date(b.date).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {!data.bookingsList.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No bookings found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function StatCard({ title, value, vsTeam, format }: { title: string, value: number, vsTeam?: number, format: 'number'|'percent'|'mins' }) {
  const formattedValue = format === 'number' ? value.toLocaleString() : format === 'percent' ? `${value.toFixed(1)}%` : `${value}m`;
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
