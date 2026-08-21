import base64
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

from backend.aws_services import JobQueue, ObjectStorage
from backend.config import Settings, get_settings
from backend.contracts import (
    CaptureChunkUploadResponse,
    CaptureSessionResponse,
    CompleteCaptureChunkRequest,
    CompleteCaptureChunkResponse,
    CreateBrowserTranscriptRequest,
    CreateCaptureChunkRequest,
    CreateFrameEvidenceRequest,
    CreateLearningResourceRequest,
    CreateTutorSessionRequest,
    LearningResourceResponse,
    StartCaptureSessionRequest,
    TutorSessionResponse,
    TutorTurnRequest,
    TutorTurnResponse,
)
from backend.database import Repository
from backend.providers import GeminiProvider
from backend.security import AuthenticatedUser, get_current_user
from backend.tutor import TutorService
from backend.segmenter import merge_caption_cues


@dataclass
class Services:
    settings: Settings
    repository: Repository
    storage: ObjectStorage
    queue: JobQueue
    gemini: GeminiProvider
    tutor: TutorService


def build_services(settings: Settings) -> Services:
    repository = Repository(settings.database_url, settings.evidence_retention_days)
    gemini = GeminiProvider(settings.gemini_api_key)
    return Services(
        settings=settings,
        repository=repository,
        storage=ObjectStorage(settings.s3_bucket_name, settings.aws_default_region),
        queue=JobQueue(settings.sqs_queue_url, settings.aws_default_region),
        gemini=gemini,
        tutor=TutorService(repository, gemini),
    )


