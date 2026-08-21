from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, model_validator


Seconds = Annotated[float, Field(ge=0)]


class Platform(StrEnum):
    YOUTUBE = "youtube"
    GENERIC_HTML5 = "generic_html5"


class Availability(StrEnum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"


class ResourceState(StrEnum):
    PREPARING = "preparing"
    READY = "ready"
    LIMITED = "limited"
    PERMISSION_REQUIRED = "permission_required"
    POLICY_BLOCKED = "policy_blocked"
    UNSUPPORTED = "unsupported"
    FAILED = "failed"


class SourceContext(BaseModel):
    platform: Platform
    source_id: str = Field(min_length=1, max_length=512)
    page_url: HttpUrl


class CourseContext(BaseModel):
    course_id: str | None = Field(default=None, max_length=512)
    course_title: str | None = Field(default=None, max_length=512)
    module_id: str | None = Field(default=None, max_length=512)
    module_title: str | None = Field(default=None, max_length=512)


class VideoCapabilities(BaseModel):
    seek: Availability
    transcript: Literal["browser", "authorized_api", "unavailable"]
    visual_evidence: Literal[
        "cors_frame", "user_tab_capture", "authorized_media", "unavailable"
    ]
    ingestion: Literal["browser_evidence", "authorized_media", "unavailable"]


class VideoContext(BaseModel):
    source: SourceContext
    title: str = Field(min_length=1, max_length=1000)
    current_time_seconds: Seconds
    duration_seconds: Seconds | None = None
    course_context: CourseContext | None = None
    capabilities: VideoCapabilities


class CreateLearningResourceRequest(BaseModel):
    context: VideoContext


class CoverageInterval(BaseModel):
    start_seconds: Seconds
    end_seconds: Seconds

    @model_validator(mode="after")
    def validate_order(self) -> CoverageInterval:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be greater than start_seconds")
        return self


class LearningResourceResponse(BaseModel):
    id: UUID
    state: ResourceState
    context: VideoContext
    coverage: list[CoverageInterval] = Field(default_factory=list)
    actionable_reason: str | None = None
    created_at: datetime
    expires_at: datetime


class StartCaptureSessionRequest(BaseModel):
    consented_at: datetime


class CaptureSessionResponse(BaseModel):
    id: UUID
    resource_id: UUID
    status: Literal["active", "stopped", "failed"]


class CreateCaptureChunkRequest(BaseModel):
    source_start_seconds: Seconds
    source_end_seconds: Seconds
    discontinuity_id: UUID
    content_type: Literal["audio/webm", "audio/mp4", "audio/ogg"]
    byte_length: int = Field(gt=0, le=50_000_000)

    @model_validator(mode="after")
    def validate_order(self) -> CreateCaptureChunkRequest:
        if self.source_end_seconds <= self.source_start_seconds:
            raise ValueError("source_end_seconds must be greater than source_start_seconds")
        return self


class CaptureChunkUploadResponse(BaseModel):
    id: UUID
    upload_url: str
    upload_headers: dict[str, str]
    expires_in_seconds: int


class CompleteCaptureChunkRequest(BaseModel):
    etag: str | None = Field(default=None, max_length=512)


class CompleteCaptureChunkResponse(BaseModel):
    id: UUID
    status: Literal["queued", "already_queued"]


class CreateFrameEvidenceRequest(BaseModel):
    timestamp_seconds: Seconds
    image_base64: str = Field(min_length=1, max_length=8_000_000)
    mime_type: Literal["image/jpeg", "image/png", "image/webp"]


class BrowserTranscriptCue(BaseModel):
    start_seconds: Seconds
    end_seconds: Seconds
    text: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def validate_order(self) -> BrowserTranscriptCue:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be greater than start_seconds")
        return self


class CreateBrowserTranscriptRequest(BaseModel):
    cues: list[BrowserTranscriptCue] = Field(min_length=1, max_length=5000)


class CreateTutorSessionRequest(BaseModel):
    resource_id: UUID


class TutorSessionResponse(BaseModel):
    id: UUID
    resource_id: UUID
    created_at: datetime


class TutorTurnRequest(BaseModel):
    intent: Literal["question", "explain", "socratic", "knowledge_check"]
    learner_input: str = Field(min_length=1, max_length=8000)
    current_time_seconds: Seconds | None = None


class EvidenceCitation(BaseModel):
    evidence_id: UUID
    start_seconds: Seconds
    end_seconds: Seconds | None = None
    label: str


class VisualRequest(BaseModel):
    timestamps_seconds: list[Seconds] = Field(min_length=1, max_length=3)
    reason: str


class TutorTurnResponse(BaseModel):
    id: UUID
    content: str
    citations: list[EvidenceCitation]
    tutoring_action: Literal[
        "answer", "clarify", "socratic_prompt", "knowledge_check", "insufficient_evidence"
    ]
    uncertainty_reason: str | None = None
    visual_request: VisualRequest | None = None
