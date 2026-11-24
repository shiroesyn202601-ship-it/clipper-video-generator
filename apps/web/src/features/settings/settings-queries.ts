import type { AppSettings, UpdateAppSettingsBody } from "@clipper/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";

const settingsKey = ["settings"] as const;
const fontsKey = ["fonts"] as const;

export function useAppSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: ({ signal }) => api.getSettings(signal) });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAppSettingsBody) => api.updateSettings(body),
    onSuccess: (settings: AppSettings) => queryClient.setQueryData(settingsKey, settings),
  });
}

/** Which caption fonts are downloaded; rarely changes, so it is fetched once. */
export function useCaptionFonts() {
  return useQuery({
    queryKey: fontsKey,
    queryFn: ({ signal }) => api.getFonts(signal),
    staleTime: Infinity,
  });
}
