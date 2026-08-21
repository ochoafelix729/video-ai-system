from uuid import uuid4

from backend.segmenter import (
    TranscriptWord,
    map_words_to_source_time,
    merge_caption_cues,
    segment_words,
    validate_citation_ids,
)


def make_words(count: int) -> list[TranscriptWord]:
    return [
        TranscriptWord(
            text=f"word-{index}{'.' if index % 12 == 11 else ''}",
            start_seconds=float(index),
            end_seconds=float(index) + 0.5,
            confidence=0.9,
        )
        for index in range(count)
    ]


def test_maps_chunk_relative_words_to_video_time() -> None:
    mapped = map_words_to_source_time(make_words(2), 300.5)
    assert mapped[0].start_seconds == 300.5
    assert mapped[1].end_seconds == 302.0


def test_segments_with_overlap_and_sentence_boundaries() -> None:
    segments = segment_words(make_words(35), target_words=20, overlap_words=4)
    assert len(segments) >= 2
    assert segments[0].text.endswith(".")
    assert segments[1].start_seconds < segments[0].end_seconds


def test_filters_duplicate_and_unknown_citations() -> None:
    known = uuid4()
    unknown = uuid4()
    assert validate_citation_ids([known, unknown, known], {known}) == [known]


def test_merges_caption_cues_without_losing_timestamps() -> None:
    segments = merge_caption_cues(
        [(0, 2, "one two"), (2, 4, "three four"), (4, 6, "five six")],
        target_words=4,
    )
    assert len(segments) == 2
    assert segments[0].start_seconds == 0
    assert segments[0].end_seconds == 4
    assert segments[1].text == "five six"
