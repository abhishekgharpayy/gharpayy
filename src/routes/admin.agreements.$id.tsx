import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowLeft, Download, Pen, FileText, CheckCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

export const Route = createFileRoute("/admin/agreements/$id")({
  component: AgreementDetail,
});

function AgreementDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const { data: agreement, isLoading } = useQuery({
    queryKey: ["agreements", id],
    queryFn: () => api.agreements.get(id),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.agreements.update(id, data),
    onSuccess: () => {
      toast.success("Agreement updated");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["agreements", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const signMutation = useMutation({
    mutationFn: (role: "tenant" | "owner") => api.agreements.sign(id, role),
    onSuccess: () => {
      toast.success("Agreement signed");
      queryClient.invalidateQueries({ queryKey: ["agreements", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEditing = () => {
    if (agreement) {
      setEditForm({
        tenantName: agreement.tenantName,
        tenantPhone: agreement.tenantPhone,
        propertyName: agreement.propertyName,
        propertyAddress: agreement.propertyAddress,
        roomNumber: agreement.roomNumber,
        rent: agreement.rent,
        deposit: agreement.deposit,
        moveInDate: agreement.moveInDate,
        duration: agreement.duration,
        noticePeriod: agreement.noticePeriod,
      });
      setEditing(true);
    }
  };

  const generatePDF = () => {
    if (!agreement) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = 210;
    const margin = 20;
    let y = 20;

    const title = (text: string) => {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(text, pageW / 2, y, { align: "center" });
      y += 8;
    };

    const section = (text: string) => {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(text, margin, y);
      y += 6;
    };

    const field = (label: string, value: string) => {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`${label}: ${value}`, margin, y);
      y += 5;
    };

    const line = () => {
      y += 2;
      doc.setDrawColor(200);
      doc.line(margin, y, pageW - margin, y);
      y += 4;
    };

    title("RENTAL AGREEMENT");
    y += 2;
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, pageW / 2, y, { align: "center" });
    doc.setTextColor(0);
    y += 10;

    section("1. PARTIES");
    field("Landlord/Owner", "Gharpayy Arena Infrastructure Pvt. Ltd.");
    field("Tenant", agreement.tenantName);
    field("Tenant Phone", agreement.tenantPhone);
    line();

    section("2. PROPERTY DETAILS");
    field("Property Name", agreement.propertyName);
    field("Address", agreement.propertyAddress);
    field("Room / Unit", agreement.roomNumber || "N/A");
    line();

    section("3. FINANCIAL TERMS");
    field("Monthly Rent", `₹${agreement.rent.toLocaleString("en-IN")}`);
    field("Security Deposit", `₹${agreement.deposit.toLocaleString("en-IN")}`);
    field("Duration", `${agreement.duration} months`);
    field("Notice Period", `${agreement.noticePeriod} days`);
    line();

    const parseDate = (d: string) => {
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    };
    const moveIn = agreement.moveInDate ? parseDate(agreement.moveInDate) : null;
    field("Move-in Date", moveIn ? moveIn.toLocaleDateString("en-IN") : "—");
    if (moveIn) {
      const endDate = new Date(moveIn);
      endDate.setMonth(endDate.getMonth() + agreement.duration);
      field("End Date", endDate.toLocaleDateString("en-IN"));
    }
    line();

    section("5. TERMS & CONDITIONS");
    doc.setFontSize(9);
    const clauses = [
      "1. The tenant shall pay the monthly rent on or before the 5th of every month.",
      "2. A late fee of ₹100 per day will be charged for rent paid after the 5th.",
      "3. The security deposit is refundable, subject to deductions for damages.",
      `4. Either party must give ${agreement.noticePeriod} days' notice for termination.`,
      "5. The tenant shall maintain the property in good condition.",
      "6. Sub-letting is strictly prohibited without prior written consent.",
      "7. Utility bills (electricity, water, internet) are payable by the tenant.",
      "8. The landlord reserves the right to inspect the premises with 24hr notice.",
    ];
    clauses.forEach((c) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(c, margin, y);
      y += 5;
    });
    y += 6;

    section("6. SIGNATURES");
    y += 4;
    const sigY = y;
    doc.text("_________", margin, sigY);
    doc.text("_________", pageW - margin - 40, sigY);
    doc.setFontSize(9);
    doc.text("Tenant Signature", margin, sigY + 5);
    doc.text("Landlord / Owner Signature", pageW - margin - 55, sigY + 5);

    if (agreement.signedByTenantAt) {
      doc.text(`✓ Signed: ${new Date(agreement.signedByTenantAt).toLocaleDateString("en-IN")}`, margin, sigY + 12);
    }
    if (agreement.signedByOwnerAt) {
      doc.text(`✓ Signed: ${new Date(agreement.signedByOwnerAt).toLocaleDateString("en-IN")}`, pageW - margin - 55, sigY + 12);
    }

    const pdfBase64 = doc.output("datauristring");
    api.agreements.savePdf(id, pdfBase64).catch(() => {});
    window.open(pdfBase64, "_blank");
  };

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading...</div>;
  if (!agreement) return <div className="text-sm text-muted-foreground p-4">Not found</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => window.history.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-display font-bold">{agreement.tenantName}</h1>
          <p className="text-xs text-muted-foreground">{agreement.propertyName}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={startEditing} disabled={agreement.status === "signed"}>
            <Pen size={12} /> Edit
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={generatePDF}>
            <Download size={12} /> PDF
          </Button>
          <Button size="sm" className="gap-1" onClick={() => window.open("/admin/whatsapp", "_blank")}>
            <Send size={12} /> Send via WhatsApp
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Badge variant={agreement.status === "signed" ? "default" : agreement.status === "sent" ? "secondary" : "outline"}>
          {agreement.status}
        </Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Agreement Details</CardTitle></CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground">Tenant Name</label><Input value={editForm.tenantName} onChange={(e) => setEditForm({...editForm, tenantName: e.target.value})} className="h-8 text-xs" /></div>
                <div><label className="text-xs text-muted-foreground">Phone</label><Input value={editForm.tenantPhone} onChange={(e) => setEditForm({...editForm, tenantPhone: e.target.value})} className="h-8 text-xs" /></div>
              </div>
              <div><label className="text-xs text-muted-foreground">Property</label><Input value={editForm.propertyName} onChange={(e) => setEditForm({...editForm, propertyName: e.target.value})} className="h-8 text-xs" /></div>
              <div><label className="text-xs text-muted-foreground">Address</label><Input value={editForm.propertyAddress} onChange={(e) => setEditForm({...editForm, propertyAddress: e.target.value})} className="h-8 text-xs" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground">Rent (₹)</label><Input type="number" value={editForm.rent} onChange={(e) => setEditForm({...editForm, rent: parseInt(e.target.value) || 0})} className="h-8 text-xs" /></div>
                <div><label className="text-xs text-muted-foreground">Deposit (₹)</label><Input type="number" value={editForm.deposit} onChange={(e) => setEditForm({...editForm, deposit: parseInt(e.target.value) || 0})} className="h-8 text-xs" /></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="text-xs" onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Tenant:</span> <span className="font-medium">{agreement.tenantName}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> {agreement.tenantPhone}</div>
              </div>
              <div><span className="text-muted-foreground">Property:</span> {agreement.propertyName}</div>
              <div><span className="text-muted-foreground">Address:</span> {agreement.propertyAddress}</div>
              <div><span className="text-muted-foreground">Room:</span> {agreement.roomNumber || "N/A"}</div>
              <div className="grid grid-cols-3 gap-2">
                <div><span className="text-muted-foreground">Rent:</span> ₹{agreement.rent.toLocaleString("en-IN")}/mo</div>
                <div><span className="text-muted-foreground">Deposit:</span> ₹{agreement.deposit.toLocaleString("en-IN")}</div>
                <div><span className="text-muted-foreground">Duration:</span> {agreement.duration}mo</div>
              </div>
              <div><span className="text-muted-foreground">Move-in:</span> {new Date(agreement.moveInDate).toLocaleDateString("en-IN")}</div>
              <div><span className="text-muted-foreground">Notice Period:</span> {agreement.noticePeriod} days</div>
            </div>
          )}
        </CardContent>
      </Card>

      {agreement.status !== "signed" && (
        <div className="flex gap-2">
          <Button size="sm" className="gap-1" onClick={() => signMutation.mutate("tenant")} disabled={signMutation.isPending}>
            <CheckCircle size={12} /> Mark Tenant Signed
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => signMutation.mutate("owner")} disabled={signMutation.isPending}>
            <CheckCircle size={12} /> Mark Owner Signed
          </Button>
        </div>
      )}

      {agreement.status === "signed" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-400">
          <CheckCircle size={14} className="inline mr-1" />
          Agreement fully signed
          {agreement.signedByTenantAt && ` · Tenant: ${new Date(agreement.signedByTenantAt).toLocaleDateString("en-IN")}`}
          {agreement.signedByOwnerAt && ` · Owner: ${new Date(agreement.signedByOwnerAt).toLocaleDateString("en-IN")}`}
        </div>
      )}
    </div>
  );
}
