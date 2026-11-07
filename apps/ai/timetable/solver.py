"""
Builds a weekly timetable with Google OR-Tools' CP-SAT constraint solver.
docs/algorithms/timetable.md explains the method for the project report.

There is one yes/no variable for each possible "this offering's lesson in this slot in this room",
leaving out rooms that could never work. Hard constraints must hold. Soft ones are added up into a
penalty for the solver to make as small as it can in the time allowed.
"""

from collections import defaultdict
from math import ceil
from typing import Literal

from ortools.sat.python import cp_model
from pydantic import BaseModel, Field

# How much each soft problem counts. A gap matters less than a teacher on their feet too long.
WEIGHT_SAME_DAY = 4
WEIGHT_LONG_RUN = 6
WEIGHT_GAP = 3
WEIGHT_SPLIT_LAB = 5
WEIGHT_UNEVEN_DAY = 2

MAX_CONSECUTIVE = 3
DEFAULT_TIME_LIMIT_SECONDS = 30.0


class Section(BaseModel):
    id: str
    name: str
    size: int = Field(ge=0)


class Offering(BaseModel):
    id: str
    sectionId: str  # noqa: N815 - the JSON the API sends is camelCase
    teacherId: str  # noqa: N815
    courseCode: str  # noqa: N815
    theoryPeriods: int = Field(default=0, ge=0)  # noqa: N815
    labPeriods: int = Field(default=0, ge=0)  # noqa: N815


class Teacher(BaseModel):
    id: str
    name: str


class Room(BaseModel):
    id: str
    name: str
    type: Literal["CLASSROOM", "LAB", "HALL"]
    capacity: int = Field(ge=0)


class TimeSlot(BaseModel):
    id: str
    dayOfWeek: int = Field(ge=0, le=6)  # noqa: N815
    startTime: str  # noqa: N815
    endTime: str  # noqa: N815


class Unavailability(BaseModel):
    teacherId: str  # noqa: N815
    timeSlotId: str  # noqa: N815


class RoomBooking(BaseModel):
    """A room already taken at this time, by another semester running at the same time."""

    roomId: str  # noqa: N815
    timeSlotId: str  # noqa: N815


class TimetableRequest(BaseModel):
    sections: list[Section]
    offerings: list[Offering]
    teachers: list[Teacher]
    rooms: list[Room]
    timeSlots: list[TimeSlot]  # noqa: N815
    unavailable: list[Unavailability] = []
    bookedRooms: list[RoomBooking] = []  # noqa: N815
    timeLimitSeconds: float = Field(default=DEFAULT_TIME_LIMIT_SECONDS, gt=0, le=30)  # noqa: N815


class Placement(BaseModel):
    offeringId: str  # noqa: N815
    timeSlotId: str  # noqa: N815
    roomId: str  # noqa: N815
    kind: Literal["THEORY", "LAB"]


class Problem(BaseModel):
    code: str
    message: str


class Score(BaseModel):
    penalty: int
    sameDayRepeats: int  # noqa: N815
    longRuns: int  # noqa: N815
    gaps: int
    splitLabs: int  # noqa: N815
    unevenDays: int  # noqa: N815


class TimetableResult(BaseModel):
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE"]
    placements: list[Placement]
    score: Score | None = None
    unsatisfiable: list[Problem] = []
    solveSeconds: float = 0  # noqa: N815


def _rooms_for(kind: str, section: Section, rooms: list[Room]) -> list[Room]:
    wanted = (lambda r: r.type == "LAB") if kind == "LAB" else (lambda r: r.type != "LAB")
    return [room for room in rooms if wanted(room) and room.capacity >= section.size]


