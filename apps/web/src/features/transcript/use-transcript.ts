import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";

export function useTranscript(jobId: string, isAvailable: boolean) {
  return useQuery({
    queryKey: ["jobs", jobId, "transcript"],
    queryFn: ({ signal }) => api.getTranscript(jobId, signal),
    enabled: isAvailable,
    staleTime: Infinity,
  });
}
