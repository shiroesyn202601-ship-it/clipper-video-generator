from clipper_workers.framing import (
    FaceObservation,
    FrameObservation,
    Keyframe,
    choose_subjects,
    clamp_center,
    interpolate,
    smooth_path,
)

WIDTH = 1920.0
CROP = 608.0


def frame(time_sec: float, *faces: tuple[int, float, float]) -> FrameObservation:
    return FrameObservation(
        time_sec,
        tuple(
            FaceObservation(track_id, center, 200.0, activity)
            for track_id, center, activity in faces
        ),
    )


def test_switches_only_after_the_challenger_dominates_long_enough() -> None:
    frames = [frame(t / 5, (1, 500, 1.0), (2, 1400, 0.1)) for t in range(5)]
    # Speaker 2 starts talking at t=1.0 s.
    frames += [frame(1 + t / 5, (1, 500, 0.1), (2, 1400, 1.0)) for t in range(10)]
    subjects = choose_subjects(frames)
    assert subjects[:5] == [1] * 5
    # Not yet switched during the first second of the challenger...
    assert subjects[5:10] == [1] * 5
    # ...then switched for good.
    assert subjects[-1] == 2


def test_brief_challenger_does_not_cause_a_switch() -> None:
    frames = [frame(0.0, (1, 500, 1.0), (2, 1400, 0.1))]
    frames += [frame(0.2, (1, 500, 0.1), (2, 1400, 1.0))]
    frames += [frame(0.4 + t / 5, (1, 500, 1.0), (2, 1400, 0.1)) for t in range(5)]
    assert set(choose_subjects(frames)) == {1}


def test_holds_subject_when_no_face_is_visible() -> None:
    frames = [frame(0.0, (1, 500, 1.0)), frame(0.2), frame(0.4, (1, 510, 1.0))]
    assert choose_subjects(frames) == [1, 1, 1]


def test_clamp_keeps_the_crop_inside_the_frame() -> None:
    assert clamp_center(0, WIDTH, CROP) == CROP / 2
    assert clamp_center(WIDTH, WIDTH, CROP) == WIDTH - CROP / 2


def test_small_jitter_is_ignored_by_the_dead_zone() -> None:
    times = [t / 5 for t in range(10)]
    targets = [960.0 + (10 if t % 2 else -10) for t in range(10)]
    path = smooth_path(times, targets, [1] * 10, WIDTH, CROP)
    assert {round(key.center_x) for key in path} == {950}


def test_subject_change_is_a_hard_cut() -> None:
    times = [0.0, 0.2, 0.4]
    path = smooth_path(times, [500.0, 500.0, 1400.0], [1, 1, 2], WIDTH, CROP)
    cut = [key for key in path if key.time_sec == 0.4]
    assert [round(key.center_x) for key in cut] == [500, 1400]


def test_follow_is_speed_limited() -> None:
    times = [0.0, 0.2]
    path = smooth_path(times, [400.0, 1500.0], [1, 1], WIDTH, CROP)
    moved = path[-1].center_x - path[0].center_x
    assert 0 < moved <= 0.5 * WIDTH * 0.2 + 1e-6


def test_interpolate_jumps_at_cuts_and_holds_edges() -> None:
    keys = [Keyframe(0, 100), Keyframe(1, 200), Keyframe(1, 900), Keyframe(2, 1000)]
    assert interpolate(keys, -1) == 100
    assert interpolate(keys, 0.5) == 150
    assert interpolate(keys, 1.0) == 900
    assert interpolate(keys, 1.5) == 950
    assert interpolate(keys, 5) == 1000
