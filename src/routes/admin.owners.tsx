import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Search, Mail, Phone, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/owners")({
  component: OwnersList,
});

function OwnersList() {
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["owners"],
    queryFn: () => api.owners.list(),
  });

  const owners = data ?? [];

  // Client-side filtering for simplicity and search speed
  const filteredOwners = owners.filter((owner) => {
    const term = search.toLowerCase();
    return (
      owner.fullName?.toLowerCase().includes(term) ||
      owner.username?.toLowerCase().includes(term) ||
      owner.email?.toLowerCase().includes(term) ||
      owner.phone?.includes(term)
    );
  });

  return (
    <div className="space-y-4 min-h-screen bg-white p-6">
      <div className="flex items-center justify-between border-b border-[#FFE0C2] pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2 text-gray-800">
            <ShieldCheck size={24} className="text-[#F97316]" /> Master Owners
          </h1>
          <p className="text-xs text-muted-foreground">Manage property owner profiles, details, and platform access</p>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search owners by name or contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 text-xs pl-8 border-[#FFE0C2] focus:border-[#F97316] focus:ring-[#F97316]"
        />
      </div>

      <div className="rounded-xl border border-[#FFE0C2] bg-[#FFF7F0] shadow-sm">
        <div className="overflow-auto">
          <Table className="text-xs">
            <TableHeader className="bg-[#FFF1E6]">
              <TableRow className="border-b border-[#FFE0C2]">
                <TableHead className="text-gray-600 font-semibold h-10">Owner</TableHead>
                <TableHead className="text-gray-600 font-semibold h-10">Username</TableHead>
                <TableHead className="text-gray-600 font-semibold h-10">Contact Info</TableHead>
                <TableHead className="text-gray-600 font-semibold h-10">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground animate-pulse">
                    Retrieving property owners...
                  </TableCell>
                </TableRow>
              ) : filteredOwners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No owners found matching search criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOwners.slice(0, visibleCount).map((owner) => (
                  <TableRow
                    key={owner.id}
                    className="border-b border-[#FFE0C2] hover:bg-[#FFF3E8] transition-colors"
                  >
                    <TableCell className="font-medium p-3 flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-[#FFE0C2] flex items-center justify-center text-[#F97316] font-semibold text-xs">
                        {owner.fullName?.[0]?.toUpperCase() || <User size={12} />}
                      </div>
                      <span className="text-gray-800">{owner.fullName || "—"}</span>
                    </TableCell>
                    <TableCell className="font-mono text-gray-700 p-3">{owner.username}</TableCell>
                    <TableCell className="p-3 space-y-1">
                      {owner.email && (
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Mail size={12} className="text-[#F97316]" />
                          <span>{owner.email}</span>
                        </div>
                      )}
                      {owner.phone && (
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Phone size={12} className="text-[#F97316]" />
                          <span>{owner.phone}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="p-3">
                      <Badge
                        variant="secondary"
                        className={
                          owner.status === "active"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }
                      >
                        {owner.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {filteredOwners.length > visibleCount && (
            <div className="p-3 text-center border-t border-[#FFE0C2]">
              <button 
                className="text-xs bg-[#FFF1E6] hover:bg-[#FFE0C2] text-[#F97316] border border-[#FFE0C2] px-4 py-1.5 rounded transition-colors font-medium"
                onClick={() => setVisibleCount(v => v + 10)}
              >
                Load More ({filteredOwners.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
