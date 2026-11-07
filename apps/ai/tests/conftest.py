import pytest
from fastapi.testclient import TestClient

from app.main import app

KEY = "test-internal-key"


@pytest.fixture(autouse=True)
def settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_KEY", KEY)
    # Tests must never be able to reach Gemini by accident.
    monkeypatch.setenv("GEMINI_API_KEY", "")


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, headers={"X-Internal-Key": KEY})
