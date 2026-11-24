import type { JobStatus, StageStatus } from "@clipper/shared";
import type { Tone } from "../../components/ui/StatusBadge.tsx";

export const jobStatusTone: Record<JobStatus, Tone> = {
  queued: "neutral",
  analyzing: "active",
  ready: "success",
  failed: "danger",
  cancelled: "warning",
};

export const stageStatusTone: Record<StageStatus, Tone> = {
  pending: "neutral",
  running: "active",
  done: "success",
  failed: "danger",
  skipped: "neutral",
  cancelled: "warning",
};
