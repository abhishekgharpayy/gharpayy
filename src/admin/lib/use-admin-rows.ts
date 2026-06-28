import { useMemo } from "react";
import { useAdminLeads } from "@/hooks/api/useAdminLeads";
import type { AdminLeadRow } from "@/hooks/api/useAdminLeads";

export function useAdminRows(): AdminLeadRow[] {
  const { data } = useAdminLeads();
  return useMemo(() => data?.rows ?? [], [data?.rows]);
}
