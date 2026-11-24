import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";

export const healthQueryKey = ["health"] as const;

export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: ({ signal }) => api.getHealth(signal),
    staleTime: 60_000,
  });
}
