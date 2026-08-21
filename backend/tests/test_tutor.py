from uuid import uuid4

from backend.contracts import TutorTurnRequest
from backend.providers import GeneratedTutorTurn
from backend.tutor import TutorService, build_tutor_prompt, format_timestamp


class FakeRepository:
    def __init__(self, evidence):
        self.evidence = evidence
        self.saved = []

    def get_tutor_session(self, user_id, session_id):
        return {"resource_id": uuid4(), "summary": ""}

    def search_evidence(self, *args, **kwargs):
        return self.evidence

    def save_turn(self, user_id, session_id, role, content, payload):
        turn_id = uuid4()
        self.saved.append((role, content, payload))
        return turn_id

    def get_recent_turns(self, user_id, session_id, limit=8):
        return []


class FakeGemini:
    def __init__(self, generated=None):
        self.generated = generated

    def embed_query(self, text):
        return [0.0] * 768

    def generate_tutor_turn(self, prompt):
        return self.generated


def test_tutor_refuses_when_no_evidence() -> None:
    repository = FakeRepository([])
    service = TutorService(repository, FakeGemini())
    response = service.create_turn(
        "user",
        uuid4(),
        TutorTurnRequest(intent="question", learner_input="What is entropy?"),
    )
    assert response is not None
    assert response.tutoring_action == "insufficient_evidence"
    assert response.citations == []


def test_tutor_drops_unknown_citations() -> None:
    known_id = uuid4()
    evidence = [
        {
            "id": known_id,
            "kind": "transcript",
            "granularity": "raw",
            "start_seconds": 10.0,
            "end_seconds": 20.0,
            "content": "Entropy increases.",
            "confidence": 0.98,
        }
    ]
    generated = GeneratedTutorTurn(
        content="Entropy increases.",
        citation_ids=[str(known_id), str(uuid4())],
        tutoring_action="answer",
    )
    response = TutorService(FakeRepository(evidence), FakeGemini(generated)).create_turn(
        "user",
        uuid4(),
        TutorTurnRequest(intent="question", learner_input="What happens?"),
    )
    assert response is not None
    assert [citation.evidence_id for citation in response.citations] == [known_id]


def test_prompt_contains_grounding_rules_and_evidence() -> None:
    evidence_id = uuid4()
    prompt = build_tutor_prompt(
        TutorTurnRequest(intent="explain", learner_input="Explain this"),
        [
            {
                "id": evidence_id,
                "kind": "transcript",
                "start_seconds": 65,
                "end_seconds": 70,
                "confidence": 0.9,
                "content": "A grounded fact.",
            }
        ],
        "",
        [],
    )
    assert "Use only the supplied evidence" in prompt
    assert str(evidence_id) in prompt
    assert format_timestamp(65) == "1:05"
