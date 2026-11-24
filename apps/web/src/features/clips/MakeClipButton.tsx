import type { Clip, ClipCandidate } from "@clipper/shared";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button.tsx";
import { errorText } from "../../lib/api.ts";
import { copy } from "../../lib/copy.ts";
import { useCreateClip } from "./clip-queries.ts";
import styles from "./MakeClipButton.module.css";

type MakeClipButtonProps = {
  jobId: string;
  candidate: ClipCandidate;
  existingClip: Clip | undefined;
};

/** Opens the clip editor for a candidate, creating the clip first when needed. */
export function MakeClipButton({ jobId, candidate, existingClip }: MakeClipButtonProps) {
  const navigate = useNavigate();
  const createClip = useCreateClip(jobId);
  const openEditor = (clipId: string): void => {
    navigate(`/jobs/${jobId}/clips/${clipId}`);
  };

  if (existingClip) {
    return (
      <Button variant="secondary" onClick={() => openEditor(existingClip.id)}>
        {copy.clips.open}
      </Button>
    );
  }
  return (
    <>
      {createClip.isError && (
        <span role="alert" className={styles.error}>
          {errorText(createClip.error)}
        </span>
      )}
      <Button
        variant="primary"
        isBusy={createClip.isPending}
        onClick={() =>
          createClip.mutate(candidate.id, { onSuccess: (clip) => openEditor(clip.id) })
        }
      >
        {copy.clips.make}
      </Button>
    </>
  );
}
