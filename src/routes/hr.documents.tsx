import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { useAuthUser } from "@/lib/auth-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Search, Upload, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/hr/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const user = useAuthUser((s) => s.user);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["hr-documents"],
    queryFn: () => api.hr.documents(),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: () => api.hr.employees(),
  });

  const verifyMutation = useMutation({
    mutationFn: (vars: { documentId: string; status: "verified" | "rejected"; notes?: string }) =>
      api.command({
        _id: crypto.randomUUID(),
        type: "cmd.document.verify",
        payload: { documentId: vars.documentId, status: vars.status, notes: vars.notes },
      }),
    onSuccess: () => {
      toast.success("Document status updated");
      queryClient.invalidateQueries({ queryKey: ["hr-documents"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to verify document"),
  });

  const filtered = documents.filter((d) =>
    d.employeeName?.toLowerCase().includes(search.toLowerCase()) ||
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Document Vault</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Securely manage employee contracts, identity proofs, and tax forms.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <UploadDocumentDialog open={isUploadOpen} onOpenChange={setIsUploadOpen} employees={employees} userRole={user?.role} userId={user?.id} />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto pb-6">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            Loading documents...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground py-12">
            No documents found.
          </div>
        ) : (
          filtered.map((doc) => (
            <div key={doc._id} className="border border-border rounded-xl bg-card p-5 shadow-sm space-y-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm line-clamp-1" title={doc.title}>{doc.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{doc.employeeName}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize text-[10px]">
                  {doc.type}
                </Badge>
                {doc.status === "verified" ? (
                  <Badge variant="secondary" className="bg-success/20 text-success hover:bg-success/20 gap-1 text-[10px]">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </Badge>
                ) : doc.status === "rejected" ? (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <XCircle className="h-3 w-3" /> Rejected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Clock className="h-3 w-3" /> Pending Review
                  </Badge>
                )}
              </div>

              {doc.notes && (
                <div className="text-xs bg-muted/50 p-2 rounded text-muted-foreground italic">
                  Note: {doc.notes}
                </div>
              )}

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                <div className="text-[10px] text-muted-foreground">
                  Uploaded {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer">View</a>
                  </Button>
                  {(user?.role === "hr" || user?.role === "super_admin") && doc.status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-success hover:text-success hover:bg-success/20"
                        onClick={() => verifyMutation.mutate({ documentId: doc._id, status: "verified" })}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/20"
                        onClick={() => {
                          const note = window.prompt("Reason for rejection?");
                          if (note !== null) {
                            verifyMutation.mutate({ documentId: doc._id, status: "rejected", notes: note });
                          }
                        }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UploadDocumentDialog({ open, onOpenChange, employees, userRole, userId }: { open: boolean, onOpenChange: (o: boolean) => void, employees: any[], userRole?: string, userId?: string }) {
  const [employeeId, setEmployeeId] = useState(userRole === "hr" || userRole === "super_admin" ? "" : userId || "");
  const [type, setType] = useState("identity");
  const [title, setTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const isHr = userRole === "hr" || userRole === "super_admin";

  const submit = async () => {
    if (!employeeId || !title || !fileUrl) return toast.error("Fill all fields");
    setBusy(true);
    try {
      await api.command({
        _id: crypto.randomUUID(),
        type: "cmd.document.upload",
        payload: {
          employeeId,
          type: type as any,
          title,
          fileUrl,
        },
      });
      toast.success("Document uploaded");
      onOpenChange(false);
      setTitle("");
      setFileUrl("");
      if (isHr) setEmployeeId("");
      queryClient.invalidateQueries({ queryKey: ["hr-documents"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to upload document");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" /> Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {isHr && (
            <div className="space-y-2">
              <label className="text-xs font-medium">Employee</label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Document Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="identity">Identity Proof</SelectItem>
                  <SelectItem value="contract">Employment Contract</SelectItem>
                  <SelectItem value="tax">Tax Form</SelectItem>
                  <SelectItem value="certification">Certification</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Passport Copy" />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-medium">File URL</label>
            <Input type="url" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://..." />
            <p className="text-[10px] text-muted-foreground mt-1">In a real app, this would be a file dropzone uploading to S3.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !employeeId || !title || !fileUrl}>
            {busy ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
