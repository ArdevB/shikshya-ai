"""
Creates a labelled dataset for the at-risk model, because no real history exists yet.

Run from apps/ai: python -m ml.generate_synthetic

Assumptions, which the model card repeats, because the model can only be as right as these are:

- Each student in a course has one hidden "engagement" score, and everything they do follows from
  it with noise of its own. So the features are correlated, as they are in real life.
- A student's ability, carried by their previous GPA, is related to engagement but separate from it.
- Attendance follows engagement, and sits around 80%, close to TU's usual 75% requirement.
- Failing depends mostly on exam marks and attendance, then on assignments and previous GPA, and a
  falling attendance trend adds risk. Noise is added, because some students surprise everyone.
- Some values are missing on purpose: 10% have no internal exam yet, and 15% have no previous GPA,
  such as those in their first semester. The API sends the same gaps.

Real results can replace this later without changing anything else: the columns are the contract.
"""

from pathlib import Path

import numpy as np
import pandas as pd

from ml.features import FEATURE_NAMES

ROWS = 8000
SEED = 42
OUTPUT = Path(__file__).parent / "data" / "synthetic_students.csv"


def generate(rows: int = ROWS, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    engagement = rng.normal(0, 1, rows)
    ability = 0.45 * engagement + 0.9 * rng.normal(0, 1, rows)

    attendance = np.clip(80 + 13 * engagement + rng.normal(0, 7, rows), 15, 100)
    # A positive change means attendance improved in the last two weeks.
    trend = np.clip(1.5 * engagement + rng.normal(0, 9, rows), -60, 40)
    exam = np.clip(58 + 9 * engagement + 12 * ability + rng.normal(0, 9, rows), 0, 100)
    submission_rate = np.clip(84 + 15 * engagement + rng.normal(0, 10, rows), 0, 100)
    assignment = np.clip(68 + 8 * engagement + 8 * ability + rng.normal(0, 9, rows), 0, 100)
    late_rate = np.clip(16 - 12 * engagement + rng.normal(0, 10, rows), 0, 100)
    gpa = np.clip(2.95 + 0.45 * ability + rng.normal(0, 0.18, rows), 0, 4)

    # The hidden rule behind the label. Standardised, so the weights can be compared.
    log_odds = (
        -2.45
        - 1.15 * (exam - 58) / 15
        - 0.95 * (attendance - 80) / 15
        - 0.55 * (submission_rate - 84) / 18
        - 0.35 * (assignment - 68) / 12
        - 0.35 * (gpa - 2.95) / 0.45
        - 0.25 * (trend - 0) / 9
        + 0.2 * (late_rate - 16) / 15
        + rng.normal(0, 0.45, rows)
    )
    at_risk = rng.random(rows) < 1 / (1 + np.exp(-log_odds))

    frame = pd.DataFrame(
        {
            "attendance_pct": attendance.round(1),
            "attendance_trend": trend.round(1),
            "internal_exam_pct": exam.round(1),
            "submission_rate_pct": submission_rate.round(1),
            "avg_assignment_pct": assignment.round(1),
            "late_rate_pct": late_rate.round(1),
            "previous_gpa": gpa.round(2),
            "at_risk": at_risk.astype(int),
        }
    )
    frame.loc[rng.random(rows) < 0.10, "internal_exam_pct"] = np.nan
    frame.loc[rng.random(rows) < 0.15, "previous_gpa"] = np.nan
    return frame[[*FEATURE_NAMES, "at_risk"]]


def main() -> None:
    frame = generate()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(OUTPUT, index=False)
    print(f"Wrote {len(frame)} rows to {OUTPUT}, {frame['at_risk'].mean():.1%} at risk")


if __name__ == "__main__":
    main()
