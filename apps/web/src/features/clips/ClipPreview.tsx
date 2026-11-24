import type { Clip } from "@clipper/shared";
import { api } from "../../lib/api.ts";
import { copy } from "../../lib/copy.ts";
import styles from "./ClipPreview.module.css";

type ClipPreviewProps = {
  jobId: string;
  clip: Clip;
  sourcePath: string;
};

/**
 * Rendered clip: the final 9:16 video. Before rendering: the source video limited to the
 * clip range, so the user can check the cut.
 */
export function ClipPreview({ jobId, clip, sourcePath }: ClipPreviewProps) {
  if (clip.output) {
    return (
      <div className={styles.frame}>
        {/* Captions are burned into the rendered video itself. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- subtitles are part of the picture */}
        <video
          key={clip.output}
          className={styles.vertical}
          src={`${api.mediaUrl(jobId, clip.output)}?v=${encodeURIComponent(clip.stages.render.finishedAt ?? "")}`}
          controls
          preload="metadata"
          aria-label={copy.clipEditor.finalPreview}
        />
      </div>
    );
  }

  return (
    <div className={styles.sourceWrap}>
      <video
        className={styles.source}
        // Media fragment: the browser starts and stops at the clip range.
        src={`${api.mediaUrl(jobId, sourcePath)}#t=${clip.startSec.toFixed(2)},${clip.endSec.toFixed(2)}`}
        controls
        preload="metadata"
        aria-label={copy.clipEditor.sourcePreview}
      >
        <track
          kind="captions"
          src={api.transcriptVttUrl(jobId)}
          srcLang="id"
          label={copy.transcript.title}
        />
      </video>
      <p className={styles.note}>{copy.clipEditor.sourceNote}</p>
    </div>
  );
}
