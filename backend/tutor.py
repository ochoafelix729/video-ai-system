from __future__ import annotations

from typing import Any
from uuid import UUID

from backend.contracts import (
    EvidenceCitation,
    TutorTurnRequest,
    TutorTurnResponse,
    VisualRequest,
)
from backend.database import Repository
from backend.providers import GeminiProvider
from backend.segmenter import validate_citation_ids


class TutorService:
    def __init__(self, repository: Repository, gemini: GeminiProvider) -> None:
        self._repository = repository
        self._gemini = gemini

    def create_turn(
        self,
        user_id: str,
        session_id: UUID,
        request: TutorTurnRequest,
    ) -> TutorTurnResponse | None:
        session = self._repository.get_tutor_session(user_id, session_id)
        if session is None:
            return None

        query_embedding = self._gemini.embed_query(request.learner_input)
        evidence = self._repository.search_evidence(
            user_id,
            session["resource_id"],
            request.learner_input,
            query_embedding,
            request.current_time_seconds,
        )
        self._repository.save_turn(
            user_id,
            session_id,
            "user",
            request.learner_input,
            {"intent": request.intent, "current_time_seconds": request.current_time_seconds},
        )
        if not evidence:
            content = (
                "I do not have enough captured evidence from this video to answer that yet. "
                "Play the relevant section with tutoring active, then try again."
            )
            turn_id = self._repository.save_turn(
                user_id,
                session_id,
                "assistant",
                content,
                {"tutoring_action": "insufficient_evidence"},
            )
            return TutorTurnResponse(
                id=turn_id,
                content=content,
                citations=[],
                tutoring_action="insufficient_evidence",
                uncertainty_reason="No relevant captured evidence was available.",
            )

        recent_turns = self._repository.get_recent_turns(user_id, session_id, limit=8)
        prompt = build_tutor_prompt(request, evidence, session["summary"], recent_turns)
        generated = self._gemini.generate_tutor_turn(prompt)
        evidence_by_id = {row["id"]: row for row in evidence}
        parsed_ids: list[UUID] = []
        for value in generated.citation_ids:
            try:
                parsed_ids.append(UUID(value))
            except ValueError:
                continue
        valid_ids = validate_citation_ids(parsed_ids, set(evidence_by_id))
        citations = [
            EvidenceCitation(
                evidence_id=evidence_id,
                start_seconds=evidence_by_id[evidence_id]["start_seconds"],
                end_seconds=evidence_by_id[evidence_id]["end_seconds"],
                label=format_timestamp(evidence_by_id[evidence_id]["start_seconds"]),
            )
            for evidence_id in valid_ids
        ]

        action = generated.tutoring_action
        allowed_actions = {
            "answer",
            "clarify",
            "socratic_prompt",
            "knowledge_check",
            "insufficient_evidence",
        }
        if action not in allowed_actions:
            action = "clarify"
        if not citations and action not in {"clarify", "insufficient_evidence"}:
            action = "insufficient_evidence"

        visual_request = None
        if generated.visual_request and generated.visual_request.timestamps_seconds:
            visual_request = VisualRequest(
                timestamps_seconds=generated.visual_request.timestamps_seconds[:3],
                reason=generated.visual_request.reason,
            )

        payload = {
            "citations": [citation.model_dump(mode="json") for citation in citations],
            "tutoring_action": action,
            "uncertainty_reason": generated.uncertainty_reason,
            "visual_request": visual_request.model_dump(mode="json") if visual_request else None,
        }
        turn_id = self._repository.save_turn(
            user_id, session_id, "assistant", generated.content, payload
        )
        return TutorTurnResponse(
            id=turn_id,
            content=generated.content,
            citations=citations,
            tutoring_action=action,
            uncertainty_reason=generated.uncertainty_reason,
            visual_request=visual_request,
        )


def build_tutor_prompt(
    request: TutorTurnRequest,
    evidence: list[dict[str, Any]],
    session_summary: str,
    recent_turns: list[dict[str, Any]],
) -> str:
    evidence_lines = [
        (
            f"[{row['id']}] {format_timestamp(row['start_seconds'])}-"
            f"{format_timestamp(row['end_seconds'] or row['start_seconds'])} "
            f"({row['kind']}, confidence={row.get('confidence')}): {row['content']}"
        )
        for row in evidence
    ]
    history_lines = [f"{turn['role']}: {turn['content']}" for turn in recent_turns[-8:]]
    return "\n".join(
        [
            "You are a concise, patient video tutor.",
            "Use only the supplied evidence for claims about the lecture.",
            "Every factual lecture claim must cite one or more exact evidence IDs.",
            "Never infer slide contents from transcript evidence.",
            "If visuals are required, request at most three evidence timestamps.",
            "If evidence is missing or conflicting, say so instead of guessing.",
            f"Intent: {request.intent}",
            f"Current playback time: {request.current_time_seconds}",
            f"Session summary: {session_summary or '(none)'}",
            "Recent conversation:",
            *(history_lines or ["(none)"]),
            "Evidence:",
            *evidence_lines,
            f"Learner: {request.learner_input}",
        ]
    )


def format_timestamp(seconds: float) -> str:
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, remaining_seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02}:{remaining_seconds:02}"
    return f"{minutes}:{remaining_seconds:02}"
