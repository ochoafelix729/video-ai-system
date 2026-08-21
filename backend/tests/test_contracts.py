from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from backend.contracts import CoverageInterval, CreateCaptureChunkRequest


def test_coverage_interval_requires_forward_time() -> None:
    with pytest.raises(ValidationError):
        CoverageInterval(start_seconds=10, end_seconds=10)


def test_capture_chunk_requires_forward_time() -> None:
    with pytest.raises(ValidationError):
        CreateCaptureChunkRequest(
            source_start_seconds=12,
            source_end_seconds=11,
            discontinuity_id="a87dfb47-e535-4a2b-8897-b6be8bbdc34b",
            content_type="audio/webm",
            byte_length=100,
        )
