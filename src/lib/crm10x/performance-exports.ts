import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import type { Lead, TCM } from "@/lib/types";
import { EnrichedPerformanceLead } from "./performance-engine";

export type ReportRange = "today" | "yesterday" | "last7" | "last30" | "all";
export type ReportFormat = "csv" | "xlsx" | "pdf";

export function getRangeDates(range: ReportRange): { start: Date; end: Date } {
  const now = new Date();
  switch (range) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday":
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    case "last7":
      return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
    case "last30":
      return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
    case "all":
    default:
      return { start: new Date(0), end: now };
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportXLSX(data: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function exportCSV(data: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
}

function exportPDF(data: any[], title: string, filename: string) {
  const doc = new jsPDF();
  doc.text(title, 14, 15);
  
  if (data.length === 0) {
    doc.text("No data available for this range.", 14, 25);
    doc.save(`${filename}.pdf`);
    return;
  }

  const columns = Object.keys(data[0]).map(key => ({ header: key, dataKey: key }));
  
  autoTable(doc, {
    startY: 20,
    columns,
    body: data,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 66, 66] }
  });

  doc.save(`${filename}.pdf`);
}

function handleExport(data: any[], title: string, formatType: ReportFormat) {
  const filename = `${title.replace(/\s+/g, '_').toLowerCase()}_${format(new Date(), 'yyyyMMdd_HHmm')}`;
  
  if (formatType === "xlsx") {
    exportXLSX(data, filename);
  } else if (formatType === "csv") {
    exportCSV(data, filename);
  } else if (formatType === "pdf") {
    exportPDF(data, title, filename);
  }
}

// 1. Operations Report
export function exportOperationsReport(
  enriched: EnrichedPerformanceLead[], 
  formatType: ReportFormat, 
  range: ReportRange
) {
  // Using simplified overall metrics to represent Operations Report rows (often grouped by stage or overall totals)
  // We'll generate a single row summary for the report
  const activeLeads = enriched.filter(e => e.lead.stage !== "dropped" && e.lead.stage !== "booked").length;
  const toursScheduled = enriched.filter(e => e.openTour && e.openTour.status === "scheduled").length;
  const toursCompleted = enriched.filter(e => e.openTour && e.openTour.status === "completed").length;
  const feedbackMissing = enriched.filter(e => e.workflow.pendingItem === "tour-feedback-missing").length;
  const quotesSent = enriched.filter(e => e.lastQuote).length;
  const bookings = enriched.filter(e => e.lead.stage === "booked").length;
  const dropped = enriched.filter(e => e.lead.stage === "dropped").length;

  const data = [{
    "Date Range": range.toUpperCase(),
    "Active Leads": activeLeads,
    "Tours Scheduled": toursScheduled,
    "Tours Completed": toursCompleted,
    "Feedback Missing": feedbackMissing,
    "Quotes Sent": quotesSent,
    "Bookings": bookings,
    "Dropped": dropped
  }];

  handleExport(data, "Daily Ops Report", formatType);
}

// 2. Team Report
export function exportTeamReport(
  enriched: EnrichedPerformanceLead[], 
  tcms: TCM[], 
  formatType: ReportFormat, 
  range: ReportRange
) {
  const data = tcms.map(tcm => {
    const tcmLeads = enriched.filter(e => e.lead.assignedTcmId === tcm.id);
    const activeLeads = tcmLeads.filter(e => e.lead.stage !== "dropped" && e.lead.stage !== "booked").length;
    const pendingActions = tcmLeads.filter(e => {
       const w = e.workflow.pendingItem;
       return w === "tour-feedback-missing" || w === "quote-missing" || w === "deep-profile-missing" || w === "tour-not-scheduled";
    }).length;
    const bookings = tcmLeads.filter(e => e.lead.stage === "booked").length;

    return {
      "TCM Name": tcm.name,
      "Active Leads": activeLeads,
      "Pending Actions": pendingActions,
      "Bookings": bookings
    };
  }).filter(row => row["Active Leads"] > 0 || row["Bookings"] > 0);

  handleExport(data, "Team Performance Report", formatType);
}

// 3. At Risk Report
export function exportRiskReport(
  atRiskRaw: any[], 
  tcms: TCM[], 
  formatType: ReportFormat, 
  range: ReportRange
) {
  const data = atRiskRaw.map(r => {
    const ownerName = r.ownerId ? (tcms.find(t => t.id === r.ownerId)?.name || 'Needs Assignment') : 'Needs Assignment';
    
    return {
      "Lead Name": r.lead.name,
      "Phone": r.lead.phone,
      "Issue": r.issue,
      "Priority": r.priority,
      "Owner": ownerName,
      "Move In Days": r.moveInDays !== null ? r.moveInDays : "Missing",
      "Stage": r.lead.stage.toUpperCase()
    };
  });

  handleExport(data, "At Risk Leads Report", formatType);
}
