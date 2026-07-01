import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface ImportLead {
  name?: string;
  phone?: string;
  Phone?: string;
  source?: string;
  budget?: number | string;
  preferredArea?: string;
  area?: string;
  moveInDate?: string;
  tags?: string | string[];
  email?: string;
  address?: string;
  notes?: string;
  type?: string;
  room?: string;
  need?: string;
}

export interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    created: number;
    duplicates: number;
    rejected: number;
  };
  created: Array<{ id: string; name: string; phone: string }>;
  duplicates: Array<{ phone: string; existingLeadId: string }>;
  rejected: Array<{ phone: string; reason: string }>;
}

export const importKeys = {
  all: ["leads-import"] as const,
};

export function useLeadImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leads: ImportLead[]) =>
      apiClient.post<ImportResult>("/api/leads/import", { leads }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["admin-leads"] });
    },
  });
}