def explain_impossible(request: TimetableRequest) -> list[Problem]:
    """Plain-language reasons that no timetable can exist, found by counting before solving."""
    sections = {section.id: section for section in request.sections}
    teachers = {teacher.id: teacher for teacher in request.teachers}
    slot_count = len(request.timeSlots)
    slot_ids = {slot.id for slot in request.timeSlots}
    problems: list[Problem] = []

    if not request.timeSlots:
        problems.append(Problem(code="NO_TIME_SLOTS", message="No time slots have been set up."))

    for offering in request.offerings:
        section = sections.get(offering.sectionId)
        if section is None:
            problems.append(
                Problem(code="UNKNOWN_SECTION", message=f"{offering.courseCode} has no section.")
            )
            continue
        for kind, periods in (("THEORY", offering.theoryPeriods), ("LAB", offering.labPeriods)):
            if periods and not _rooms_for(kind, section, request.rooms):
                place = "lab" if kind == "LAB" else "classroom"
                problems.append(
                    Problem(
                        code="NO_SUITABLE_ROOM",
                        message=f"{offering.courseCode} needs a {place} for {section.size} "
                        f"students in section {section.name}, and none is big enough.",
                    )
                )

    need_by_section: dict[str, int] = defaultdict(int)
    need_by_teacher: dict[str, int] = defaultdict(int)
    for offering in request.offerings:
        total = offering.theoryPeriods + offering.labPeriods
        need_by_section[offering.sectionId] += total
        need_by_teacher[offering.teacherId] += total

    for section_id, need in need_by_section.items():
        if section_id in sections and need > slot_count:
            problems.append(
                Problem(
                    code="SECTION_OVERLOADED",
                    message=f"Section {sections[section_id].name} needs {need} periods a week, "
                    f"but there are only {slot_count} time slots.",
                )
            )

    blocked: dict[str, set[str]] = defaultdict(set)
    for item in request.unavailable:
        if item.timeSlotId in slot_ids:
            blocked[item.teacherId].add(item.timeSlotId)
    for teacher_id, need in need_by_teacher.items():
        free = slot_count - len(blocked[teacher_id])
        if need > free:
            name = teachers[teacher_id].name if teacher_id in teachers else teacher_id
            problems.append(
                Problem(
                    code="TEACHER_OVERLOADED",
                    message=f"{name} needs to teach {need} periods a week, "
                    f"but is free for only {free} time slots.",
                )
            )

    for kind, label, is_kind in (
        ("THEORY", "classroom", lambda room: room.type != "LAB"),
        ("LAB", "lab", lambda room: room.type == "LAB"),
    ):
        need = sum(o.labPeriods if kind == "LAB" else o.theoryPeriods for o in request.offerings)
        capacity = slot_count * sum(1 for room in request.rooms if is_kind(room))
        if need > capacity:
            problems.append(
                Problem(
                    code="NOT_ENOUGH_ROOM_TIME",
                    message=f"The timetable needs {need} {label} periods a week, "
                    f"but the rooms offer only {capacity}.",
                )
            )
    return problems


def _ordered_days(slots: list[TimeSlot]) -> dict[int, list[TimeSlot]]:
    days: dict[int, list[TimeSlot]] = defaultdict(list)
    for slot in slots:
        days[slot.dayOfWeek].append(slot)
    for day in days.values():
        day.sort(key=lambda slot: slot.startTime)
    return days


def _adjacent(earlier: TimeSlot, later: TimeSlot) -> bool:
    """Back to back, with no break between them. A lab cannot run across lunch."""
    return earlier.endTime == later.startTime


