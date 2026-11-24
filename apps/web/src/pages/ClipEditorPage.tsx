import {
  CLIP_STAGE_IDS,
  clipProgress,
  clipStatus,
  splitSentences,
  type Caption,
  type CaptionStyle,
  type Clip,
  type Job,
} from "@clipper/shared";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button.tsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { ProgressBar } from "../components/ui/ProgressBar.tsx";
import { StatusBadge } from "../components/ui/StatusBadge.tsx";
import { CaptionEditor } from "../features/clips/CaptionEditor.tsx";
import { CaptionStyleEditor } from "../features/clips/CaptionStyleEditor.tsx";
import { ClipPreview } from "../features/clips/ClipPreview.tsx";
import { RangeControls } from "../features/clips/RangeControls.tsx";
import {
  useCancelClip,
  useDeleteClip,
  useRenderClip,
  useRevealClip,
  useUpdateClip,
} from "../features/clips/clip-queries.ts";
import { clipStatusTone } from "../features/clips/clip-status.ts";
import { StageList } from "../features/jobs/StageList.tsx";
import { useJob, useJobEvents } from "../features/jobs/job-queries.ts";
import { useAppSettings, useUpdateAppSettings } from "../features/settings/settings-queries.ts";
import { useTranscript } from "../features/transcript/use-transcript.ts";
import { api, errorText } from "../lib/api.ts";
import { copy } from "../lib/copy.ts";
import { toPercent } from "../lib/format.ts";
import { requestNotificationPermission } from "../lib/notify.ts";
import styles from "./ClipEditorPage.module.css";

export function ClipEditorPage() {
  const { jobId = "", clipId = "" } = useParams();
  const navigate = useNavigate();
  const job = useJob(jobId);
  useJobEvents(jobId);

  if (job.isPending) return <div className={styles.skeleton} aria-label={copy.common.loading} />;
  if (job.isError) return <p role="alert">{errorText(job.error)}</p>;
  const index = job.data.clips.findIndex((item) => item.id === clipId);
  const clip = job.data.clips[index];
  if (!clip) {
    return (
      <div className={styles.page}>
        <p role="alert">{copy.clipEditor.notFound}</p>
        <Link to={`/jobs/${jobId}`}>{copy.clipEditor.back}</Link>
      </div>
    );
  }
  return (
    <ClipEditor
      // Remount when the server changes the clip so local caption edits never go stale.
      key={`${clip.id}-${clip.startSec}-${clip.endSec}`}
      job={job.data}
      clip={clip}
      number={index + 1}
      onDeleted={() => {
        navigate(`/jobs/${jobId}`);
      }}
    />
  );
}

type ClipEditorProps = { job: Job; clip: Clip; number: number; onDeleted: () => void };

