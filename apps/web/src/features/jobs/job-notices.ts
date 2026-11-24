import type { Job } from "@clipper/shared";
import { copy } from "../../lib/copy.ts";
import type { DesktopNotice } from "../../lib/notify.ts";

/**
 * Pop-ups for what changed between two snapshots of a job: transcript done, analysis
 * finished or failed, and each clip render finished or failed. Without a previous snapshot
 * (first load) nothing is reported, so opening an old job stays quiet.
 */
export function jobNotices(previous: Job | undefined, next: Job): DesktopNotice[] {
  if (!previous || previous.id !== next.id) return [];
  const text = copy.notifications;
  const name = next.title ?? text.untitled;
  const jobTag = `job-${next.id}`;
  const notices: DesktopNotice[] = [];

  const transcribe = next.stages.transcribe;
  if (previous.stages.transcribe.status !== "done" && transcribe.status === "done") {
    notices.push({
      title: text.transcribed,
      body: transcribe.message ? `${name}\n${transcribe.message}` : name,
      tag: jobTag,
    });
  }

  if (previous.status !== next.status) {
    if (next.status === "ready") {
      notices.push({ title: text.ready, body: name, tag: jobTag });
    } else if (next.status === "failed") {
      notices.push({
        title: text.failed,
        body: next.error ? `${name}\n${next.error.userMessage}` : name,
        tag: jobTag,
      });
    }
  }

  for (const clip of next.clips) {
    const before = previous.clips.find((item) => item.id === clip.id);
    if (!before) continue;
    const clipTag = `clip-${clip.id}`;
    if (!before.output && clip.output) {
      notices.push({ title: text.rendered, body: name, tag: clipTag });
    } else if (!before.error && clip.error) {
      notices.push({
        title: text.renderFailed,
        body: `${name}\n${clip.error.userMessage}`,
        tag: clipTag,
      });
    }
  }
  return notices;
}
