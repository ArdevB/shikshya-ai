"""The features the at-risk model uses. The API computes these, under exactly these names."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Feature:
    name: str
    label: str
    # +1: more of this means more risk. -1: more of this means less risk.
    risk_direction: int


FEATURES: tuple[Feature, ...] = (
    Feature("attendance_pct", "Attendance", -1),
    Feature("attendance_trend", "Attendance trend", -1),
    Feature("internal_exam_pct", "Internal exam marks", -1),
    Feature("submission_rate_pct", "Assignments submitted", -1),
    Feature("avg_assignment_pct", "Assignment marks", -1),
    Feature("late_rate_pct", "Late submissions", 1),
    Feature("previous_gpa", "Previous semester GPA", -1),
)

FEATURE_NAMES: tuple[str, ...] = tuple(feature.name for feature in FEATURES)
