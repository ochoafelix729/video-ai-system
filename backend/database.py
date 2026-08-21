from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row

from backend.contracts import (
    CaptureSessionResponse,
    CoverageInterval,
    CreateCaptureChunkRequest,
    LearningResourceResponse,
    ResourceState,
    TutorSessionResponse,
    VideoContext,
)


class Repository:
    def __init__(self, database_url: str, evidence_retention_days: int = 30) -> None:
        self._database_url = database_url
        self._retention = timedelta(days=evidence_retention_days)

    def _connect(self) -> psycopg.Connection[dict[str, Any]]:
        connection = psycopg.connect(self._database_url, row_factory=dict_row)
        register_vector(connection)
        return connection

    def apply_migrations(self) -> None:
        migration = Path(__file__).with_name("migrations").joinpath("001_initial.sql").read_text()
        with self._connect() as connection:
            connection.execute(migration)

    def get_idempotent_response(
        self, user_id: str, operation: str, idempotency_key: str
    ) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT response FROM idempotency_keys
                WHERE user_id = %s AND operation = %s AND idempotency_key = %s
                """,
                (user_id, operation, idempotency_key),
            ).fetchone()
        if row is None:
            return None
        response = row["response"]
        return json.loads(response) if isinstance(response, str) else response

    def save_idempotent_response(
        self,
        user_id: str,
        operation: str,
        idempotency_key: str,
        response: dict[str, Any],
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO idempotency_keys (user_id, operation, idempotency_key, response)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, operation, idempotency_key) DO NOTHING
                """,
                (user_id, operation, idempotency_key, json.dumps(response)),
            )

    def create_resource(self, user_id: str, context: VideoContext) -> LearningResourceResponse:
        resource_id = uuid4()
        expires_at = datetime.now(UTC) + self._retention
        with self._connect() as connection:
            row = connection.execute(
                """
                INSERT INTO learning_resources
                    (id, user_id, platform, source_id, context, state, expires_at)
                VALUES (%s, %s, %s, %s, %s, 'preparing', %s)
                ON CONFLICT (user_id, platform, source_id) DO UPDATE
                    SET context = EXCLUDED.context,
                        expires_at = EXCLUDED.expires_at
                RETURNING *
                """,
                (
                    resource_id,
                    user_id,
                    context.source.platform.value,
                    context.source.source_id,
                    json.dumps(context.model_dump(mode="json")),
                    expires_at,
                ),
            ).fetchone()
        assert row is not None
        return self._resource_response(row, [])

    def get_resource(self, user_id: str, resource_id: UUID) -> LearningResourceResponse | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM learning_resources WHERE id = %s AND user_id = %s",
                (resource_id, user_id),
            ).fetchone()
            if row is None:
                return None
            coverage_rows = connection.execute(
                """
                SELECT source_start_seconds, source_end_seconds
                FROM capture_chunks
                WHERE resource_id = %s AND user_id = %s AND status = 'processed'
                ORDER BY source_start_seconds
                """,
                (resource_id, user_id),
            ).fetchall()
        coverage = [
            CoverageInterval(
                start_seconds=value["source_start_seconds"],
                end_seconds=value["source_end_seconds"],
            )
            for value in coverage_rows
        ]
        return self._resource_response(row, merge_coverage(coverage))

    def create_capture_session(
        self, user_id: str, resource_id: UUID, consented_at: datetime
    ) -> CaptureSessionResponse | None:
        session_id = uuid4()
        with self._connect() as connection:
            row = connection.execute(
                """
                INSERT INTO capture_sessions (id, resource_id, user_id, consented_at)
                SELECT %s, id, user_id, %s FROM learning_resources
                WHERE id = %s AND user_id = %s
                RETURNING id, resource_id, status
                """,
                (session_id, consented_at, resource_id, user_id),
            ).fetchone()
        return CaptureSessionResponse(**row) if row else None

    def create_capture_chunk(
        self,
        user_id: str,
        session_id: UUID,
        chunk_id: UUID,
        request: CreateCaptureChunkRequest,
        s3_key: str,
    ) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                INSERT INTO capture_chunks (
                    id, capture_session_id, resource_id, user_id,
                    source_start_seconds, source_end_seconds, discontinuity_id,
                    content_type, byte_length, s3_key
                )
                SELECT %s, cs.id, cs.resource_id, cs.user_id, %s, %s, %s, %s, %s, %s
                FROM capture_sessions cs
                WHERE cs.id = %s AND cs.user_id = %s AND cs.status = 'active'
                ON CONFLICT (capture_session_id, discontinuity_id, source_start_seconds, source_end_seconds)
                DO UPDATE SET byte_length = EXCLUDED.byte_length
                RETURNING id, s3_key
                """,
                (
                    chunk_id,
                    request.source_start_seconds,
                    request.source_end_seconds,
                    request.discontinuity_id,
                    request.content_type,
                    request.byte_length,
                    s3_key,
                    session_id,
                    user_id,
                ),
            ).fetchone()
        return row

    def mark_chunk_queued(self, user_id: str, chunk_id: UUID, etag: str | None) -> bool | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                UPDATE capture_chunks
                SET status = 'queued',
                    etag = COALESCE(%s, etag)
                WHERE id = %s AND user_id = %s AND status = 'awaiting_upload'
                RETURNING status
                """,
                (etag, chunk_id, user_id),
            ).fetchone()
            if row is not None:
                return True
            existing = connection.execute(
                "SELECT status FROM capture_chunks WHERE id = %s AND user_id = %s",
                (chunk_id, user_id),
            ).fetchone()
        if existing is None:
            return None
        return False

    def stop_capture_session(self, user_id: str, session_id: UUID) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                """
                UPDATE capture_sessions SET status = 'stopped'
                WHERE id = %s AND user_id = %s
                RETURNING id
                """,
                (session_id, user_id),
            ).fetchone()
        return row is not None

    def get_chunk_for_processing(self, chunk_id: UUID) -> dict[str, Any] | None:
        with self._connect() as connection:
            return connection.execute(
                """
                SELECT cc.*, lr.context FROM capture_chunks cc
                JOIN learning_resources lr ON lr.id = cc.resource_id
                WHERE cc.id = %s
                """,
                (chunk_id,),
            ).fetchone()

    def save_transcript_segments(
        self,
        chunk: dict[str, Any],
        segments: list[dict[str, Any]],
        provider_model: str,
        language: str | None,
    ) -> None:
        expires_at = datetime.now(UTC) + self._retention
        with self._connect() as connection:
            for segment in segments:
                connection.execute(
                    """
                    INSERT INTO evidence_segments (
                        id, resource_id, user_id, kind, start_seconds, end_seconds,
                        content, confidence, provenance, embedding, expires_at
                    ) VALUES (%s, %s, %s, 'transcript', %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        uuid4(),
                        chunk["resource_id"],
                        chunk["user_id"],
                        segment["start_seconds"],
                        segment["end_seconds"],
                        segment["text"],
                        segment["confidence"],
                        json.dumps(
                            {
                                "capture_chunk_id": str(chunk["id"]),
                                "method": "tab_audio",
                                "provider_model": provider_model,
                                "language": language,
                            }
                        ),
                        Vector(segment["embedding"]),
                        expires_at,
                    ),
                )
            connection.execute(
                "UPDATE capture_chunks SET status = 'processed', processed_at = now() WHERE id = %s",
                (chunk["id"],),
            )
            connection.execute(
                "UPDATE learning_resources SET state = 'ready' WHERE id = %s",
                (chunk["resource_id"],),
            )

    def save_visual_evidence(
        self,
        user_id: str,
        resource_id: UUID,
        timestamp_seconds: float,
        description: str,
        embedding: list[float],
        s3_key: str,
    ) -> UUID | None:
        evidence_id = uuid4()
        expires_at = datetime.now(UTC) + self._retention
        with self._connect() as connection:
            row = connection.execute(
                """
                INSERT INTO evidence_segments (
                    id, resource_id, user_id, kind, start_seconds, end_seconds,
                    content, provenance, embedding, expires_at
                )
                SELECT %s, id, user_id, 'visual', %s, %s, %s, %s, %s, %s
                FROM learning_resources WHERE id = %s AND user_id = %s
                RETURNING id
                """,
                (
                    evidence_id,
                    timestamp_seconds,
                    timestamp_seconds,
                    description,
                    json.dumps({"method": "user_tab_capture", "s3_key": s3_key}),
                    Vector(embedding),
                    expires_at,
                    resource_id,
                    user_id,
                ),
            ).fetchone()
        return row["id"] if row else None

    def save_browser_transcript(
        self,
        user_id: str,
        resource_id: UUID,
        segments: list[dict[str, Any]],
    ) -> int | None:
        expires_at = datetime.now(UTC) + self._retention
        with self._connect() as connection:
            owner = connection.execute(
                "SELECT id FROM learning_resources WHERE id = %s AND user_id = %s",
                (resource_id, user_id),
            ).fetchone()
            if owner is None:
                return None
            for segment in segments:
                connection.execute(
                    """
                    INSERT INTO evidence_segments (
                        id, resource_id, user_id, kind, start_seconds, end_seconds,
                        content, confidence, provenance, embedding, expires_at
                    ) VALUES (%s, %s, %s, 'transcript', %s, %s, %s, 1, %s, %s, %s)
                    """,
                    (
                        uuid4(),
                        resource_id,
                        user_id,
                        segment["start_seconds"],
                        segment["end_seconds"],
                        segment["text"],
                        json.dumps({"method": "browser_text_track"}),
                        Vector(segment["embedding"]),
                        expires_at,
                    ),
                )
            connection.execute(
                "UPDATE learning_resources SET state = 'ready' WHERE id = %s",
                (resource_id,),
            )
        return len(segments)

    def mark_chunk_failed(self, chunk_id: UUID, error: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE capture_chunks SET status = 'failed', error = %s WHERE id = %s",
                (error[:2000], chunk_id),
            )

    def create_tutor_session(self, user_id: str, resource_id: UUID) -> TutorSessionResponse | None:
        session_id = uuid4()
        with self._connect() as connection:
            row = connection.execute(
                """
                INSERT INTO tutor_sessions (id, resource_id, user_id)
                SELECT %s, id, user_id FROM learning_resources WHERE id = %s AND user_id = %s
                RETURNING id, resource_id, created_at
                """,
                (session_id, resource_id, user_id),
            ).fetchone()
        return TutorSessionResponse(**row) if row else None

    def get_tutor_session(self, user_id: str, session_id: UUID) -> dict[str, Any] | None:
        with self._connect() as connection:
            return connection.execute(
                "SELECT * FROM tutor_sessions WHERE id = %s AND user_id = %s",
                (session_id, user_id),
            ).fetchone()

    def get_recent_turns(self, user_id: str, session_id: UUID, limit: int = 8) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT role, content FROM tutor_turns
                WHERE session_id = %s AND user_id = %s
                ORDER BY created_at DESC LIMIT %s
                """,
                (session_id, user_id, limit),
            ).fetchall()
        return list(reversed(rows))

    def search_evidence(
        self,
        user_id: str,
        resource_id: UUID,
        query: str,
        query_embedding: list[float],
        current_time_seconds: float | None,
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        current = current_time_seconds if current_time_seconds is not None else -1_000_000
        with self._connect() as connection:
            return connection.execute(
                """
                SELECT id, kind, granularity, start_seconds, end_seconds, content, confidence,
                       (1 - (embedding <=> %s)) AS semantic_score,
                       ts_rank_cd(search_vector, websearch_to_tsquery('english', %s)) AS lexical_score,
                       CASE WHEN abs(start_seconds - %s) <= 300 THEN 0.10 ELSE 0 END AS time_boost
                FROM evidence_segments
                WHERE user_id = %s AND resource_id = %s AND expires_at > now()
                ORDER BY (
                    (1 - (embedding <=> %s)) * 0.65
                    + ts_rank_cd(search_vector, websearch_to_tsquery('english', %s)) * 0.25
                    + CASE WHEN abs(start_seconds - %s) <= 300 THEN 0.10 ELSE 0 END
                ) DESC
                LIMIT %s
                """,
                (
                    Vector(query_embedding),
                    query,
                    current,
                    user_id,
                    resource_id,
                    Vector(query_embedding),
                    query,
                    current,
                    limit,
                ),
            ).fetchall()

    def save_turn(
        self, user_id: str, session_id: UUID, role: str, content: str, payload: dict[str, Any]
    ) -> UUID:
        turn_id = uuid4()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO tutor_turns (id, session_id, user_id, role, content, payload)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (turn_id, session_id, user_id, role, content, json.dumps(payload)),
            )
            connection.execute(
                "UPDATE tutor_sessions SET updated_at = now() WHERE id = %s",
                (session_id,),
            )
        return turn_id

    def delete_evidence(self, user_id: str, resource_id: UUID) -> list[str] | None:
        with self._connect() as connection:
            owner = connection.execute(
                "SELECT id FROM learning_resources WHERE id = %s AND user_id = %s",
                (resource_id, user_id),
            ).fetchone()
            if owner is None:
                return None
            keys = connection.execute(
                "SELECT s3_key FROM capture_chunks WHERE resource_id = %s AND user_id = %s",
                (resource_id, user_id),
            ).fetchall()
            frame_keys = connection.execute(
                """
                SELECT provenance->>'s3_key' AS s3_key FROM evidence_segments
                WHERE resource_id = %s AND user_id = %s
                  AND provenance ? 's3_key'
                """,
                (resource_id, user_id),
            ).fetchall()
            connection.execute(
                "DELETE FROM capture_sessions WHERE resource_id = %s AND user_id = %s",
                (resource_id, user_id),
            )
            connection.execute(
                "DELETE FROM evidence_segments WHERE resource_id = %s AND user_id = %s",
                (resource_id, user_id),
            )
            connection.execute(
                "UPDATE learning_resources SET state = 'preparing' WHERE id = %s AND user_id = %s",
                (resource_id, user_id),
            )
        return [row["s3_key"] for row in [*keys, *frame_keys] if row["s3_key"]]

    @staticmethod
    def _resource_response(row: dict[str, Any], coverage: list[CoverageInterval]) -> LearningResourceResponse:
        context_value = row["context"]
        if isinstance(context_value, str):
            context_value = json.loads(context_value)
        return LearningResourceResponse(
            id=row["id"],
            state=ResourceState(row["state"]),
            context=VideoContext.model_validate(context_value),
            coverage=coverage,
            actionable_reason=row["actionable_reason"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
        )


def merge_coverage(intervals: list[CoverageInterval], gap_tolerance_seconds: float = 2.0) -> list[CoverageInterval]:
    if not intervals:
        return []
    ordered = sorted(intervals, key=lambda value: value.start_seconds)
    merged = [ordered[0]]
    for interval in ordered[1:]:
        previous = merged[-1]
        if interval.start_seconds <= previous.end_seconds + gap_tolerance_seconds:
            merged[-1] = CoverageInterval(
                start_seconds=previous.start_seconds,
                end_seconds=max(previous.end_seconds, interval.end_seconds),
            )
        else:
            merged.append(interval)
    return merged
