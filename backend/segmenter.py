from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class TranscriptWord:
    text: str
    start_seconds: float
    end_seconds: float
    confidence: float


@dataclass(frozen=True)
class TranscriptSegment:
    start_seconds: float
    end_seconds: float
    text: str
    confidence: float


def merge_caption_cues(
    cues: list[tuple[float, float, str]],
    *,
    target_words: int = 100,
) -> list[TranscriptSegment]:
    segments: list[TranscriptSegment] = []
    current: list[tuple[float, float, str]] = []
    word_count = 0
    for cue in sorted(cues, key=lambda value: value[0]):
        cue_words = len(cue[2].split())
        if current and word_count + cue_words > target_words:
            segments.append(
                TranscriptSegment(
                    start_seconds=current[0][0],
                    end_seconds=current[-1][1],
                    text=" ".join(value[2].strip() for value in current),
                    confidence=1.0,
                )
            )
            current = []
            word_count = 0
        current.append(cue)
        word_count += cue_words
    if current:
        segments.append(
            TranscriptSegment(
                start_seconds=current[0][0],
                end_seconds=current[-1][1],
                text=" ".join(value[2].strip() for value in current),
                confidence=1.0,
            )
        )
    return segments


def map_words_to_source_time(
    words: list[TranscriptWord],
    source_start_seconds: float,
) -> list[TranscriptWord]:
    return [
        TranscriptWord(
            text=word.text,
            start_seconds=source_start_seconds + word.start_seconds,
            end_seconds=source_start_seconds + word.end_seconds,
            confidence=word.confidence,
        )
        for word in words
    ]


def segment_words(
    words: list[TranscriptWord],
    *,
    target_words: int = 90,
    overlap_words: int = 10,
) -> list[TranscriptSegment]:
    if not words:
        return []
    if target_words <= overlap_words or overlap_words < 0:
        raise ValueError("target_words must be greater than overlap_words")

    segments: list[TranscriptSegment] = []
    start_index = 0
    while start_index < len(words):
        end_index = min(start_index + target_words, len(words))
        if end_index < len(words):
            for candidate in range(end_index - 1, start_index + target_words // 2, -1):
                if words[candidate].text.endswith((".", "?", "!")):
                    end_index = candidate + 1
                    break

        selected = words[start_index:end_index]
        confidence = sum(word.confidence for word in selected) / len(selected)
        segments.append(
            TranscriptSegment(
                start_seconds=selected[0].start_seconds,
                end_seconds=selected[-1].end_seconds,
                text=" ".join(word.text for word in selected),
                confidence=confidence,
            )
        )
        if end_index == len(words):
            break
        start_index = end_index - overlap_words

    return segments


def validate_citation_ids(returned_ids: list[UUID], available_ids: set[UUID]) -> list[UUID]:
    return list(dict.fromkeys(evidence_id for evidence_id in returned_ids if evidence_id in available_ids))
