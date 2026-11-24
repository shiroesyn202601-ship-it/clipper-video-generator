"""Pure framing logic: who to follow and how the 9:16 crop moves. No I/O, fully unit tested."""

from __future__ import annotations

from dataclasses import dataclass
from itertools import pairwise

# Weight of mouth activity vs. face size when choosing the active speaker.
ACTIVITY_WEIGHT = 0.7
SIZE_WEIGHT = 0.3
# A new subject must be the best for this long before the camera switches (seconds).
SWITCH_MIN_SEC = 1.0
# ...and beat the current subject's score by this factor.
SWITCH_MARGIN = 1.15
# Ignore target moves smaller than this share of the source width (dead zone).
DEAD_ZONE_RATIO = 0.03
# Follow speed: share of the remaining distance covered per second.
FOLLOW_RATE_PER_SEC = 2.5
# Hard limit on pan speed, as a share of the source width per second.
MAX_PAN_RATIO_PER_SEC = 0.5


@dataclass(frozen=True)
class FaceObservation:
    track_id: int
    center_x: float
    width: float
    activity: float  # smoothed mouth-motion energy, >= 0


@dataclass(frozen=True)
class FrameObservation:
    time_sec: float
    faces: tuple[FaceObservation, ...]


@dataclass(frozen=True)
class Keyframe:
    time_sec: float
    center_x: float


def face_score(face: FaceObservation, max_activity: float, max_width: float) -> float:
    activity = face.activity / max_activity if max_activity > 0 else 0.0
    size = face.width / max_width if max_width > 0 else 0.0
    return ACTIVITY_WEIGHT * activity + SIZE_WEIGHT * size


def choose_subjects(frames: list[FrameObservation]) -> list[int | None]:
    """Track id to follow at each frame (None when no face). Switches use hysteresis."""
    chosen: list[int | None] = []
    current: int | None = None
    challenger: int | None = None
    challenger_since = 0.0
    for frame in frames:
        if not frame.faces:
            chosen.append(current)
            continue
        max_activity = max(face.activity for face in frame.faces)
        max_width = max(face.width for face in frame.faces)
        scores = {face.track_id: face_score(face, max_activity, max_width) for face in frame.faces}
        best = max(scores, key=lambda track: scores[track])
        if current is None or current not in scores:
            current, challenger = best, None
        elif best != current and scores[best] > scores[current] * SWITCH_MARGIN:
            if challenger != best:
                challenger, challenger_since = best, frame.time_sec
            elif frame.time_sec - challenger_since >= SWITCH_MIN_SEC:
                current, challenger = best, None
        else:
            challenger = None
        chosen.append(current)
    return chosen


def clamp_center(center_x: float, source_width: float, crop_width: float) -> float:
    half = crop_width / 2
    return min(max(center_x, half), source_width - half)


def smooth_path(
    times: list[float],
    targets: list[float | None],
    subjects: list[int | None],
    source_width: float,
    crop_width: float,
) -> list[Keyframe]:
    """Camera path: follows the target smoothly, cuts instantly when the subject changes.

    A cut is encoded as two keyframes with the same time, so linear interpolation jumps.
    """
    if not times:
        return [Keyframe(0.0, source_width / 2)]
    dead_zone = DEAD_ZONE_RATIO * source_width
    max_step_per_sec = MAX_PAN_RATIO_PER_SEC * source_width
    first_target = next((target for target in targets if target is not None), source_width / 2)
    position = clamp_center(first_target, source_width, crop_width)
    keyframes = [Keyframe(times[0], position)]
    previous_time = times[0]
    previous_subject = next((subject for subject in subjects if subject is not None), None)

    for time_sec, target, subject in zip(times, targets, subjects, strict=True):
        dt = max(0.0, time_sec - previous_time)
        previous_time = time_sec
        if target is None:
            keyframes.append(Keyframe(time_sec, position))
            continue
        goal = clamp_center(target, source_width, crop_width)
        if subject is not None and subject != previous_subject:
            keyframes.append(Keyframe(time_sec, position))
            position = goal
            keyframes.append(Keyframe(time_sec, position))
            previous_subject = subject
            continue
        distance = goal - position
        if abs(distance) > dead_zone:
            step = distance * min(1.0, FOLLOW_RATE_PER_SEC * dt)
            limit = max_step_per_sec * dt
            position += max(-limit, min(limit, step))
        keyframes.append(Keyframe(time_sec, position))
    return keyframes


def interpolate(keyframes: list[Keyframe], time_sec: float) -> float:
    """Crop center at `time_sec`; holds the edges, jumps at cuts (duplicate times)."""
    if time_sec <= keyframes[0].time_sec:
        return keyframes[0].center_x
    for left, right in pairwise(keyframes):
        if left.time_sec <= time_sec < right.time_sec:
            span = right.time_sec - left.time_sec
            ratio = (time_sec - left.time_sec) / span
            return left.center_x + (right.center_x - left.center_x) * ratio
    return keyframes[-1].center_x
