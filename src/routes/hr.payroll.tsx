import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Banknote, Play, Download, Search, CheckCircle2, IndianRupee } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/hr/payroll")({
  component: PayrollPage,
});

function PayrollPage() {
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));

  const { data: runs = [], isLoading: loadingRuns } = useQuery({
    queryKey: ["hr-payroll-runs"],
    queryFn: () => api.hr.payrollRuns(),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.hr.generatePayroll(month),
    onSuccess: () => {
      toast.success(`Payroll generated for ${month}`);
      queryClient.invalidateQueries({ queryKey: ["hr-payroll-runs"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to generate payroll")
  });

  const processMutation = useMutation({
    mutationFn: (id: string) => api.hr.processPayroll(id),
    onSuccess: () => {
      toast.success("Payroll marked as paid and processed.");
      queryClient.invalidateQueries({ queryKey: ["hr-payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["hr-payslips", selectedRun] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to process payroll")
  });

  const { data: slips = [], isLoading: loadingSlips } = useQuery({
    queryKey: ["hr-payslips", selectedRun],
    queryFn: () => api.hr.payslips(selectedRun!),
    enabled: !!selectedRun,
  });

  const activeRun = runs.find(r => r._id === selectedRun);

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Payroll & Compensation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate payslips and process monthly payroll.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input 
            type="month" 
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
          <Button 
            className="gap-2"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            <Banknote className="h-4 w-4" /> 
            {generateMutation.isPending ? "Generating..." : "Generate Draft"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Payroll Runs */}
        <div className="col-span-1 border border-border rounded-xl bg-card overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          <div className="p-4 border-b border-border bg-muted/30 font-medium">Payroll Runs</div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {loadingRuns ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading runs...</div>
            ) : runs.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No payroll runs found.</div>
            ) : (
              runs.map(run => (
                <button
                  key={run._id}
                  onClick={() => setSelectedRun(run._id)}
                  className={`w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-center justify-between ${selectedRun === run._id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                >
                  <div>
                    <div className="font-semibold text-sm">{format(new Date(`${run.month}-01`), "MMMM yyyy")}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <IndianRupee className="h-3 w-3" />
                      {run.totalAmount.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <Badge variant={run.status === "paid" ? "default" : "secondary"} className={run.status === "paid" ? "bg-success" : ""}>
                    {run.status}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Payslips */}
        <div className="col-span-2 border border-border rounded-xl bg-card overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          {!selectedRun ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Banknote className="h-10 w-10 mb-4 opacity-20" />
              <p>Select a payroll run to view payslips</p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{activeRun ? format(new Date(`${activeRun.month}-01`), "MMMM yyyy") : ""}</div>
                  <div className="text-xs text-muted-foreground">{slips.length} employees</div>
                </div>
                {activeRun?.status === "draft" && (
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="gap-2 bg-success hover:bg-success/90"
                    onClick={() => processMutation.mutate(selectedRun)}
                    disabled={processMutation.isPending}
                  >
                    <Play className="h-4 w-4" /> Process & Mark Paid
                  </Button>
                )}
                {activeRun?.status === "paid" && (
                  <Badge variant="outline" className="text-success border-success gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Processed on {format(new Date(activeRun.processedAt!), "MMM d")}
                  </Badge>
                )}
              </div>
              <div className="flex-1 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Allowances</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingSlips ? (
                      <TableRow><TableCell colSpan={6} className="text-center h-24">Loading...</TableCell></TableRow>
                    ) : (
                      slips.map(slip => (
                        <TableRow key={slip._id}>
                          <TableCell className="font-medium">{slip.employeeName}</TableCell>
                          <TableCell className="text-right font-mono text-xs">₹{slip.baseSalary.toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-success">+₹{slip.allowances.toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-destructive">-₹{slip.deductions.toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-sm">₹{slip.netPay.toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" title="Download PDF (Demo)"><Download className="h-4 w-4 text-muted-foreground" /></Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
