import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState, useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, TrendingUp, Users, MapPin, Search, Calendar, ChevronDown, ChevronRight, Medal, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function PerformanceLayout() {
  const { location } = useRouterState();
  const isExact = location.pathname === "/admin/performance";
  if (isExact) return <AdminPerformancePage />;
  return <Outlet />;
}

export const Route = createFileRoute("/admin/performance")({
  component: PerformanceLayout,
});

function getDateRange(preset: string) {
  const end = new Date();
  const start = new Date();
  
  if (preset === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (preset === "this_week") {
    start.setDate(end.getDate() - end.getDay());
    start.setHours(0, 0, 0, 0);
  } else if (preset === "this_month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (preset === "last_30_days") {
    start.setDate(end.getDate() - 30);
  } else if (preset === "all_time") {
    start.setFullYear(2020);
  }
  
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
}

function StatCard({ title, value, icon: Icon, isLoading, prefix = "", suffix = "", trend }: { title: string, value: string | number, icon: any, isLoading: boolean, prefix?: string, suffix?: string, trend?: string }) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="flex items-end gap-3 mt-1">
            <div className="text-2xl font-bold font-display text-foreground">
              {prefix}{value}{suffix}
            </div>
            {trend && (
              <div className="text-[11px] font-medium bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded mb-1 border border-emerald-500/20">
                {trend}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function downloadCSV(data: any[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]).filter(k => k !== 'dailyTrend' && k !== 'perProperty' && k !== 'avatar' && k !== 'userId');
  const csvContent = [
    headers.join(","),
    ...data.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function ExpandableRow({ item, columns, renderExpanded }: { item: any, columns: { key: string, label: string, render?: (v: any) => React.ReactNode }[], renderExpanded: (item: any) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setExpanded(!expanded)}>
        <TableCell className="w-[40px]">
          {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
        </TableCell>
        {columns.map(col => (
          <TableCell key={col.key} className="py-3">
            {col.render ? col.render(item[col.key]) : item[col.key]}
          </TableCell>
        ))}
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/10">
          <TableCell colSpan={columns.length + 1} className="p-0 border-b">
            <div className="p-4 md:p-6 animate-in slide-in-from-top-2">
              {renderExpanded(item)}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function AdminPerformancePage() {
  const [preset, setPreset] = useState("last_30_days");
  const { startDate, endDate } = useMemo(() => getDateRange(preset), [preset]);
  
  const [activeTab, setActiveTab] = useState("tcm");
  const [search, setSearch] = useState("");

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["admin_performance_summary", startDate, endDate],
    queryFn: () => api.performance.summary({ startDate, endDate }),
  });

  const { data: tcmData, isLoading: loadingTCM } = useQuery({
    queryKey: ["admin_performance_tcm", startDate, endDate],
    queryFn: () => api.performance.tcm({ startDate, endDate }),
  });

  const { data: flowopsData, isLoading: loadingFlowOps } = useQuery({
    queryKey: ["admin_performance_flowops", startDate, endDate],
    queryFn: () => api.performance.flowops({ startDate, endDate }),
  });

  const { data: ownersData, isLoading: loadingOwners } = useQuery({
    queryKey: ["admin_performance_propertyowners", startDate, endDate],
    queryFn: () => api.performance.propertyowners({ startDate, endDate }),
  });

  const getFilteredData = (data: any[] | undefined) => {
    if (!data) return [];
    if (!search) return data;
    const lower = search.toLowerCase();
    return data.filter(d => (d.name || '').toLowerCase().includes(lower));
  };

  const filteredTCM = getFilteredData(tcmData);
  const filteredFlowOps = getFilteredData(flowopsData);
  const filteredOwners = getFilteredData(ownersData);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground">Holistic view of organizational performance across all teams</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="w-[160px] h-9 bg-card text-xs">
              <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_30_days">Last 30 Days</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-6">
        {/* Global Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Revenue" value={summary?.totalRevenue?.toLocaleString() ?? 0} prefix="₹" icon={TrendingUp} isLoading={loadingSummary} trend="+12% YoY" />
          <StatCard title="Overall Conversion" value={summary?.overallConversionRate?.toFixed(1) ?? 0} suffix="%" icon={TrendingUp} isLoading={loadingSummary} trend="+2.4%" />
          <StatCard title="Total Bookings" value={summary?.totalBookings ?? 0} icon={Users} isLoading={loadingSummary} trend="+8% vs Last Mo" />
          <StatCard title="Tours Conducted" value={summary?.totalTours ?? 0} icon={MapPin} isLoading={loadingSummary} trend="+15% vs Last Mo" />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-2">
            <TabsList className="bg-transparent h-9 p-0">
              <TabsTrigger value="tcm" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 text-xs font-medium">
                TCMs ({summary?.activeTCMs ?? 0})
              </TabsTrigger>
              <TabsTrigger value="flowops" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 text-xs font-medium">
                Flow Ops ({summary?.activeFlowOps ?? 0})
              </TabsTrigger>
              <TabsTrigger value="owners" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 text-xs font-medium">
                Property Owners ({summary?.activePropertyOwners ?? 0})
              </TabsTrigger>
            </TabsList>
            
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                  placeholder="Search by name..." 
                  className="w-[200px] h-8 pl-8 text-xs bg-card/50" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs"
                onClick={() => {
                  if (activeTab === "tcm") downloadCSV(filteredTCM, "tcm_performance");
                  if (activeTab === "flowops") downloadCSV(filteredFlowOps, "flowops_performance");
                  if (activeTab === "owners") downloadCSV(filteredOwners, "owners_performance");
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
          </div>

          <TabsContent value="tcm" className="mt-0 outline-none space-y-4">
            {tcmData && tcmData.length > 0 && (
              <Card className="bg-card/50 border-border/50 p-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredTCM} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="toursCompleted" name="Tours Completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="bookingsConverted" name="Bookings" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>TCM Name</TableHead>
                    <TableHead className="text-right">Scheduled</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="text-right">Conversion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingTCM ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                  ) : filteredTCM.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">No TCM data found.</TableCell></TableRow>
                  ) : (
                    filteredTCM.sort((a,b) => b.bookingsConverted - a.bookingsConverted).map((tcm, index) => (
                      <ExpandableRow
                        key={tcm.userId}
                        item={tcm}
                        columns={[
                          { key: 'name', label: 'Name', render: (v) => (
                            <div className="font-medium flex items-center gap-2">
                              <img src={tcm.avatar} className="w-6 h-6 rounded-full bg-muted" alt="" />
                              {v}
                              {index === 0 && (
                                <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-500 text-[9px] uppercase tracking-wider font-semibold border border-amber-500/20 shadow-sm">
                                  <Trophy className="w-3 h-3" /> Top Performer
                                </span>
                              )}
                            </div>
                          ) },
                          { key: 'toursScheduled', label: 'Scheduled', render: (v) => <div className="text-right">{v}</div> },
                          { key: 'toursCompleted', label: 'Completed', render: (v) => <div className="text-right font-medium">{v}</div> },
                          { key: 'bookingsConverted', label: 'Bookings', render: (v) => <div className="text-right text-emerald-500 font-semibold">{v}</div> },
                          { key: 'conversionRate', label: 'Conversion', render: (v) => <div className="text-right"><Badge variant={v > 20 ? "default" : "secondary"}>{v.toFixed(1)}%</Badge></div> },
                        ]}
                        renderExpanded={(tcm) => (
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-semibold text-muted-foreground">Detailed Performance</h4>
                              <Link to="/admin/performance/tcm/$userId" params={{ userId: tcm.userId }} search={{ startDate, endDate }} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded hover:bg-primary/20 transition-colors">
                                View Full Profile
                              </Link>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              <Card className="shadow-none border-border/50 bg-background/50"><CardContent className="p-4 flex flex-col items-center justify-center text-center"><div className="text-xs text-muted-foreground mb-1">Cancellations</div><div className="text-xl font-bold text-destructive">{tcm.toursCancelled}</div></CardContent></Card>
                              <Card className="shadow-none border-border/50 bg-background/50"><CardContent className="p-4 flex flex-col items-center justify-center text-center"><div className="text-xs text-muted-foreground mb-1">Leads Handed Off</div><div className="text-xl font-bold">{tcm.leadsHandedOff}</div></CardContent></Card>
                              <Card className="shadow-none border-border/50 bg-background/50"><CardContent className="p-4 flex flex-col items-center justify-center text-center"><div className="text-xs text-muted-foreground mb-1">Avg Tour Duration</div><div className="text-xl font-bold text-blue-500">{tcm.avgTourDuration}m</div></CardContent></Card>
                            </div>
                            {tcm.dailyTrend && tcm.dailyTrend.length > 0 && (
                              <div className="h-48 pt-4 border-t border-border/50">
                                <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Daily Trend</h4>
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={tcm.dailyTrend}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v.slice(5)} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                                    <Line type="monotone" dataKey="toursCompleted" name="Tours" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="bookings" name="Bookings" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </div>
                        )}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="flowops" className="mt-0 outline-none space-y-4">
            {flowopsData && flowopsData.length > 0 && (
              <Card className="bg-card/50 border-border/50 p-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredFlowOps} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="leadsContacted" name="Leads Contacted" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="toursScheduled" name="Tours Scheduled" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
            <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Flow Ops Agent</TableHead>
                    <TableHead className="text-right">Contacted</TableHead>
                    <TableHead className="text-right">Scheduled</TableHead>
                    <TableHead className="text-right">Follow-up Rate</TableHead>
                    <TableHead className="text-right">Conversion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingFlowOps ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                  ) : filteredFlowOps.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">No Flow Ops data found.</TableCell></TableRow>
                  ) : (
                    filteredFlowOps.sort((a,b) => b.toursScheduled - a.toursScheduled).map((fo, index) => (
                      <ExpandableRow
                        key={fo.userId}
                        item={fo}
                        columns={[
                          { key: 'name', label: 'Name', render: (v) => (
                            <div className="font-medium flex items-center gap-2">
                              <img src={fo.avatar} className="w-6 h-6 rounded-full bg-muted" alt="" />
                              {v}
                              {index === 0 && (
                                <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-500 text-[9px] uppercase tracking-wider font-semibold border border-amber-500/20 shadow-sm">
                                  <Medal className="w-3 h-3" /> Most Efficient
                                </span>
                              )}
                            </div>
                          ) },
                          { key: 'leadsContacted', label: 'Contacted', render: (v) => <div className="text-right font-medium">{v}</div> },
                          { key: 'toursScheduled', label: 'Scheduled', render: (v) => <div className="text-right text-emerald-500 font-semibold">{v}</div> },
                          { key: 'followUpRate', label: 'Follow-up Rate', render: (v) => <div className="text-right"><Badge variant="outline">{v.toFixed(1)}%</Badge></div> },
                          { key: 'conversionRate', label: 'Conversion', render: (v) => <div className="text-right"><Badge variant={v > 30 ? "default" : "secondary"}>{v.toFixed(1)}%</Badge></div> },
                        ]}
                        renderExpanded={(fo) => (
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-semibold text-muted-foreground">Detailed Performance</h4>
                              <Link to="/admin/performance/flowops/$userId" params={{ userId: fo.userId }} search={{ startDate, endDate }} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded hover:bg-primary/20 transition-colors">
                                View Full Profile
                              </Link>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              <Card className="shadow-none border-border/50 bg-background/50"><CardContent className="p-4 flex flex-col items-center justify-center text-center"><div className="text-xs text-muted-foreground mb-1">Leads Dropped</div><div className="text-xl font-bold text-destructive">{fo.leadsDropped}</div></CardContent></Card>
                              <Card className="shadow-none border-border/50 bg-background/50"><CardContent className="p-4 flex flex-col items-center justify-center text-center"><div className="text-xs text-muted-foreground mb-1">Avg Response Time</div><div className="text-xl font-bold text-amber-500">{fo.avgResponseTime}h</div></CardContent></Card>
                            </div>
                            {fo.dailyTrend && fo.dailyTrend.length > 0 && (
                              <div className="h-48 pt-4 border-t border-border/50">
                                <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Daily Trend</h4>
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={fo.dailyTrend}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v.slice(5)} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                                    <Line type="monotone" dataKey="leadsContacted" name="Contacted" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="toursScheduled" name="Scheduled" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </div>
                        )}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="owners" className="mt-0 outline-none space-y-4">
            <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Owner Name</TableHead>
                    <TableHead className="text-right">Properties</TableHead>
                    <TableHead className="text-right">Tours</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="text-right">Booking Rate</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingOwners ? (
                    <TableRow><TableCell colSpan={7} className="h-24 text-center"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                  ) : filteredOwners.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground text-sm">No Property Owners found.</TableCell></TableRow>
                  ) : (
                    filteredOwners.sort((a,b) => b.revenueGenerated - a.revenueGenerated).map(owner => (
                      <ExpandableRow
                        key={owner.userId}
                        item={owner}
                        columns={[
                          { key: 'name', label: 'Name', render: (v) => <div className="font-medium flex items-center gap-2"><img src={owner.avatar} className="w-6 h-6 rounded-full bg-muted" alt="" />{v}</div> },
                          { key: 'totalProperties', label: 'Properties', render: (v) => <div className="text-right font-medium">{v}</div> },
                          { key: 'toursReceived', label: 'Tours', render: (v) => <div className="text-right">{v}</div> },
                          { key: 'bookings', label: 'Bookings', render: (v) => <div className="text-right text-emerald-500 font-semibold">{v}</div> },
                          { key: 'bookingRate', label: 'Booking Rate', render: (v) => <div className="text-right"><Badge variant="outline">{v.toFixed(1)}%</Badge></div> },
                          { key: 'revenueGenerated', label: 'Revenue', render: (v) => <div className="text-right font-medium text-emerald-400">₹{v.toLocaleString()}</div> },
                        ]}
                        renderExpanded={(owner) => (
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-semibold text-muted-foreground">Property Overview</h4>
                              <Link to="/admin/performance/propertyowner/$userId" params={{ userId: owner.userId }} search={{ startDate, endDate }} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded hover:bg-primary/20 transition-colors">
                                View Full Profile
                              </Link>
                            </div>
                            <div className="flex gap-4">
                              {owner.pendingApprovals > 0 && (
                                <Badge variant="destructive" className="px-3 py-1 text-xs font-semibold">
                                  {owner.pendingApprovals} Pending Approvals
                                </Badge>
                              )}
                              {owner.propertiesWithZeroTours > 0 && (
                                <Badge variant="secondary" className="px-3 py-1 text-xs font-semibold text-amber-500 border-amber-500/20 bg-amber-500/10">
                                  {owner.propertiesWithZeroTours} Properties with Zero Tours
                                </Badge>
                              )}
                            </div>
                            <div className="border border-border/50 rounded-lg overflow-hidden mt-4">
                              <Table>
                                <TableHeader className="bg-muted/10">
                                  <TableRow>
                                    <TableHead className="text-xs">Property</TableHead>
                                    <TableHead className="text-right text-xs">Tours</TableHead>
                                    <TableHead className="text-right text-xs">Bookings</TableHead>
                                    <TableHead className="text-right text-xs">Occupancy Rate</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {owner.perProperty && owner.perProperty.length > 0 ? (
                                    owner.perProperty.map((p: any) => (
                                      <TableRow key={p.propertyId}>
                                        <TableCell className="font-medium text-xs">{p.propertyName}</TableCell>
                                        <TableCell className="text-right text-xs">{p.tours}</TableCell>
                                        <TableCell className="text-right text-xs">{p.bookings}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">{p.occupancyRate}%</TableCell>
                                      </TableRow>
                                    ))
                                  ) : (
                                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">No properties assigned.</TableCell></TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
