import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from "lucide-react";
import { useLeadImport, type ImportLead, type ImportResult } from "@/hooks/api/useLeadImport";
import { toast } from "sonner";

interface Props {
  onImportComplete?: (result: ImportResult) => void;
}

function parseCSV(text: string): ImportLead[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/["\s]/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return {
      name: row.name || row["leadname"] || row["lead_name"] || "",
      phone: row.phone || row.mobile || row["phonenumber"] || row["phone_number"] || "",
      source: row.source || "CSV Import",
      budget: Number(row.budget || 0),
      preferredArea: row.area || row.location || row.preferredarea || row.preferred_area || "",
      moveInDate: row["move-indate"] || row.moveindate || row.move_in_date || "",
      email: row.email || "",
      tags: row.tags || "",
      notes: row.notes || "",
      type: row.type || "",
      room: row.room || "",
      need: row.need || "",
    };
  });
}

export function BulkFileImport({ onImportComplete }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<ImportLead[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useLeadImport();

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (file.name.endsWith(".json")) {
        try {
          const data = JSON.parse(text);
          setPreview(Array.isArray(data) ? data : data.leads || []);
        } catch { toast.error("Invalid JSON file"); }
      } else {
        setPreview(parseCSV(text));
      }
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(true); }, []);
  const onDragLeave = useCallback(() => setDragActive(false), []);

  const doImport = async () => {
    if (preview.length === 0) return;
    try {
      const res = await importMutation.mutateAsync(preview);
      setResult(res);
      toast.success(`Imported ${res.summary.created} leads (${res.summary.duplicates} dupes, ${res.summary.rejected} rejected)`);
      onImportComplete?.(res);
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Import failed");
    }
  };

  const reset = () => { setPreview([]); setResult(null); setFileName(""); if (fileRef.current) fileRef.current.value = ""; };

  return (
    <div className="space-y-3">
      <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragActive ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground/30"}`}
      >
        <input ref={fileRef} type="file" accept=".csv,.json" className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }} />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <div className="text-sm font-medium">
          {fileName ? (
            <span className="flex items-center justify-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />{fileName}
              <button onClick={(e) => { e.stopPropagation(); reset(); }} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </span>
          ) : "Drop CSV/JSON file or click to browse"}
        </div>
        <div className="text-xs text-muted-foreground mt-1">Supports: name, phone, source, budget, area, moveInDate, email, tags, notes</div>
      </div>
      {preview.length > 0 && !result && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{preview.length} leads ready to import</div>
          <div className="max-h-40 overflow-auto border border-border rounded text-xs">
            <table className="w-full"><thead className="bg-muted/40 sticky top-0"><tr>
              <th className="p-1 text-left">Name</th><th className="p-1 text-left">Phone</th>
              <th className="p-1 text-left">Area</th><th className="p-1 text-right">Budget</th>
            </tr></thead><tbody>{preview.slice(0, 10).map((l, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-1">{l.name || "\u2014"}</td><td className="p-1 font-mono">{l.phone || "\u2014"}</td>
                <td className="p-1">{l.preferredArea || "\u2014"}</td><td className="p-1 text-right">{"\u20B9"}{l.budget || 0}</td>
              </tr>
            ))}</tbody></table>
          </div>
          <Button size="sm" onClick={doImport} disabled={importMutation.isPending}>
            {importMutation.isPending ? "Importing..." : `Import ${preview.length} Leads`}
          </Button>
        </div>
      )}
      {result && (
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3 w-3" /> {result.summary.created} created</span>
            {result.summary.duplicates > 0 && <span className="flex items-center gap-1 text-yellow-600"><AlertCircle className="h-3 w-3" /> {result.summary.duplicates} duplicates</span>}
            {result.summary.rejected > 0 && <span className="flex items-center gap-1 text-red-600"><AlertCircle className="h-3 w-3" /> {result.summary.rejected} rejected</span>}
          </div>
          {result.rejected.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-2">
              <div className="font-medium text-red-700 mb-1">Rejected:</div>
              {result.rejected.slice(0, 5).map((r, i) => <div key={i} className="text-red-600">{r.phone}: {r.reason}</div>)}
            </div>
          )}
          <Button size="sm" variant="outline" onClick={reset}>Import More</Button>
        </div>
      )}
    </div>
  );
}
