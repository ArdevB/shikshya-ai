import json
from pathlib import Path

from fastapi.testclient import TestClient

from ml.features import FEATURE_NAMES
from ml.train import main as train

STRONG = {
    "attendance_pct": 97,
    "attendance_trend": 2,
    "internal_exam_pct": 88,
    "submission_rate_pct": 100,
    "avg_assignment_pct": 90,
    "late_rate_pct": 0,
    "previous_gpa": 3.8,
}
STRUGGLING = {
    "attendance_pct": 48,
    "attendance_trend": -25,
    "internal_exam_pct": 28,
    "submission_rate_pct": 40,
    "avg_assignment_pct": 35,
    "late_rate_pct": 60,
    "previous_gpa": 1.9,
}


def test_strong_student_is_low_risk(client: TestClient) -> None:
    result = client.post("/predict/risk", json=STRONG).json()
    assert result["level"] == "LOW"
    assert result["probability"] < 0.2


def test_struggling_student_is_high_risk_with_reasons(client: TestClient) -> None:
    result = client.post("/predict/risk", json=STRUGGLING).json()
    assert result["level"] == "HIGH"
    assert result["probability"] > 0.8
    assert len(result["topFactors"]) == 3
    assert all(factor["impact"] > 0 for factor in result["topFactors"])
    assert {factor["feature"] for factor in result["topFactors"]} <= set(FEATURE_NAMES)


def test_reasons_are_sorted_most_important_first(client: TestClient) -> None:
    factors = client.post("/predict/risk", json=STRUGGLING).json()["topFactors"]
    impacts = [factor["impact"] for factor in factors]
    assert impacts == sorted(impacts, reverse=True)


def test_good_numbers_are_never_given_as_reasons(client: TestClient) -> None:
    assert client.post("/predict/risk", json=STRONG).json()["topFactors"] == []


def test_missing_values_are_handled_and_never_become_reasons(client: TestClient) -> None:
    response = client.post(
        "/predict/risk",
        json={"attendance_pct": 50, "submission_rate_pct": 40, "previous_gpa": None},
    )
    assert response.status_code == 200
    features = {factor["feature"] for factor in response.json()["topFactors"]}
    assert "previous_gpa" not in features
    assert "internal_exam_pct" not in features


def test_nothing_known_at_all_still_gives_an_answer(client: TestClient) -> None:
    result = client.post("/predict/risk", json={}).json()
    assert result["level"] in ("LOW", "MEDIUM", "HIGH")
    assert result["topFactors"] == []


def test_batch_keeps_the_order(client: TestClient) -> None:
    response = client.post("/predict/risk/batch", json={"items": [STRONG, STRUGGLING, STRONG]})
    levels = [result["level"] for result in response.json()["results"]]
    assert levels == ["LOW", "HIGH", "LOW"]


def test_impossible_values_are_rejected(client: TestClient) -> None:
    assert client.post("/predict/risk", json={"attendance_pct": 140}).status_code == 422
    assert client.post("/predict/risk", json={"previous_gpa": 5}).status_code == 422


def test_training_meets_the_recall_target_and_writes_its_reports() -> None:
    metrics = train()
    assert metrics["test"]["recall"] >= 0.75
    folder = Path(__file__).parent.parent / "ml"
    assert json.loads((folder / "metrics.json").read_text())["model"] == metrics["model"]
    card = (folder / "model_card.md").read_text(encoding="utf-8")
    assert "synthetic data" in card
    assert "Limitations" in card
