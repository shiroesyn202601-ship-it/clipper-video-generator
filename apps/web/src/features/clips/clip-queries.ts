import type { Clip, GenerateCommentaryBody, Job, UpdateClipBody } from "@clipper/shared";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";
import { jobKeys } from "../jobs/job-queries.ts";

/** Puts a fresh clip into the cached job (SSE will confirm it moments later). */
function storeClip(queryClient: QueryClient, jobId: string, clip: Clip): void {
  queryClient.setQueryData<Job>(jobKeys.detail(jobId), (job) => {
    if (!job) return job;
    const exists = job.clips.some((item) => item.id === clip.id);
    return {
      ...job,
      clips: exists
        ? job.clips.map((item) => (item.id === clip.id ? clip : item))
        : [...job.clips, clip],
    };
  });
}

export function useCreateClip(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidateId: string) => api.createClip(jobId, { candidateId }),
    onSuccess: (clip) => storeClip(queryClient, jobId, clip),
  });
}

export function useUpdateClip(jobId: string, clipId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateClipBody) => api.updateClip(jobId, clipId, body),
    onSuccess: (clip) => storeClip(queryClient, jobId, clip),
  });
}

export function useGenerateCommentary(jobId: string, clipId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateCommentaryBody) => api.generateCommentary(jobId, clipId, body),
    onSuccess: (clip) => storeClip(queryClient, jobId, clip),
  });
}

export function useRenderClip(jobId: string, clipId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.renderClip(jobId, clipId),
    onSuccess: (clip) => storeClip(queryClient, jobId, clip),
  });
}

export function useCancelClip(jobId: string, clipId: string) {
  return useMutation({ mutationFn: () => api.cancelClip(jobId, clipId) });
}

export function useRevealClip(jobId: string, clipId: string) {
  return useMutation({ mutationFn: () => api.revealClip(jobId, clipId) });
}

export function useDeleteClip(jobId: string, clipId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteClip(jobId, clipId),
    onSuccess: () => {
      queryClient.setQueryData<Job>(jobKeys.detail(jobId), (job) =>
        job ? { ...job, clips: job.clips.filter((item) => item.id !== clipId) } : job,
      );
    },
  });
}