def solve(request: TimetableRequest) -> TimetableResult:
    problems = explain_impossible(request)
    if problems:
        return TimetableResult(status="INFEASIBLE", placements=[], unsatisfiable=problems)

    sections = {section.id: section for section in request.sections}
    days = _ordered_days(request.timeSlots)
    blocked = {(item.teacherId, item.timeSlotId) for item in request.unavailable}
    booked = {(item.roomId, item.timeSlotId) for item in request.bookedRooms}

    model = cp_model.CpModel()
    # (offering id, kind, slot id, room id) -> yes/no variable
    placed: dict[tuple[str, str, str, str], cp_model.IntVar] = {}
    by_lesson: dict[tuple[str, str], list[cp_model.IntVar]] = defaultdict(list)
    by_slot_room: dict[tuple[str, str], list[cp_model.IntVar]] = defaultdict(list)
    by_slot_teacher: dict[tuple[str, str], list[cp_model.IntVar]] = defaultdict(list)
    by_slot_section: dict[tuple[str, str], list[cp_model.IntVar]] = defaultdict(list)
    by_offering_slot: dict[tuple[str, str, str], list[cp_model.IntVar]] = defaultdict(list)

    for offering in request.offerings:
        section = sections[offering.sectionId]
        for kind, periods in (("THEORY", offering.theoryPeriods), ("LAB", offering.labPeriods)):
            if not periods:
                continue
            for room in _rooms_for(kind, section, request.rooms):
                for slot in request.timeSlots:
                    # Hard: teacher unavailability. The variable simply does not exist.
                    if (offering.teacherId, slot.id) in blocked:
                        continue
                    # Hard: a room another semester is using stays theirs.
                    if (room.id, slot.id) in booked:
                        continue
                    var = model.new_bool_var(f"{offering.id}|{kind}|{slot.id}|{room.id}")
                    placed[(offering.id, kind, slot.id, room.id)] = var
                    by_lesson[(offering.id, kind)].append(var)
                    by_slot_room[(slot.id, room.id)].append(var)
                    by_slot_teacher[(slot.id, offering.teacherId)].append(var)
                    by_slot_section[(slot.id, offering.sectionId)].append(var)
                    by_offering_slot[(offering.id, kind, slot.id)].append(var)
            # Hard: each offering gets exactly its required periods.
            model.add(sum(by_lesson[(offering.id, kind)]) == periods)

    # Hard: no room, teacher or section is double-booked.
    for group in (by_slot_room, by_slot_teacher, by_slot_section):
        for variables in group.values():
            model.add_at_most_one(variables)

    def busy(variables: list[cp_model.IntVar], name: str) -> cp_model.IntVar:
        """A variable that is 1 exactly when any of these is, which the soft rules can test."""
        result = model.new_bool_var(name)
        if variables:
            model.add_max_equality(result, variables)
        else:
            model.add(result == 0)
        return result

    # Soft: spread a course's periods across different days. One a day is free.
    same_day: list[cp_model.IntVar] = []
    for offering in request.offerings:
        # Lab periods are meant to run together, so only theory counts as bunched up.
        if not offering.theoryPeriods:
            continue
        for day, slots in days.items():
            extra = model.new_int_var(0, len(slots), f"extra|{offering.id}|{day}")
            total = sum(
                var for slot in slots for var in by_offering_slot[(offering.id, "THEORY", slot.id)]
            )
            model.add(extra >= total - 1)
            same_day.append(extra)

    # Soft: no teacher teaches more than 3 periods in a row.
    long_runs: list[cp_model.IntVar] = []
    for teacher in request.teachers:
        for day, slots in days.items():
            teaching = [
                busy(by_slot_teacher[(slot.id, teacher.id)], f"teach|{teacher.id}|{slot.id}")
                for slot in slots
            ]
            for start in range(len(slots) - MAX_CONSECUTIVE):
                window = teaching[start : start + MAX_CONSECUTIVE + 1]
                run = model.new_bool_var(f"run|{teacher.id}|{day}|{start}")
                model.add(run >= sum(window) - MAX_CONSECUTIVE)
                long_runs.append(run)

    # Soft: no empty periods between a section's classes on the same day.
    gaps: list[cp_model.IntVar] = []
    section_busy: dict[tuple[str, int], list[cp_model.IntVar]] = {}
    for section in request.sections:
        for day, slots in days.items():
            occupied = [
                busy(by_slot_section[(slot.id, section.id)], f"class|{section.id}|{slot.id}")
                for slot in slots
            ]
            section_busy[(section.id, day)] = occupied
            for index in range(1, len(slots) - 1):
                before = busy(occupied[:index], f"before|{section.id}|{day}|{index}")
                after = busy(occupied[index + 1 :], f"after|{section.id}|{day}|{index}")
                gap = model.new_bool_var(f"gap|{section.id}|{day}|{index}")
                model.add(gap >= before + after - occupied[index] - 1)
                gaps.append(gap)

    # Soft: a section's classes spread across the week, not some days full and others empty. Each
    # period past a fair share of the week counts.
    uneven_days: list[cp_model.IntVar] = []
    for section in request.sections:
        total = sum(
            offering.theoryPeriods + offering.labPeriods
            for offering in request.offerings
            if offering.sectionId == section.id
        )
        fair_share = ceil(total / len(days)) if days else 0
        for day, slots in days.items():
            over = model.new_int_var(0, len(slots), f"over|{section.id}|{day}")
            model.add(over >= sum(section_busy[(section.id, day)]) - fair_share)
            uneven_days.append(over)

    # Soft: a section's lab periods come in back-to-back runs. Each isolated lab period costs.
    split_labs: list[cp_model.IntVar] = []
    for offering in request.offerings:
        if offering.labPeriods < 2:
            continue
        for _day, slots in days.items():
            labs = [
                busy(
                    by_offering_slot[(offering.id, "LAB", slot.id)],
                    f"lab|{offering.id}|{slot.id}",
                )
                for slot in slots
            ]
            for index, slot in enumerate(slots):
                neighbours = []
                if index > 0 and _adjacent(slots[index - 1], slot):
                    neighbours.append(labs[index - 1])
                if index + 1 < len(slots) and _adjacent(slot, slots[index + 1]):
                    neighbours.append(labs[index + 1])
                alone = model.new_bool_var(f"alone|{offering.id}|{slot.id}")
                model.add(alone >= labs[index] - sum(neighbours))
                split_labs.append(alone)

    model.minimize(
        WEIGHT_SAME_DAY * sum(same_day)
        + WEIGHT_LONG_RUN * sum(long_runs)
        + WEIGHT_GAP * sum(gaps)
        + WEIGHT_SPLIT_LAB * sum(split_labs)
        + WEIGHT_UNEVEN_DAY * sum(uneven_days)
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.timeLimitSeconds
    solver.parameters.num_workers = 8
    # The same input gives the same timetable, when the time limit does not cut it short.
    solver.parameters.random_seed = 7
    status = solver.solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return TimetableResult(
            status="INFEASIBLE",
            placements=[],
            solveSeconds=round(solver.wall_time, 2),
            unsatisfiable=[
                Problem(
                    code="NO_TIMETABLE_FOUND",
                    message="The counts add up, but no timetable fits them all, or none was found "
                    "in the time allowed. Try adding a room or time slot, or freeing a teacher.",
                )
            ],
        )

    placements = [
        Placement(offeringId=offering_id, kind=kind, timeSlotId=slot_id, roomId=room_id)
        for (offering_id, kind, slot_id, room_id), var in placed.items()
        if solver.value(var)
    ]

    def count(variables: list[cp_model.IntVar]) -> int:
        return sum(solver.value(var) for var in variables)

    return TimetableResult(
        status="OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
        placements=placements,
        solveSeconds=round(solver.wall_time, 2),
        score=Score(
            penalty=round(solver.objective_value),
            sameDayRepeats=count(same_day),
            longRuns=count(long_runs),
            gaps=count(gaps),
            splitLabs=count(split_labs),
            unevenDays=count(uneven_days),
        ),
    )


def check_hard_constraints(request: TimetableRequest, placements: list[Placement]) -> list[str]:
    """Recounts a result independently of the solver. Empty means every hard constraint holds."""
    errors: list[str] = []
    offerings = {offering.id: offering for offering in request.offerings}
    rooms = {room.id: room for room in request.rooms}
    sections = {section.id: section for section in request.sections}
    blocked = {(item.teacherId, item.timeSlotId) for item in request.unavailable}
    booked = {(item.roomId, item.timeSlotId) for item in request.bookedRooms}

    seen: dict[str, set[tuple[str, str]]] = {"room": set(), "teacher": set(), "section": set()}
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for item in placements:
        offering = offerings[item.offeringId]
        room = rooms[item.roomId]
        counts[(item.offeringId, item.kind)] += 1
        for label, key in (
            ("room", item.roomId),
            ("teacher", offering.teacherId),
            ("section", offering.sectionId),
        ):
            pair = (item.timeSlotId, key)
            if pair in seen[label]:
                errors.append(f"{label} {key} is double-booked in slot {item.timeSlotId}")
            seen[label].add(pair)
        if item.kind == "LAB" and room.type != "LAB":
            errors.append(f"{offering.courseCode} has a lab outside a lab room")
        if room.capacity < sections[offering.sectionId].size:
            errors.append(f"{room.name} is too small for {offering.courseCode}")
        if (offering.teacherId, item.timeSlotId) in blocked:
            errors.append(f"{offering.courseCode} is placed when its teacher is unavailable")
        if (item.roomId, item.timeSlotId) in booked:
            errors.append(f"{room.name} is already booked in slot {item.timeSlotId}")

    for offering in request.offerings:
        for kind, periods in (("THEORY", offering.theoryPeriods), ("LAB", offering.labPeriods)):
            if counts[(offering.id, kind)] != periods:
                errors.append(
                    f"{offering.courseCode} has {counts[(offering.id, kind)]} {kind} periods, "
                    f"needs {periods}"
                )
    return errors
