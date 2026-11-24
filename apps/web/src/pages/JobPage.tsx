import {
  ANALYSIS_STAGE_IDS,
  analysisProgress,
  type ClipCandidate,
  type Job,
} from "@clipper/shared";
import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ProgressBar } from "../components/ui/ProgressBar.tsx";
import { Tabs, type TabItem } from "../components/ui/Tabs.tsx";
import { CandidateList } from "../features/candidates/CandidateList.tsx";
import { useCandidates } from "../features/candidates/use-candidates.ts";
import { JobHeader } from "../features/jobs/JobHeader.tsx";
import { SourcePlayer } from "../features/jobs/SourcePlayer.tsx";
import { StageList } from "../features/jobs/StageList.tsx";
import { useJob, useJobEvents } from "../features/jobs/job-queries.ts";
import { TranscriptPanel } from "../features/transcript/TranscriptPanel.tsx";
import { useTranscript } from "../features/transcript/use-transcript.ts";
import { errorText } from "../lib/api.ts";
import { copy } from "../lib/copy.ts";
import { toPercent } from "../lib/format.ts";
import styles from "./JobPage.module.css";

type PanelId = "candidates" | "transcript";

export function JobPage() {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const job = useJob(jobId);
  const goHome = useCallback(() => {
    navigate("/");
  }, [navigate]);
  useJobEvents(jobId, goHome);

  if (job.isPending) return <div className={styles.skeleton} aria-label={copy.common.loading} />;
  if (job.isError) {
    return (
      <div className={styles.errorBox} role="alert">
        <p>{errorText(job.error)}</p>
        <Link to="/">{copy.errors.backHome}</Link>
      </div>
    );
  }
  return <JobView job={job.data} onDeleted={goHome} />;
}

function JobView({ job, onDeleted }: { job: Job; onDeleted: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const hasTranscript = job.stages.transcribe.status === "done";
  const hasCandidates = job.stages["find-moments"].status === "done";
  const [panel, setPanel] = useState<PanelId>(hasCandidates ? "candidates" : "transcript");
  const [preview, setPreview] = useState<ClipCandidate | null>(null);
  const transcript = useTranscript(job.id, hasTranscript);
  const candidates = useCandidates(job.id, hasCandidates);
  const isActive = job.status === "queued" || job.status === "analyzing";
  const progress = analysisProgress(job);
  const sourcePath = job.stages.download.status === "done" ? job.artifacts.sourceVideo : undefined;

  const seek = (timeSec: number): void => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = timeSec;
    void video.play().catch(() => undefined);
  };

  const handleTimeUpdate = (timeSec: number): void => {
    setCurrentTimeSec(timeSec);
    if (preview && timeSec >= preview.endSec) {
      videoRef.current?.pause();
      setPreview(null);
    }
  };

  const startPreview = (candidate: ClipCandidate): void => {
    setPreview(candidate);
    seek(candidate.startSec);
  };

  const panels: TabItem<PanelId>[] = [
    {
      id: "candidates",
      label: copy.candidates.title,
      ...(candidates.data ? { badge: String(candidates.data.candidates.length) } : {}),
      content: !hasCandidates ? (
        <p className={styles.muted}>{copy.candidates.notYet}</p>
      ) : candidates.isPending ? (
        <p className={styles.muted}>{copy.common.loading}</p>
      ) : candidates.isError ? (
        <p role="alert">{errorText(candidates.error)}</p>
      ) : (
        <CandidateList
          candidates={candidates.data.candidates}
          previewingId={preview?.id ?? null}
          onPreview={startPreview}
        />
      ),
    },
    {
      id: "transcript",
      label: copy.transcript.title,
      content: !hasTranscript ? (
        <p className={styles.muted}>{copy.transcript.notYet}</p>
      ) : transcript.isPending ? (
        <p className={styles.muted}>{copy.common.loading}</p>
      ) : transcript.isError ? (
        <p role="alert">{errorText(transcript.error)}</p>
      ) : (
        <TranscriptPanel
          segments={transcript.data.segments}
          currentTimeSec={currentTimeSec}
          onSeek={seek}
        />
      ),
    },
  ];

  const stages = (
    <section className={styles.section} aria-labelledby="stages-title">
      <div className={styles.sectionHead}>
        <h2 id="stages-title" className={styles.subtitle}>
          {copy.job.stagesTitle}
        </h2>
        {isActive && <span className={styles.num}>{copy.job.progress(toPercent(progress))}</span>}
      </div>
      {isActive && <ProgressBar value={progress} label={copy.job.stagesTitle} />}
      <StageList stages={ANALYSIS_STAGE_IDS.map((id) => ({ id, state: job.stages[id] }))} />
    </section>
  );

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.back}>
        ← {copy.job.back}
      </Link>
      <JobHeader job={job} onDeleted={onDeleted} />

      {sourcePath ? (
        <div className={styles.workbench}>
          <div className={styles.main}>
            <SourcePlayer
              jobId={job.id}
              sourcePath={sourcePath}
              hasTranscript={hasTranscript}
              language={job.settings.language}
              videoRef={videoRef}
              onTimeUpdate={handleTimeUpdate}
            />
            {stages}
          </div>
          <aside className={styles.side}>
            <Tabs items={panels} activeId={panel} onChange={setPanel} label={copy.job.panels} />
          </aside>
        </div>
      ) : (
        stages
      )}
    </div>
  );
}
