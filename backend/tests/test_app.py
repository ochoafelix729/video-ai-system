from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app import Services, create_app
from backend.config import Settings
from backend.contracts import LearningResourceResponse, ResourceState
from backend.security import AuthenticatedUser, get_current_user


class FakeRepository:
    def __init__(self) -> None:
        self.cache = {}

    def get_idempotent_response(self, user_id, operation, idempotency_key):
        return self.cache.get((user_id, operation, idempotency_key))

    def save_idempotent_response(self, user_id, operation, idempotency_key, response):
        self.cache[(user_id, operation, idempotency_key)] = response

    def create_resource(self, user_id, context):
        now = datetime.now(UTC)
        return LearningResourceResponse(
            id=uuid4(),
            state=ResourceState.PREPARING,
            context=context,
            created_at=now,
            expires_at=now + timedelta(days=30),
        )


class UnusedService:
    pass


def make_client() -> TestClient:
    services = Services(
        settings=Settings(auth_disabled=True),
        repository=FakeRepository(),
        storage=UnusedService(),
        queue=UnusedService(),
        gemini=UnusedService(),
        tutor=UnusedService(),
    )
    app = create_app(services)
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser("learner-1")
    return TestClient(app)


def resource_payload() -> dict:
    return {
        "context": {
            "source": {
                "platform": "youtube",
                "source_id": "dQw4w9WgXcQ",
                "page_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            },
            "title": "Lecture",
            "current_time_seconds": 15,
            "duration_seconds": 300,
            "capabilities": {
                "seek": "available",
                "transcript": "unavailable",
                "visual_evidence": "user_tab_capture",
                "ingestion": "browser_evidence",
            },
        }
    }


def test_health_is_public() -> None:
    with make_client() as client:
        assert client.get("/health").json() == {"status": "ok"}


def test_resource_creation_requires_idempotency_key() -> None:
    with make_client() as client:
        response = client.post("/learning-resources", json=resource_payload())
    assert response.status_code == 422


def test_resource_creation_replays_cached_response() -> None:
    headers = {"Idempotency-Key": "stable-request-key"}
    with make_client() as client:
        first = client.post("/learning-resources", json=resource_payload(), headers=headers)
        second = client.post("/learning-resources", json=resource_payload(), headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