def create_app(services: Services | None = None) -> FastAPI:
    settings = services.settings if services else get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.services = services or build_services(settings)
        yield

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Dev-User-Id"],
        )

    def current_services() -> Services:
        return app.state.services

    def cached_response(
        service: Services,
        user_id: str,
        operation: str,
        idempotency_key: str,
    ) -> dict[str, object] | None:
        return service.repository.get_idempotent_response(
            user_id, operation, idempotency_key
        )

    def cache_response(
        service: Services,
        user_id: str,
        operation: str,
        idempotency_key: str,
        response: dict[str, object],
    ) -> None:
        service.repository.save_idempotent_response(
            user_id, operation, idempotency_key, response
        )

    User = Annotated[AuthenticatedUser, Depends(get_current_user)]
    ServiceDependency = Annotated[Services, Depends(current_services)]

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/learning-resources", response_model=LearningResourceResponse)
    def create_resource(
        request: CreateLearningResourceRequest,
        user: User,
        service: ServiceDependency,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    ) -> LearningResourceResponse:
        operation = "create_resource"
        cached = cached_response(service, user.user_id, operation, idempotency_key)
        if cached is not None:
            return LearningResourceResponse.model_validate(cached)
        result = service.repository.create_resource(user.user_id, request.context)
        cache_response(
            service,
            user.user_id,
            operation,
            idempotency_key,
            result.model_dump(mode="json"),
        )
        return result

    @app.get("/learning-resources/{resource_id}", response_model=LearningResourceResponse)
    def get_resource(resource_id: UUID, user: User, service: ServiceDependency) -> LearningResourceResponse:
        resource = service.repository.get_resource(user.user_id, resource_id)
        if resource is None:
            raise HTTPException(status_code=404, detail="Learning resource not found")
        return resource

    @app.post(
        "/learning-resources/{resource_id}/capture-sessions",
        response_model=CaptureSessionResponse,
    )
    def start_capture_session(
        resource_id: UUID,
        request: StartCaptureSessionRequest,
        user: User,
        service: ServiceDependency,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    ) -> CaptureSessionResponse:
        operation = f"start_capture:{resource_id}"
        cached = cached_response(service, user.user_id, operation, idempotency_key)
        if cached is not None:
            return CaptureSessionResponse.model_validate(cached)
        result = service.repository.create_capture_session(
            user.user_id, resource_id, request.consented_at
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Learning resource not found")
        cache_response(
            service, user.user_id, operation, idempotency_key, result.model_dump(mode="json")
        )
        return result

    @app.post(
        "/capture-sessions/{session_id}/chunks",
        response_model=CaptureChunkUploadResponse,
    )
    def create_chunk(
        session_id: UUID,
        request: CreateCaptureChunkRequest,
        user: User,
        service: ServiceDependency,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    ) -> CaptureChunkUploadResponse:
        operation = f"create_chunk:{session_id}"
        cached = cached_response(service, user.user_id, operation, idempotency_key)
        if cached is not None:
            return CaptureChunkUploadResponse.model_validate(cached)
        provisional_chunk_id = uuid4()
        provisional_key = f"raw-audio/{user.user_id}/{session_id}/{provisional_chunk_id}"
        chunk = service.repository.create_capture_chunk(
            user.user_id, session_id, provisional_chunk_id, request, provisional_key
        )
        if chunk is None:
            raise HTTPException(status_code=404, detail="Active capture session not found")
        chunk_id = chunk["id"]
        upload_url = service.storage.create_audio_upload(
            key=chunk["s3_key"],
            content_type=request.content_type,
        )
        # The key is deterministic enough for cleanup; the repository key is updated by the worker payload.
        result = CaptureChunkUploadResponse(
            id=chunk_id,
            upload_url=upload_url,
            upload_headers={
                "Content-Type": request.content_type,
                "x-amz-server-side-encryption": "aws:kms",
            },
            expires_in_seconds=900,
        )
        cache_response(
            service, user.user_id, operation, idempotency_key, result.model_dump(mode="json")
        )
        return result

    @app.post(
        "/capture-chunks/{chunk_id}/complete",
        response_model=CompleteCaptureChunkResponse,
    )
    def complete_chunk(
        chunk_id: UUID,
        request: CompleteCaptureChunkRequest,
        user: User,
        service: ServiceDependency,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    ) -> CompleteCaptureChunkResponse:
        operation = f"complete_chunk:{chunk_id}"
        cached = cached_response(service, user.user_id, operation, idempotency_key)
        if cached is not None:
            return CompleteCaptureChunkResponse.model_validate(cached)
        queued = service.repository.mark_chunk_queued(user.user_id, chunk_id, request.etag)
        if queued is None:
            raise HTTPException(status_code=404, detail="Capture chunk not found")
        if queued:
            service.queue.enqueue_transcription(chunk_id)
        result = CompleteCaptureChunkResponse(
            id=chunk_id, status="queued" if queued else "already_queued"
        )
        cache_response(
            service, user.user_id, operation, idempotency_key, result.model_dump(mode="json")
        )
        return result

    @app.post("/capture-sessions/{session_id}/stop", status_code=204)
    def stop_capture_session(
        session_id: UUID,
        user: User,
        service: ServiceDependency,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    ) -> Response:
        operation = f"stop_capture:{session_id}"
        cached = cached_response(service, user.user_id, operation, idempotency_key)
        if cached is not None:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        if not service.repository.stop_capture_session(user.user_id, session_id):
            raise HTTPException(status_code=404, detail="Capture session not found")
        cache_response(service, user.user_id, operation, idempotency_key, {"stopped": True})
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/learning-resources/{resource_id}/frames", status_code=201)
    def create_frame(
        resource_id: UUID,
        request: CreateFrameEvidenceRequest,
        user: User,
        service: ServiceDependency,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    ) -> dict[str, str]:
        operation = f"create_frame:{resource_id}"
        cached = cached_response(service, user.user_id, operation, idempotency_key)
        if cached is not None:
            return {"evidence_id": str(cached["evidence_id"])}
        try:
            image_bytes = base64.b64decode(request.image_base64, validate=True)
        except ValueError as error:
            raise HTTPException(status_code=422, detail="Invalid base64 frame") from error
        evidence_id = uuid4()
        key = service.storage.put_frame(
            user_id=user.user_id,
            resource_id=resource_id,
            evidence_id=evidence_id,
            image_bytes=image_bytes,
            mime_type=request.mime_type,
        )
        description = service.gemini.describe_frame(
            image_bytes,
            request.mime_type,
            f"Video timestamp {request.timestamp_seconds:.2f} seconds",
        )
        embedding = service.gemini.embed_document(description, "Video frame")
        saved_id = service.repository.save_visual_evidence(
            user.user_id,
            resource_id,
            request.timestamp_seconds,
            description,
            embedding,
            key,
        )
        if saved_id is None:
            service.storage.delete(key)
            raise HTTPException(status_code=404, detail="Learning resource not found")
        result = {"evidence_id": str(saved_id)}
        cache_response(service, user.user_id, operation, idempotency_key, result)
        return result

    @app.post("/learning-resources/{resource_id}/transcript-evidence", status_code=201)
    def create_browser_transcript(
        resource_id: UUID,
        request: CreateBrowserTranscriptRequest,
        user: User,
        service: ServiceDependency,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    ) -> dict[str, int]:
        operation = f"browser_transcript:{resource_id}"
        cached = cached_response(service, user.user_id, operation, idempotency_key)
        if cached is not None:
            return {"segments_created": int(cached["segments_created"])}
        merged = merge_caption_cues(
            [(cue.start_seconds, cue.end_seconds, cue.text) for cue in request.cues]
        )
        resource = service.repository.get_resource(user.user_id, resource_id)
        if resource is None:
            raise HTTPException(status_code=404, detail="Learning resource not found")
        embeddings = service.gemini.embed_documents(
            [segment.text for segment in merged], resource.context.title
        )
        count = service.repository.save_browser_transcript(
            user.user_id,
            resource_id,
            [
                {
                    "start_seconds": segment.start_seconds,
                    "end_seconds": segment.end_seconds,
                    "text": segment.text,
                    "embedding": embedding,
                }
                for segment, embedding in zip(merged, embeddings, strict=True)
            ],
        )
        if count is None:
            raise HTTPException(status_code=404, detail="Learning resource not found")
        result = {"segments_created": count}
        cache_response(service, user.user_id, operation, idempotency_key, result)
        return result

    @app.post("/tutor-sessions", response_model=TutorSessionResponse)
    def create_tutor_session(
        request: CreateTutorSessionRequest,
        user: User,
        service: ServiceDependency,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    ) -> TutorSessionResponse:
        operation = f"create_tutor_session:{request.resource_id}"
        cached = cached_response(service, user.user_id, operation, idempotency_key)
        if cached is not None:
            return TutorSessionResponse.model_validate(cached)
        session = service.repository.create_tutor_session(user.user_id, request.resource_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Learning resource not found")
        cache_response(
            service, user.user_id, operation, idempotency_key, session.model_dump(mode="json")
        )
        return session

    @app.post("/tutor-sessions/{session_id}/turns", response_model=TutorTurnResponse)
    def create_tutor_turn(
        session_id: UUID,
        request: TutorTurnRequest,
        user: User,
        service: ServiceDependency,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    ) -> TutorTurnResponse:
        operation = f"create_tutor_turn:{session_id}"
        cached = cached_response(service, user.user_id, operation, idempotency_key)
        if cached is not None:
            return TutorTurnResponse.model_validate(cached)
        turn = service.tutor.create_turn(user.user_id, session_id, request)
        if turn is None:
            raise HTTPException(status_code=404, detail="Tutor session not found")
        cache_response(
            service, user.user_id, operation, idempotency_key, turn.model_dump(mode="json")
        )
        return turn

    @app.delete("/learning-resources/{resource_id}/evidence", status_code=204)
    def delete_evidence(
        resource_id: UUID, user: User, service: ServiceDependency
    ) -> Response:
        keys = service.repository.delete_evidence(user.user_id, resource_id)
        if keys is None:
            raise HTTPException(status_code=404, detail="Learning resource not found")
        service.storage.delete_many(keys)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


app = create_app()
