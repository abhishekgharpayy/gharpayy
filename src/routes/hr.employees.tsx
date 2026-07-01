import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Users, Search, Mail, Phone, Shield, Building, Pencil, X, Check } from "lucide-react";
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
                <TableHead className="font-semibold h-11 px-4">Status</TableHead>
                <TableHead className="font-semibold h-11 px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                      <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      <span>Loading directory...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
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
