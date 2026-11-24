import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";

export function useCandidates(jobId: string, isAvailable: boolean) {
  return useQuery({
    queryKey: ["jobs", jobId, "candidates"],
    queryFn: ({ signal }) => api.getCandidates(jobId, signal),
    enabled: isAvailable,
    staleTime: Infinity,
  });
}
