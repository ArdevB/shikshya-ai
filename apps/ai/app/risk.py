"""Turns a student's numbers into a risk level and the reasons behind it."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from pydantic import BaseModel, Field

from ml.features import FEATURES

MODEL_PATH = Path(__file__).parent.parent / "ml" / "risk_model.joblib"
TOP_FACTORS = 3


class RiskFeatures(BaseModel):
    """Null means not known yet, such as before the first exam. The model fills it in."""

    attendance_pct: float | None = Field(default=None, ge=0, le=100)
    attendance_trend: float | None = Field(default=None, ge=-100, le=100)
    internal_exam_pct: float | None = Field(default=None, ge=0, le=100)
    submission_rate_pct: float | None = Field(default=None, ge=0, le=100)
    avg_assignment_pct: float | None = Field(default=None, ge=0, le=100)
    late_rate_pct: float | None = Field(default=None, ge=0, le=100)
    previous_gpa: float | None = Field(default=None, ge=0, le=4)


class RiskFactor(BaseModel):
    feature: str
    label: str
    value: float
    impact: float


class RiskResult(BaseModel):
    probability: float
    level: Literal["LOW", "MEDIUM", "HIGH"]
    topFactors: list[RiskFactor]  # noqa: N815 - the JSON the API reads is camelCase


@lru_cache(maxsize=1)
def load_model() -> dict:
    return joblib.load(MODEL_PATH)


def level_for(probability: float, model: dict) -> Literal["LOW", "MEDIUM", "HIGH"]:
    if probability >= model["high_risk_threshold"]:
        return "HIGH"
    if probability >= model["alert_threshold"]:
        return "MEDIUM"
    return "LOW"


def top_factors(values: dict[str, float | None], model: dict) -> list[RiskFactor]:
    """
    A feature counts against a student when it is worse than typical. Its weight is the feature's
    importance times how many standard deviations worse. Unknown values cannot be a reason.
    """
    factors = []
    for feature in FEATURES:
        value = values[feature.name]
        if value is None:
            continue
        deviations = (value - model["median"][feature.name]) / model["std"][feature.name]
        impact = model["importance"][feature.name] * deviations * feature.risk_direction
        if impact > 0:
            factors.append(
                RiskFactor(
                    feature=feature.name,
                    label=feature.label,
                    value=round(value, 2),
                    impact=round(impact, 4),
                )
            )
    return sorted(factors, key=lambda factor: factor.impact, reverse=True)[:TOP_FACTORS]


def predict(features: list[RiskFeatures]) -> list[RiskResult]:
    if not features:
        return []
    model = load_model()
    rows = [item.model_dump() for item in features]
    # Float, so missing values become NaN, which the imputer in the pipeline fills in.
    frame = pd.DataFrame(rows, columns=model["feature_names"], dtype=float)
    probabilities = model["pipeline"].predict_proba(frame)[:, 1]
    return [
        RiskResult(
            probability=round(float(probability), 4),
            level=level_for(float(probability), model),
            topFactors=top_factors(row, model),
        )
        for row, probability in zip(rows, probabilities, strict=True)
    ]
