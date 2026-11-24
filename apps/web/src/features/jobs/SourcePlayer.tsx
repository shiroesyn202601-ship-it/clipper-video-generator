import type { Ref } from "react";
import { api } from "../../lib/api.ts";
import { copy } from "../../lib/copy.ts";
import styles from "./SourcePlayer.module.css";

type SourcePlayerProps = {
  jobId: string;
  sourcePath: string;
  hasTranscript: boolean;
  language: string;
  videoRef: Ref<HTMLVideoElement>;
  onTimeUpdate: (timeSec: number) => void;
};

export function SourcePlayer({
  jobId,
  sourcePath,
  hasTranscript,
  language,
  videoRef,
  onTimeUpdate,
}: SourcePlayerProps) {
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- the captions track is added as soon as the transcript exists; before that there is nothing to caption
    <video
      ref={videoRef}
      className={styles.video}
      src={api.mediaUrl(jobId, sourcePath)}
      controls
      preload="metadata"
      aria-label={copy.job.sourcePreview}
      onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
    >
      {hasTranscript && (
        <track
          kind="captions"
          src={api.transcriptVttUrl(jobId)}
          srcLang={language === "auto" ? "id" : language}
          label={copy.transcript.title}
        />
      )}
    </video>
  );
}
