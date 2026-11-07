from fastapi.testclient import TestClient

from app.main import app


def test_health_needs_no_key() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_everything_else_needs_the_key() -> None:
    anonymous = TestClient(app)
    assert anonymous.post("/predict/risk", json={}).status_code == 401
    assert anonymous.post("/quiz/generate", json={}).status_code == 401
    assert anonymous.post("/timetable/generate", json={}).status_code == 401
    wrong = TestClient(app, headers={"X-Internal-Key": "wrong"})
    assert wrong.post("/predict/risk", json={}).status_code == 401


def test_an_unset_key_refuses_everyone(monkeypatch) -> None:
    monkeypatch.setenv("INTERNAL_KEY", "")
    assert (
        TestClient(app, headers={"X-Internal-Key": ""}).post("/predict/risk", json={}).status_code
        == 401
    )
