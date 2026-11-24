import { jobEventSchema, type Job, type JobSettings, type JobSummary } from "@clipper/shared";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../../lib/api.ts";
import { showNotification } from "../../lib/notify.ts";
import { jobNotices } from "./job-notices.ts";

export const jobKeys = {
  all: ["jobs"] as const,
  detail: (jobId: string) => ["jobs", jobId] as const,
};

export function useJobs() {
  return useQuery({
    queryKey: jobKeys.all,
    queryFn: ({ signal }) => api.listJobs(signal),
  });
}

export function useJob(jobId: string) {
  return useQuery({
    queryKey: jobKeys.detail(jobId),
    queryFn: ({ signal }) => api.getJob(jobId, signal),
  });
}

function toSummary(job: Job): JobSummary {
  const { id, createdAt, source, title, durationSec, status, error } = job;
  return { id, createdAt, source, title, durationSec, status, error };
}

/** Writes a fresh job snapshot into both the detail and the list cache. */
export function storeJob(queryClient: QueryClient, job: Job): void {
  queryClient.setQueryData(jobKeys.detail(job.id), job);
  queryClient.setQueryData<JobSummary[]>(jobKeys.all, (list) => {
    if (!list) return list;
    const summary = toSummary(job);
    const exists = list.some((item) => item.id === job.id);
    return exists ? list.map((item) => (item.id === job.id ? summary : item)) : [summary, ...list];
  });
}

/** Subscribes to server-sent events for one job and keeps the query cache current. */
export function useJobEvents(jobId: string, onDeleted?: () => void): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource(api.jobEventsUrl(jobId));
    source.onmessage = (message: MessageEvent<string>) => {
      const parsed = jobEventSchema.safeParse(JSON.parse(message.data));
      if (!parsed.success) return;
      if (parsed.data.type === "job-update") {
        const next = parsed.data.job;
        const previous = queryClient.getQueryData<Job>(jobKeys.detail(next.id));
        storeJob(queryClient, next);
        jobNotices(previous, next).forEach(showNotification);
      } else {
        queryClient.removeQueries({ queryKey: jobKeys.detail(jobId) });
        void queryClient.invalidateQueries({ queryKey: jobKeys.all });
        onDeleted?.();
      }
    };
    return () => source.close();
  }, [jobId, queryClient, onDeleted]);
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createJob,
    onSuccess: (job) => storeJob(queryClient, job),
  });
}

export function useUploadJob(onProgress: (fraction: number) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { file: File; settings: JobSettings }) =>
      api.uploadJob({ ...variables, onProgress }),
    onSuccess: (job) => storeJob(queryClient, job),
  });
}

export function useJobAction(action: "cancel" | "retry") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      action === "cancel" ? api.cancelJob(jobId) : api.retryJob(jobId),
    onSuccess: (job) => storeJob(queryClient, job),
  });
}

export function useSkipStage(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) => api.skipStage(jobId, stageId),
    onSuccess: (job) => storeJob(queryClient, job),
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteJob,
    onSuccess: (_result, jobId) => {
      queryClient.removeQueries({ queryKey: jobKeys.detail(jobId) });
      queryClient.setQueryData<JobSummary[]>(jobKeys.all, (list) =>
        list?.filter((item) => item.id !== jobId),
      );
    },
  });
}
