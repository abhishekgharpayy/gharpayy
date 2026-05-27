import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// MOCK STORE FOR NOW until backend implements GET/POST /leads/:id/interests
let mockStore: Record<string, string[]> = {};

export function useLeadInterests(leadId: "all"): UseQueryResult<Record<string, string[]>>;
export function useLeadInterests(leadId: string): UseQueryResult<string[]>;
export function useLeadInterests(leadId: string): UseQueryResult<string[] | Record<string, string[]>> {
  return useQuery({
    queryKey: ["leadInterests", leadId],
    queryFn: async () => {
      if (leadId === "all") {
        return mockStore;
      }
      try {
        const res = await apiClient.get<string[]>(`/leads/${leadId}/interests`);
        return res;
      } catch (e) {
        // Fallback to mock while backend is blocked
        return mockStore[leadId] || [];
      }
    },
  });
}

export function useToggleInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, propertyId }: { leadId: string; propertyId: string }) => {
      try {
        await apiClient.post(`/leads/${leadId}/interests/toggle`, { propertyId });
      } catch (e) {
        // Fallback to mock
        const cur = mockStore[leadId] || [];
        mockStore[leadId] = cur.includes(propertyId)
          ? cur.filter((x) => x !== propertyId)
          : [...cur, propertyId];
      }
    },
    onMutate: async ({ leadId, propertyId }) => {
      await queryClient.cancelQueries({ queryKey: ["leadInterests", leadId] });
      const prev = queryClient.getQueryData<string[]>(["leadInterests", leadId]) || [];
      const next = prev.includes(propertyId) ? prev.filter(x => x !== propertyId) : [...prev, propertyId];
      queryClient.setQueryData(["leadInterests", leadId], next);
      return { prev };
    },
    onError: (_err, { leadId }, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["leadInterests", leadId], context.prev);
      }
    },
    onSettled: (_data, _err, { leadId }) => {
      queryClient.invalidateQueries({ queryKey: ["leadInterests", leadId] });
    },
  });
}

export function useClearInterests() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId }: { leadId: string }) => {
      try {
        await apiClient.delete(`/leads/${leadId}/interests`);
      } catch (e) {
        mockStore[leadId] = [];
      }
    },
    onMutate: async ({ leadId }) => {
      await queryClient.cancelQueries({ queryKey: ["leadInterests", leadId] });
      queryClient.setQueryData(["leadInterests", leadId], []);
    },
    onSettled: (_data, _err, { leadId }) => {
      queryClient.invalidateQueries({ queryKey: ["leadInterests", leadId] });
    },
  });
}
