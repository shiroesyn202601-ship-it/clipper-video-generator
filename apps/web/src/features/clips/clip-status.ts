import type { ClipStatus } from "@clipper/shared";
import type { Tone } from "../../components/ui/StatusBadge.tsx";

export const clipStatusTone: Record<ClipStatus, Tone> = {
  draft: "neutral",
  queued: "neutral",
  rendering: "active",
  done: "success",
  failed: "danger",
  cancelled: "warning",
};
