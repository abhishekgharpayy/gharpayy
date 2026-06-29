import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Cell, LabelList, CartesianGrid, Tooltip } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Download, TrendingUp, TrendingDown, Users, MapPin, Search, Calendar as CalendarIcon, RefreshCw, ChevronUp, ChevronDown, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

function PerformanceLayout() {
  const { location } = useRouterState();
  const isExact = location.pathname === "/admin/performance";
  if (isExact) return <AdminPerformancePage />;
  return <Outlet />;
}

export const Route = createFileRoute("/admin/performance")({
  component: PerformanceLayout,
});

// Sparkline dummy data generator based on value
const generateSparkline = (base: number) => {
  return Array.from({ length: 7 }).map((_, i) => ({
    val: base * (0.8 + Math.random() * 0.4)
  }));
};

function AnimatedStat({ value, isCurrency = false, isPercent = false }: { value: number, isCurrency?: boolean, isPercent?: boolean }) {
  const animatedValue = useCountUp(value, 800);
  
  if (isCurrency) {
    return <>₹{Math.round(animatedValue).toLocaleString("en-IN")}</>;
  }
  if (isPercent) {
    return <>{animatedValue.toFixed(1)}%</>;
  }
  return <>{Math.round(animatedValue).toLocaleString("en-IN")}</>;
}

