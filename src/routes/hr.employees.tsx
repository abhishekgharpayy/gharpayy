import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Users, Search, Mail, Phone, Shield, Building, Pencil, X, Check, UserPlus, Banknote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/hr/employees")({
  component: EmployeesDirectory,
});

function EmployeesDirectory() {
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(15);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: () => api.hr.employees(),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; patch: any }) => api.hr.updateEmployee(vars.id, vars.patch),
    onSuccess: () => {
      toast.success("Employee updated successfully");
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
      setEditingId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update employee");
    },
  });

  const handleEdit = (emp: any) => {
    setEditingId(emp.id);
    setEditForm({
      role: emp.role,
      status: emp.status,
      department: emp.department || "",
      managerId: emp.managerId || "",
      baseSalary: emp.baseSalary || 0,
      allowances: emp.allowances || 0,
    });
  };

  const handleSave = (id: string) => {
    updateMutation.mutate({
      id,
      patch: {
        role: editForm.role,
        status: editForm.status,
        department: editForm.department,
        managerId: editForm.managerId || null,
        baseSalary: Number(editForm.baseSalary),
        allowances: Number(editForm.allowances),
      },
    });
  };

  const filtered = employees.filter((emp) => {
    const term = search.toLowerCase();
    return (
      emp.fullName?.toLowerCase().includes(term) ||
      emp.email?.toLowerCase().includes(term) ||
      (emp as any).department?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 min-h-screen p-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-display font-semibold flex items-center gap-3 tracking-tight">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            Employee Directory
          </h1>
          <p className="text-sm text-muted-foreground ml-14">
            Manage roles, departments, reporting lines, and statuses across the organization.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative max-w-md w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 text-sm pl-9 bg-card shadow-sm border-muted-foreground/20 focus:ring-primary/20"
          />
        </div>
        <InviteEmployeeDialog open={isInviteOpen} onOpenChange={setIsInviteOpen} />
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="text-sm w-full">
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold h-11 px-4">Employee</TableHead>
                <TableHead className="font-semibold h-11 px-4">Contact</TableHead>
                <TableHead className="font-semibold h-11 px-4">Role</TableHead>
                <TableHead className="font-semibold h-11 px-4">Department</TableHead>
                <TableHead className="font-semibold h-11 px-4">Compensation</TableHead>
                <TableHead className="font-semibold h-11 px-4">Status</TableHead>
                <TableHead className="font-semibold h-11 px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                      <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      <span>Loading directory...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No employees found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.slice(0, visibleCount).map((emp) => {
                  const isEditing = editingId === emp.id;
                  
                  return (
                    <TableRow
                      key={emp.id}
                      className="group transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="px-4 py-3 align-top">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0 ring-1 ring-primary/20">
                            {emp.fullName?.[0]?.toUpperCase() || "E"}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{emp.fullName || "—"}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Joined {new Date(emp.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell className="px-4 py-3 align-top">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-muted-foreground text-xs">
                            <Mail size={12} />
                            <span>{emp.email}</span>
                          </div>
                          {emp.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                              <Phone size={12} />
                              <span>{emp.phone}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="px-4 py-3 align-top">
                        {isEditing ? (
                          <select
                            className="w-full text-xs h-8 rounded-md border border-input bg-transparent px-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            value={editForm.role}
                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                          >
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="owner">Owner</option>
                            <option value="tcm">TCM</option>
                            <option value="hr">HR</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-2 text-foreground text-sm capitalize">
                            <Shield size={14} className="text-muted-foreground" />
                            {emp.role.replace("_", " ")}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="px-4 py-3 align-top">
                        {isEditing ? (
                          <input
                            type="text"
                            placeholder="Department..."
                            className="w-full text-xs h-8 rounded-md border border-input bg-transparent px-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            value={editForm.department}
                            onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-foreground text-sm">
                            <Building size={14} className="text-muted-foreground" />
                            {(emp as any).department || <span className="text-muted-foreground italic">Unassigned</span>}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="px-4 py-3 align-top">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="number"
                              placeholder="Base..."
                              className="w-24 text-xs h-7 rounded-md border border-input bg-transparent px-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                              value={editForm.baseSalary}
                              onChange={(e) => setEditForm({ ...editForm, baseSalary: e.target.value })}
                            />
                            <input
                              type="number"
                              placeholder="Allowances..."
                              className="w-24 text-xs h-7 rounded-md border border-input bg-transparent px-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                              value={editForm.allowances}
                              onChange={(e) => setEditForm({ ...editForm, allowances: e.target.value })}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-foreground text-sm font-mono">
                            <Banknote size={14} className="text-muted-foreground" />
                            ₹{emp.baseSalary ? (emp.baseSalary + (emp.allowances || 0)).toLocaleString('en-IN') : '0'}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="px-4 py-3 align-top">
                        {isEditing ? (
                          <select
                            className="w-full text-xs h-8 rounded-md border border-input bg-transparent px-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            value={editForm.status}
                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">On Leave</option>
                            <option value="invited">Invited</option>
                            <option value="deleted">Exited</option>
                          </select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={
                              emp.status === "active"
                                ? "bg-success/15 text-success border-success/20"
                                : emp.status === "deleted"
                                ? "bg-destructive/15 text-destructive border-destructive/20"
                                : "bg-warning/15 text-warning border-warning/20"
                            }
                          >
                            {emp.status === "inactive" ? "On Leave" : emp.status === "deleted" ? "Exited" : emp.status}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="px-4 py-3 text-right align-top">
                        {isEditing ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setEditingId(null)}
                              className="h-8 w-8 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                            <button
                              onClick={() => handleSave(emp.id)}
                              disabled={updateMutation.isPending}
                              className="h-8 w-8 rounded flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                              title="Save"
                            >
                              {updateMutation.isPending ? (
                                <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                              ) : (
                                <Check size={16} />
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEdit(emp)}
                            className="h-8 w-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 ml-auto"
                            title="Edit Employee"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          
          {filtered.length > visibleCount && (
            <div className="p-4 text-center border-t border-border bg-muted/20">
              <button 
                className="text-sm font-medium bg-background hover:bg-muted text-foreground border border-border px-5 py-2 rounded-full transition-all shadow-sm"
                onClick={() => setVisibleCount(v => v + 15)}
              >
                Load More ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InviteEmployeeDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({ fullName: "", email: "", role: "member", department: "", baseSalary: "0", allowances: "0" });
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    if (!form.fullName || !form.email) return toast.error("Name and email are required");
    setBusy(true);
    try {
      await api.hr.inviteEmployee({
        ...form,
        baseSalary: Number(form.baseSalary),
        allowances: Number(form.allowances)
      });
      toast.success("Employee invited successfully");
      onOpenChange(false);
      setForm({ fullName: "", email: "", role: "member", department: "", baseSalary: "0", allowances: "0" });
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to invite employee");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" /> Onboard Employee
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Onboard New Employee</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Full Name</label>
              <Input value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="jane@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Role</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={form.role} 
                onChange={e => setForm({...form, role: e.target.value})}
              >
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="owner">Owner</option>
                <option value="tcm">TCM</option>
                <option value="hr">HR</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Department</label>
              <Input value={form.department} onChange={e => setForm({...form, department: e.target.value})} placeholder="Engineering" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Base Salary (Monthly)</label>
              <Input type="number" value={form.baseSalary} onChange={e => setForm({...form, baseSalary: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Allowances (Monthly)</label>
              <Input type="number" value={form.allowances} onChange={e => setForm({...form, allowances: e.target.value})} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !form.fullName || !form.email}>
            {busy ? "Inviting..." : "Send Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
