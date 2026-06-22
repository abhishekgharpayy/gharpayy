import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft, Calendar as CalendarIcon, MapPin, Building, Activity, Users } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export const Route = createFileRoute("/admin/performance/propertyowner/$userId")({
  component: PropertyOwnerDetail,
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

function PropertyOwnerDetail() {
  const { userId } = Route.useParams();
  const searchParams = Route.useSearch() as { startDate?: string; endDate?: string };
  const [datePreset, setDatePreset] = useState("this_month");

  const range = getDateRange(datePreset);
  const startDate = range.start || searchParams.startDate;
  const endDate = range.end || searchParams.endDate;

  const { data, isLoading } = useQuery({
    queryKey: ["admin_performance_propertyowner_detail", userId, startDate, endDate],
    queryFn: () => api.performance.propertyownerDetail(userId, { startDate, endDate }),
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
          <p className="text-sm text-muted-foreground">Property Owner · Joined {new Date(data.joinDate).toLocaleDateString()}</p>
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
        <StatCard title="Properties" value={data.totalProperties} vsTeam={undefined} format="number" />
        <StatCard title="Tours Rcvd" value={data.toursReceived} vsTeam={undefined} format="number" />
        <StatCard title="Bookings" value={data.bookings} vsTeam={undefined} format="number" />
        <StatCard title="Booking Rate" value={data.bookingRate} vsTeam={data.comparisonToOwnerAvg.find((x:any)=>x.metric.includes('Booking Rate'))?.teamAverage} format="percent" />
        <StatCard title="Total Revenue" value={data.totalRevenue} vsTeam={data.comparisonToOwnerAvg.find((x:any)=>x.metric==='Total Revenue')?.teamAverage} format="currency" />
        <StatCard title="Approvals" value={data.pendingApprovals} vsTeam={undefined} format="number" />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenueByMonth} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${v/1000}k`} />
                <Tooltip formatter={(v: number) => [`₹${v.toLocaleString()}`, 'Revenue']} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--emerald-500))" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Occupancy by Property</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.occupancyByProperty} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="propertyName" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Occupancy Rate']} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                <Bar dataKey="occupancyRate" name="Occupancy Rate" fill="hsl(var(--primary))" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row justify-between items-center pb-2">
            <CardTitle className="text-base">Properties Overview</CardTitle>
            <Button size="sm" variant="outline" onClick={() => exportCSV('properties', data.propertiesList)}><Download size={14} className="mr-1"/> Export</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Tours</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Occupancy</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.propertiesList.sort((a:any,b:any)=>b.revenue-a.revenue).map((p: any) => (
                  <TableRow key={p.propertyId} className={p.tours === 0 ? "bg-amber-500/5 hover:bg-amber-500/10" : ""}>
                    <TableCell className="font-medium">
                      <a href={`/property-owner/properties/${p.propertyId}/rooms`} className="hover:underline flex items-center gap-1">
                        <Building size={12} className="text-muted-foreground" /> {p.name}
                      </a>
                    </TableCell>
                    <TableCell>{p.location}</TableCell>
                    <TableCell className="text-right">{p.tours}</TableCell>
                    <TableCell className="text-right">{p.bookings}</TableCell>
                    <TableCell className="text-right">{p.occupancyRate}%</TableCell>
                    <TableCell className="text-right font-mono text-emerald-500">₹{p.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={p.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : ''}>
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!data.propertiesList.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No properties found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row justify-between items-center pb-2">
            <CardTitle className="text-base">Tours Received</CardTitle>
            <Button size="sm" variant="outline" onClick={() => exportCSV('tours_received', data.toursList)}><Download size={14} className="mr-1"/> Export</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>TCM</TableHead>
                  <TableHead>Scheduled At</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.toursList.map((t: any) => (
                  <TableRow key={t.tourId}>
                    <TableCell className="font-medium">{t.propertyName}</TableCell>
                    <TableCell>{t.clientName}</TableCell>
                    <TableCell>{t.tcmName}</TableCell>
                    <TableCell>{new Date(t.scheduledAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={t.outcome === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : t.outcome === 'cancelled' ? 'bg-destructive/10 text-destructive border-destructive/20' : ''}>
                        {t.outcome}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!data.toursList.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No tours found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function StatCard({ title, value, vsTeam, format }: { title: string, value: number, vsTeam?: number, format: 'number'|'percent'|'currency' }) {
  const formattedValue = format === 'number' ? value.toLocaleString() : format === 'percent' ? `${value.toFixed(1)}%` : `₹${value.toLocaleString()}`;
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
      <div className="text-xl md:text-2xl font-bold font-mono truncate" title={formattedValue}>{formattedValue}</div>
      {vsTeam !== undefined && (
        <div className={`text-[10px] mt-1 ${isGood ? 'text-emerald-500' : 'text-destructive'}`}>
          {diffText} vs avg
        </div>
      )}
    </div>
  );
}