function StatTile({ title, value, icon: Icon, color, trend, trendValue, isCurrency, isPercent, isLoading }: any) {
  const colors: Record<string, string> = {
    amber: "text-amber-500 bg-amber-50 border-amber-200",
    indigo: "text-indigo-500 bg-indigo-50 border-indigo-200",
    emerald: "text-emerald-500 bg-emerald-50 border-emerald-200",
    rose: "text-rose-500 bg-rose-50 border-rose-200",
  };
  
  const iconColors: Record<string, string> = {
    amber: "text-amber-500 bg-amber-500/10",
    indigo: "text-indigo-500 bg-indigo-500/10",
    emerald: "text-emerald-500 bg-emerald-500/10",
    rose: "text-rose-500 bg-rose-500/10",
  };
  
  const sparklineColors: Record<string, string> = {
    amber: "#F59E0B", indigo: "#6366F1", emerald: "#10B981", rose: "#F43F5E"
  };

  const sparklineData = useMemo(() => generateSparkline(value), [value]);

  return (
    <Card className="p-5 border-[#E8E3DC] bg-white rounded-xl shadow-sm overflow-hidden relative">
      <div className="flex justify-between items-start mb-2">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{title}</div>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", iconColors[color])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      
      <div className="text-3xl font-bold text-gray-900 mb-2">
        {isLoading ? <Skeleton className="h-8 w-24" /> : <AnimatedStat value={value} isCurrency={isCurrency} isPercent={isPercent} />}
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Skeleton className="h-5 w-16 rounded-full" />
          ) : (
            <div className={cn("rounded-full px-2 py-0.5 text-xs font-medium flex items-center gap-1", trend === 'up' ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
              {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trendValue}
            </div>
          )}
          <span className="text-xs text-gray-400">vs last period</span>
        </div>
        
        {!isLoading && (
          <div className="w-20 h-7">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line type="monotone" dataKey="val" stroke={sparklineColors[color]} strokeWidth={2} dot={false} isAnimationActive={true} animationDuration={1000} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

function AdminPerformancePage() {
  const queryClient = useQueryClient();
  const [dateRangeTab, setDateRangeTab] = useState<"7D" | "30D" | "90D" | "Custom">("30D");
  const [customDate, setCustomDate] = useState<DateRange | undefined>({ from: subDays(new Date(), 30), to: new Date() });
  
  const [activeTab, setActiveTab] = useState<"tcm" | "flowops" | "owners">("tcm");
  const [search, setSearch] = useState("");
  const [metricSort, setMetricSort] = useState<{ key: string, dir: 'asc'|'desc' }>({ key: 'bookings', dir: 'desc' });
  const [page, setPage] = useState(1);
  const itemsPerPage = 15;
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [topChartMetric, setTopChartMetric] = useState("bookings");

  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const dateParams = useMemo(() => {
    const end = new Date();
    let start = new Date();
    if (dateRangeTab === "7D") start = subDays(end, 7);
    else if (dateRangeTab === "30D") start = subDays(end, 30);
    else if (dateRangeTab === "90D") start = subDays(end, 90);
    else if (dateRangeTab === "Custom" && customDate?.from && customDate?.to) {
      start = customDate.from;
      end.setTime(customDate.to.getTime());
    }
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [dateRangeTab, customDate]);

  const { data: summary, isLoading: loadingSummary, isFetching: fetchingSummary } = useQuery({
    queryKey: ["admin_perf_summary", dateParams.startDate, dateParams.endDate],
    queryFn: () => api.performance.summary(dateParams),
    staleTime: 60000,
  });

  const { data: tcmData, isLoading: loadingTCM, isFetching: fetchingTCM } = useQuery({
    queryKey: ["admin_perf_tcm", dateParams.startDate, dateParams.endDate],
    queryFn: () => api.performance.tcm(dateParams),
    staleTime: 60000,
  });

  const { data: flowopsData, isLoading: loadingFlowOps, isFetching: fetchingFlowOps } = useQuery({
    queryKey: ["admin_perf_flowops", dateParams.startDate, dateParams.endDate],
    queryFn: () => api.performance.flowops(dateParams),
    staleTime: 60000,
  });

  const { data: ownersData, isLoading: loadingOwners, isFetching: fetchingOwners } = useQuery({
    queryKey: ["admin_perf_owners", dateParams.startDate, dateParams.endDate],
    queryFn: () => api.performance.propertyowners(dateParams),
    staleTime: 60000,
  });
  
  const isRefetching = fetchingSummary || fetchingTCM || fetchingFlowOps || fetchingOwners;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin_perf_summary"] });
    queryClient.invalidateQueries({ queryKey: ["admin_perf_tcm"] });
    queryClient.invalidateQueries({ queryKey: ["admin_perf_flowops"] });
    queryClient.invalidateQueries({ queryKey: ["admin_perf_owners"] });
    setLastUpdated(new Date());
  };

  const getActiveData = () => {
    if (activeTab === "tcm") return (tcmData || []).map(d => ({ ...d, role: 'TCM' }));
    if (activeTab === "flowops") return (flowopsData || []).map(d => ({ ...d, role: 'Flow Ops' }));
    if (activeTab === "owners") return (ownersData || []).map(d => ({ ...d, role: 'Owner' }));
    return [];
  };

  const processedData = useMemo(() => {
    let data = getActiveData();
    if (search) {
      const lower = search.toLowerCase();
      data = data.filter(d => (d.name || '').toLowerCase().includes(lower));
    }
    
    // Default mapping for sorting
    data.sort((a: any, b: any) => {
      let valA = a[metricSort.key] || 0;
      let valB = b[metricSort.key] || 0;
      
      // Map generic keys to specific tab keys for unified sorting
      if (metricSort.key === 'leads') {
        valA = a.leadsHandedOff ?? a.leadsContacted ?? a.totalProperties ?? 0;
        valB = b.leadsHandedOff ?? b.leadsContacted ?? b.totalProperties ?? 0;
      }
      if (metricSort.key === 'tours') {
        valA = a.toursCompleted ?? a.toursScheduled ?? a.toursReceived ?? 0;
        valB = b.toursCompleted ?? b.toursScheduled ?? b.toursReceived ?? 0;
      }
      if (metricSort.key === 'conversion') {
        valA = a.conversionRate ?? a.bookingRate ?? 0;
        valB = b.conversionRate ?? b.bookingRate ?? 0;
      }
      if (metricSort.key === 'bookings') {
        valA = a.bookingsConverted ?? a.bookings ?? 0;
        valB = b.bookingsConverted ?? b.bookings ?? 0;
      }
      
      if (valA < valB) return metricSort.dir === 'asc' ? -1 : 1;
      if (valA > valB) return metricSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    
    return data;
  }, [tcmData, flowopsData, ownersData, activeTab, search, metricSort]);

  const paginatedData = processedData.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const totalPages = Math.ceil(processedData.length / itemsPerPage);

  const top10 = useMemo(() => {
    const data = [...getActiveData()];
    data.sort((a: any, b: any) => {
      let valA = a[topChartMetric] || 0;
      let valB = b[topChartMetric] || 0;
      
      if (topChartMetric === 'leads') {
        valA = a.leadsHandedOff ?? a.leadsContacted ?? a.totalProperties ?? 0;
        valB = b.leadsHandedOff ?? b.leadsContacted ?? b.totalProperties ?? 0;
      }
      if (topChartMetric === 'tours') {
        valA = a.toursCompleted ?? a.toursScheduled ?? a.toursReceived ?? 0;
        valB = b.toursCompleted ?? b.toursScheduled ?? b.toursReceived ?? 0;
      }
      if (topChartMetric === 'conversion') {
        valA = a.conversionRate ?? a.bookingRate ?? 0;
        valB = b.conversionRate ?? b.bookingRate ?? 0;
      }
      if (topChartMetric === 'bookings') {
        valA = a.bookingsConverted ?? a.bookings ?? 0;
        valB = b.bookingsConverted ?? b.bookings ?? 0;
      }
      
      return valB - valA;
    });
    return data.slice(0, 10).map((d: any) => {
      let val = d[topChartMetric] || 0;
      if (topChartMetric === 'leads') val = d.leadsHandedOff ?? d.leadsContacted ?? d.totalProperties ?? 0;
      if (topChartMetric === 'tours') val = d.toursCompleted ?? d.toursScheduled ?? d.toursReceived ?? 0;
      if (topChartMetric === 'conversion') val = d.conversionRate ?? d.bookingRate ?? 0;
      if (topChartMetric === 'bookings') val = d.bookingsConverted ?? d.bookings ?? 0;
      
      return {
        name: d.name.length > 14 ? d.name.substring(0, 14) + '...' : d.name,
        value: val
      };
    });
  }, [tcmData, flowopsData, ownersData, activeTab, topChartMetric]);

  const exportCSV = () => {
    const data = getActiveData();
    if (!data.length) return;
    const ws = XLSX.utils.json_to_sheet(data.map((d: any) => {
      const row: any = { ...d };
      delete row.dailyTrend;
      delete row.perProperty;
      delete row.avatar;
      return row;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Performance");
    XLSX.writeFile(wb, `gharpayy-performance-${activeTab}-${dateRangeTab}.csv`);
  };

  const handleSort = (key: string) => {
    setMetricSort(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc'
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (metricSort.key !== columnKey) return null;
    return metricSort.dir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1 inline" /> : <ChevronDown className="w-3 h-3 ml-1 inline" />;
  };

  const activeColor = activeTab === "tcm" ? "indigo" : activeTab === "flowops" ? "rose" : "amber";
  const activeHex = activeTab === "tcm" ? "#6366F1" : activeTab === "flowops" ? "#F43F5E" : "#F59E0B";

  const totalMembers = (tcmData?.length || 0) + (flowopsData?.length || 0) + (ownersData?.length || 0);

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-24 text-gray-900">
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        
        {/* SECTION 1 — PAGE HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Performance Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Holistic view of organizational performance across all teams</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center p-1 bg-white border border-[#E8E3DC] rounded-lg shadow-sm">
              {["7D", "30D", "90D"].map(d => (
                <button 
                  key={d} 
                  onClick={() => setDateRangeTab(d as any)}
                  className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", dateRangeTab === d ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100")}
                >
                  {d}
                </button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", dateRangeTab === "Custom" ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100")}>
                    Custom
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={customDate?.from}
                    selected={customDate}
                    onSelect={(d) => { setCustomDate(d); setDateRangeTab("Custom"); }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <Button variant="outline" size="icon" onClick={handleRefresh} className="bg-white border-[#E8E3DC] text-gray-700 shadow-sm">
              <RefreshCw className={cn("w-4 h-4", isRefetching && "animate-spin")} />
            </Button>
          </div>
        </header>

        {/* SECTION 2 — KPI STAT TILES */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile title="Total Revenue" value={summary?.totalRevenue ?? 0} icon={TrendingUp} color="amber" trend="up" trendValue="12.5%" isCurrency isLoading={loadingSummary} />
          <StatTile title="Overall Conversion" value={summary?.overallConversionRate ?? 0} icon={CheckCircle2} color="indigo" trend="up" trendValue="2.4%" isPercent isLoading={loadingSummary} />
          <StatTile title="Total Bookings" value={summary?.totalBookings ?? 0} icon={Users} color="emerald" trend="up" trendValue="8.1%" isLoading={loadingSummary} />
          <StatTile title="Tours Conducted" value={summary?.totalTours ?? 0} icon={MapPin} color="rose" trend="down" trendValue="1.2%" isLoading={loadingSummary} />
        </div>

        {/* SECTION 3 — LEADERBOARD TABS + TABLE */}
        <div className="flex flex-col xl:grid xl:grid-cols-[5fr_7fr] gap-6">
          
          {/* Left Panel: Top 10 Horizontal Bar Chart */}
          <Card className="bg-white border-[#E8E3DC] rounded-xl shadow-sm flex flex-col">
            <CardHeader className="pb-2 border-b border-gray-100 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-900">Top 10 by Metric</CardTitle>
              <Select value={topChartMetric} onValueChange={setTopChartMetric}>
                <SelectTrigger className="w-[140px] h-8 text-xs bg-gray-50 border-[#E8E3DC]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leads">{activeTab === 'owners' ? 'Properties' : 'Leads'}</SelectItem>
                  <SelectItem value="tours">Tours</SelectItem>
                  <SelectItem value="conversion">Conversion %</SelectItem>
                  <SelectItem value="bookings">Bookings/Revenue</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="pt-4 flex-1 h-[450px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12, fill: '#4B5563' }} axisLine={false} tickLine={false} />
                  <Bar dataKey="value" radius={4} isAnimationActive={true} animationDuration={600}>
                    {top10.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={activeHex} fillOpacity={1 - index * 0.08} />
                    ))}
                    <LabelList dataKey="value" position="right" formatter={(v: number) => topChartMetric === 'conversion' ? `${v.toFixed(1)}%` : topChartMetric === 'bookings' && activeTab === 'owners' ? `₹${v.toLocaleString("en-IN")}` : v} style={{ fontSize: '11px', fill: '#6B7280', fontWeight: 500 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Right Panel: Leaderboard Table */}
          <div className="bg-white border border-[#E8E3DC] rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#E8E3DC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              
              <div className="flex items-center gap-2 p-1 bg-gray-50 border border-[#E8E3DC] rounded-lg">
                <button onClick={() => { setActiveTab("tcm"); setPage(1); }} className={cn("px-4 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === "tcm" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-200")}>
                  TCMs ({tcmData?.length || 0})
                </button>
                <button onClick={() => { setActiveTab("flowops"); setPage(1); }} className={cn("px-4 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === "flowops" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-200")}>
                  Flow Ops ({flowopsData?.length || 0})
                </button>
                <button onClick={() => { setActiveTab("owners"); setPage(1); }} className={cn("px-4 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === "owners" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-200")}>
                  Property Owners ({ownersData?.length || 0})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input placeholder="Search by name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-48 h-8 pl-8 text-xs border-[#E8E3DC] focus-visible:ring-gray-300" />
                </div>
                <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 border-[#E8E3DC] text-xs">
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                </Button>
              </div>
            </div>

            <div className="overflow-auto flex-1 relative">
              <Table>
                <TableHeader className="bg-gray-50/50 sticky top-0 z-10">
                  <TableRow className="border-b border-[#E8E3DC] hover:bg-transparent">
                    <TableHead className="w-12 text-center text-xs font-semibold text-gray-500">#</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 cursor-pointer" onClick={() => handleSort('name')}>Name <SortIcon columnKey="name" /></TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500">Zone</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 text-right cursor-pointer" onClick={() => handleSort('leads')}>{activeTab === 'owners' ? 'Props' : 'Leads'} <SortIcon columnKey="leads" /></TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 text-right cursor-pointer" onClick={() => handleSort('tours')}>Tours <SortIcon columnKey="tours" /></TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 cursor-pointer w-32" onClick={() => handleSort('conversion')}>Conv % <SortIcon columnKey="conversion" /></TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 text-right cursor-pointer" onClick={() => handleSort('bookings')}>Revenue/Bkgs <SortIcon columnKey="bookings" /></TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 text-center">Trend</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingTCM || loadingFlowOps || loadingOwners ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : paginatedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-48 text-center text-gray-500">No records found.</TableCell>
                    </TableRow>
                  ) : (
                    <AnimatePresence>
                      {paginatedData.map((row: any, i) => {
                        const rank = (page - 1) * itemsPerPage + i + 1;
                        let rankDisplay: React.ReactNode = <span className="text-gray-400 font-mono">{rank}</span>;
                        if (metricSort.key !== 'name' && rank === 1) rankDisplay = "🥇";
                        if (metricSort.key !== 'name' && rank === 2) rankDisplay = "🥈";
                        if (metricSort.key !== 'name' && rank === 3) rankDisplay = "🥉";

                        const leads = row.leadsHandedOff ?? row.leadsContacted ?? row.totalProperties ?? 0;
                        const tours = row.toursCompleted ?? row.toursScheduled ?? row.toursReceived ?? 0;
                        const conv = row.conversionRate ?? row.bookingRate ?? 0;
                        const revBkgs = row.revenueGenerated ? `₹${row.revenueGenerated.toLocaleString("en-IN")}` : (row.bookingsConverted ?? row.bookings ?? 0);
                        
                        const trendIsUp = Math.random() > 0.3; // Dummy trend for visual demo
                        const statusColor = Math.random() > 0.8 ? "bg-amber-400" : Math.random() > 0.9 ? "bg-gray-300" : "bg-emerald-500";

                        return (
                          <motion.tr 
                            key={row.userId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: i * 0.03, duration: 0.2 }}
                            className="border-b border-[#E8E3DC] hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => setSelectedUser(row)}
                          >
                            <TableCell className="text-center">{rankDisplay}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7 border border-[#E8E3DC]">
                                  <AvatarImage src={row.avatar} />
                                  <AvatarFallback className="text-[10px] bg-gray-100">{row.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="font-medium text-gray-900 text-xs truncate max-w-[120px]">{row.name}</div>
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-gray-200 text-gray-500 bg-white">{row.role}</Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-gray-500 truncate max-w-[80px]">Zone {Math.floor(Math.random() * 12) + 1}</TableCell>
                            <TableCell className="text-right text-xs font-medium">{leads}</TableCell>
                            <TableCell className="text-right text-xs font-medium">{tours}</TableCell>
                            <TableCell className="w-32">
                              <div className="flex items-center gap-2">
                                <Progress value={conv} className="h-1.5 w-12" />
                                <span className="text-xs font-medium text-gray-700 w-8">{conv.toFixed(0)}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-gray-900">{revBkgs}</TableCell>
                            <TableCell className="text-center">
                              {trendIsUp ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-500 mx-auto" />}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className={cn("w-2 h-2 rounded-full mx-auto", statusColor)} />
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </TableBody>
              </Table>
            </div>
            
            <div className="p-3 border-t border-[#E8E3DC] bg-gray-50/50">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setPage(p => Math.max(1, p - 1))} className={page === 1 ? "opacity-50 pointer-events-none" : "cursor-pointer"} />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="text-xs text-gray-500 px-4">Page {page} of {totalPages || 1}</span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext onClick={() => setPage(p => Math.min(totalPages, p + 1))} className={page === totalPages ? "opacity-50 pointer-events-none" : "cursor-pointer"} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>

        </div>
      </div>
      
      {/* SECTION 4 — BOTTOM SUMMARY BAR */}
      <div className="fixed bottom-0 left-0 lg:left-72 right-0 bg-white border-t border-[#E8E3DC] p-3 px-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 flex items-center justify-between backdrop-blur-md bg-white/90">
        <div className="text-xs text-gray-500">
          Showing data for <strong className="text-gray-900">{totalMembers} team members</strong> across 12 zones · Last updated {Math.floor((now.getTime() - lastUpdated.getTime()) / 60000)} mins ago
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-7" onClick={exportCSV}>
          <Download className="w-3.5 h-3.5 mr-1.5" /> Download Full Report PDF
        </Button>
      </div>

      {/* Side Sheet Profile */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0 border-l border-[#E8E3DC] bg-[#FAF8F5]">
          {selectedUser && (
            <div className="flex flex-col h-full">
              <SheetHeader className="p-6 bg-white border-b border-[#E8E3DC]">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-white shadow-sm">
                    <AvatarImage src={selectedUser.avatar} />
                    <AvatarFallback className="text-lg bg-gray-100">{selectedUser.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-xl text-gray-900">{selectedUser.name}</SheetTitle>
                    <div className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-transparent hover:bg-gray-200">{selectedUser.role}</Badge>
                      <span>Zone 4</span>
                    </div>
                  </div>
                </div>
              </SheetHeader>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4 border-[#E8E3DC] shadow-sm bg-white">
                    <div className="text-xs font-medium text-gray-400 uppercase">Total Tours</div>
                    <div className="text-2xl font-bold mt-1 text-gray-900">{selectedUser.toursCompleted ?? selectedUser.toursScheduled ?? selectedUser.toursReceived ?? 0}</div>
                  </Card>
                  <Card className="p-4 border-[#E8E3DC] shadow-sm bg-white">
                    <div className="text-xs font-medium text-gray-400 uppercase">Conversion Rate</div>
                    <div className="text-2xl font-bold mt-1 text-indigo-600">{(selectedUser.conversionRate ?? selectedUser.bookingRate ?? 0).toFixed(1)}%</div>
                  </Card>
                </div>
                
                <Card className="p-4 border-[#E8E3DC] shadow-sm bg-white">
                  <div className="text-xs font-medium text-gray-400 uppercase mb-4">Performance Trend</div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedUser.dailyTrend || generateSparkline(50)}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E3DC" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#fff', borderColor: '#E8E3DC', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                        <Line type="monotone" dataKey="bookings" name="Bookings" stroke={activeHex} strokeWidth={2} dot={{ r: 3, fill: activeHex }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="toursCompleted" name="Tours" stroke="#9CA3AF" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-4 border-[#E8E3DC] shadow-sm bg-white">
                   <div className="text-xs font-medium text-gray-400 uppercase mb-4">Recent Activity</div>
                   <div className="space-y-4">
                     {[1,2,3].map(i => (
                       <div key={i} className="flex gap-3 relative pb-4 last:pb-0">
                         {i !== 3 && <div className="absolute left-1.5 top-4 bottom-0 w-px bg-gray-200" />}
                         <div className="w-3 h-3 rounded-full bg-emerald-100 border-2 border-emerald-500 z-10 shrink-0 mt-1" />
                         <div>
                           <div className="text-sm font-medium text-gray-900">Lead converted to Booking</div>
                           <div className="text-xs text-gray-500 mt-0.5">Today at 10:{i * 15} AM</div>
                         </div>
                       </div>
                     ))}
                   </div>
                </Card>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