function ClipEditor({ job, clip, number, onDeleted }: ClipEditorProps) {
  const transcript = useTranscript(job.id, true);
  const update = useUpdateClip(job.id, clip.id);
  const render = useRenderClip(job.id, clip.id);
  const cancel = useCancelClip(job.id, clip.id);
  const reveal = useRevealClip(job.id, clip.id);
  const remove = useDeleteClip(job.id, clip.id);
  const [draftCaptions, setDraftCaptions] = useState<Caption[] | null>(null);
  /** undefined = unchanged; null = back to the legacy look. */
  const [draftStyle, setDraftStyle] = useState<CaptionStyle | null | undefined>(undefined);
  const [draftUseBrand, setDraftUseBrand] = useState<boolean | undefined>(undefined);
  const settings = useAppSettings();
  const saveSettings = useUpdateAppSettings();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const status = clipStatus(clip);
  const isBusy = status === "rendering" || status === "queued";
  const captions = draftCaptions ?? clip.captions;
  const captionStyle = draftStyle === undefined ? clip.captionStyle : draftStyle;
  const isDefaultStyle =
    JSON.stringify(settings.data?.defaultCaptionStyle ?? null) === JSON.stringify(captionStyle);
  const useBrand = draftUseBrand ?? clip.useBrand;
  const isBrandEnabled = settings.data?.brand.enabled === true;
  const isDirty =
    draftCaptions !== null || draftStyle !== undefined || draftUseBrand !== undefined;
  const sentences = useMemo(
    () => (transcript.data ? splitSentences(transcript.data) : []),
    [transcript.data],
  );
  const error =
    update.error ??
    render.error ??
    cancel.error ??
    remove.error ??
    reveal.error ??
    saveSettings.error;
  const sourcePath = job.artifacts.sourceVideo;

  const discardDrafts = (): void => {
    setDraftCaptions(null);
    setDraftStyle(undefined);
    setDraftUseBrand(undefined);
  };

  const handleRender = (): void => {
    requestNotificationPermission();
    if (!isDirty) {
      render.mutate();
      return;
    }
    update.mutate(
      {
        ...(draftCaptions ? { captions: draftCaptions } : {}),
        ...(draftStyle !== undefined ? { captionStyle: draftStyle } : {}),
        ...(draftUseBrand !== undefined ? { useBrand: draftUseBrand } : {}),
      },
      {
        onSuccess: () => {
          discardDrafts();
          render.mutate();
        },
      },
    );
  };

  return (
    <div className={styles.page}>
      <Link to={`/jobs/${job.id}`} className={styles.back}>
        <Icon name="chevron-left" />
        {copy.clipEditor.back}
      </Link>
      <header className={styles.header}>
        <h1 className={styles.title}>{copy.clips.name(number)}</h1>
        <StatusBadge tone={clipStatusTone[status]} label={copy.clipStatus[status]} />
        <div className={styles.actions}>
          {clip.output && (
            <>
              <a
                className={styles.download}
                href={api.mediaUrl(job.id, clip.output)}
                download={`clip-${number}.mp4`}
              >
                <Icon name="download" />
                {copy.clipEditor.download}
              </a>
              <Button variant="ghost" icon={<Icon name="folder" />} onClick={() => reveal.mutate()}>
                {copy.clipEditor.reveal}
              </Button>
            </>
          )}
          <Button variant="danger" onClick={() => setIsConfirmingDelete(true)}>
            {copy.clipEditor.delete}
          </Button>
        </div>
      </header>

      {(error ?? clip.error) && (
        <p className={styles.errorBox} role="alert">
          {error ? errorText(error) : clip.error?.userMessage}
        </p>
      )}

      <div className={styles.layout}>
        <div className={styles.preview}>
          {sourcePath && <ClipPreview jobId={job.id} clip={clip} sourcePath={sourcePath} />}
        </div>
        <div className={styles.side}>
          <RangeControls
            startSec={clip.startSec}
            endSec={clip.endSec}
            sentenceStarts={sentences.map((sentence) => sentence.startSec)}
            sentenceEnds={sentences.map((sentence) => sentence.endSec)}
            isDisabled={isBusy || update.isPending}
            onChange={(range) => update.mutate(range)}
          />

          <section className={styles.section} aria-labelledby="captions-title">
            <h2 id="captions-title" className={styles.subtitle}>
              {copy.clipEditor.captions}
            </h2>
            <CaptionEditor captions={captions} isDisabled={isBusy} onChange={setDraftCaptions} />
          </section>

          <section className={styles.section} aria-labelledby="caption-style-title">
            <h2 id="caption-style-title" className={styles.subtitle}>
              {copy.captionStyle.title}
            </h2>
            <CaptionStyleEditor
              value={captionStyle}
              isDisabled={isBusy}
              isDefault={isDefaultStyle}
              isSavingDefault={saveSettings.isPending}
              onChange={setDraftStyle}
              onSaveDefault={(style) => saveSettings.mutate({ defaultCaptionStyle: style })}
            />
          </section>

          <section className={styles.section} aria-labelledby="brand-title">
            <h2 id="brand-title" className={styles.subtitle}>
              {copy.brand.title}
            </h2>
            <label className={styles.brandToggle}>
              <input
                type="checkbox"
                checked={useBrand}
                disabled={isBusy}
                onChange={(event) => setDraftUseBrand(event.target.checked)}
              />
              <span>{copy.brand.useBrand}</span>
            </label>
            {!isBrandEnabled && (
              <p className={styles.hint}>
                <Link to="/brand">{copy.brand.brandOff}</Link>
              </p>
            )}
          </section>

          <div className={styles.renderBar}>
            {isBusy ? (
              <>
                <ProgressBar value={clipProgress(clip)} label={copy.clipEditor.renderProgress} />
                <span className={styles.percent}>{toPercent(clipProgress(clip))}%</span>
                <Button onClick={() => cancel.mutate()} isBusy={cancel.isPending}>
                  {copy.common.cancel}
                </Button>
              </>
            ) : (
              <>
                {isDirty && (
                  <Button variant="ghost" onClick={discardDrafts}>
                    {copy.clipEditor.discard}
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleRender}
                  isBusy={render.isPending || update.isPending}
                >
                  {clip.output && !isDirty ? copy.clipEditor.rerender : copy.clipEditor.render}
                </Button>
              </>
            )}
          </div>

          <StageList stages={CLIP_STAGE_IDS.map((id) => ({ id, state: clip.stages[id] }))} />
        </div>
      </div>

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title={copy.clipEditor.deleteTitle}
        body={copy.clipEditor.deleteBody}
        confirmLabel={copy.job.deleteConfirm}
        isBusy={remove.isPending}
        onClose={() => setIsConfirmingDelete(false)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onDeleted })}
      />
    </div>
  );
}
