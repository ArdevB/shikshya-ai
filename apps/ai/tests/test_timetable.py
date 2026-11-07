from collections import defaultdict

from fastapi.testclient import TestClient

from timetable.solver import (
    Offering,
    Placement,
    Room,
    RoomBooking,
    Section,
    Teacher,
    TimeSlot,
    TimetableRequest,
    Unavailability,
    check_hard_constraints,
    solve,
)

DAYS = range(6)
TIMES = [("07:00", "07:50"), ("07:50", "08:40"), ("08:40", "09:30"), ("09:50", "10:40")]


def slots(days=DAYS, times=TIMES) -> list[TimeSlot]:
    return [
        TimeSlot(id=f"d{day}t{index}", dayOfWeek=day, startTime=start, endTime=end)
        for day in days
        for index, (start, end) in enumerate(times)
    ]


def scenario(**overrides) -> TimetableRequest:
    base = {
        "sections": [Section(id="A", name="A", size=40), Section(id="B", name="B", size=30)],
        "teachers": [Teacher(id="t1", name="Ramesh"), Teacher(id="t2", name="Sushila")],
        "rooms": [
            Room(id="r1", name="Room 1", type="CLASSROOM", capacity=45),
            Room(id="r2", name="Room 2", type="CLASSROOM", capacity=35),
            Room(id="lab", name="Lab", type="LAB", capacity=45),
        ],
        "timeSlots": slots(),
        "offerings": [
            Offering(id="a1", sectionId="A", teacherId="t1", courseCode="C1", theoryPeriods=3),
            Offering(
                id="a2",
                sectionId="A",
                teacherId="t2",
                courseCode="C2",
                theoryPeriods=3,
                labPeriods=2,
            ),
            Offering(id="b1", sectionId="B", teacherId="t1", courseCode="C3", theoryPeriods=3),
        ],
        "timeLimitSeconds": 10,
    }
    return TimetableRequest(**{**base, **overrides})


def test_a_solvable_week_has_no_hard_violations() -> None:
    request = scenario()
    result = solve(request)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert check_hard_constraints(request, result.placements) == []


def test_each_offering_gets_exactly_its_periods() -> None:
    result = solve(scenario())
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for placement in result.placements:
        counts[(placement.offeringId, placement.kind)] += 1
    assert counts == {
        ("a1", "THEORY"): 3,
        ("a2", "THEORY"): 3,
        ("a2", "LAB"): 2,
        ("b1", "THEORY"): 3,
    }


def test_labs_only_happen_in_labs_and_theory_only_outside() -> None:
    result = solve(scenario())
    for placement in result.placements:
        assert (placement.roomId == "lab") == (placement.kind == "LAB")


def test_a_small_room_is_never_used_for_a_big_section() -> None:
    result = solve(scenario())
    for placement in result.placements:
        if placement.offeringId.startswith("a") and placement.kind == "THEORY":
            assert placement.roomId == "r1"


def test_teacher_unavailability_is_respected() -> None:
    # The teacher is only free on day 0, so everything they teach must land there.
    blocked = [
        Unavailability(teacherId="t1", timeSlotId=slot.id)
        for slot in slots()
        if slot.dayOfWeek != 0
    ]
    request = scenario(
        unavailable=blocked,
        offerings=[
            Offering(id="a1", sectionId="A", teacherId="t1", courseCode="C1", theoryPeriods=3)
        ],
    )
    result = solve(request)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert all(placement.timeSlotId.startswith("d0") for placement in result.placements)
    assert check_hard_constraints(request, result.placements) == []


def test_rooms_booked_by_another_semester_stay_free() -> None:
    # Room 1 is the only big enough classroom, and it is taken for all but three slots.
    free = {"d0t0", "d1t0", "d2t0"}
    booked = [
        RoomBooking(roomId="r1", timeSlotId=slot.id) for slot in slots() if slot.id not in free
    ]
    request = scenario(
        bookedRooms=booked,
        offerings=[
            Offering(id="a1", sectionId="A", teacherId="t1", courseCode="C1", theoryPeriods=3)
        ],
    )
    result = solve(request)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert {placement.timeSlotId for placement in result.placements} == free
    assert check_hard_constraints(request, result.placements) == []


def test_periods_are_spread_across_days_when_there_is_room() -> None:
    request = scenario(
        offerings=[
            Offering(id="a1", sectionId="A", teacherId="t1", courseCode="C1", theoryPeriods=4)
        ]
    )
    result = solve(request)
    days = [placement.timeSlotId[:2] for placement in result.placements]
    assert len(set(days)) == 4
    assert result.score is not None
    assert result.score.sameDayRepeats == 0


def test_lab_periods_run_back_to_back() -> None:
    request = scenario(
        offerings=[Offering(id="a2", sectionId="A", teacherId="t2", courseCode="C2", labPeriods=2)]
    )
    result = solve(request)
    assert result.score is not None
    assert result.score.splitLabs == 0
    first, second = sorted(placement.timeSlotId for placement in result.placements)
    assert first[:2] == second[:2]
    assert abs(int(first[3]) - int(second[3])) == 1


def test_a_section_week_is_spread_across_its_days() -> None:
    # 12 periods over 6 days should not fill some days and leave others empty.
    request = scenario(
        offerings=[
            Offering(id="a1", sectionId="A", teacherId="t1", courseCode="C1", theoryPeriods=4),
            Offering(id="a2", sectionId="A", teacherId="t2", courseCode="C2", theoryPeriods=4),
            Offering(id="a3", sectionId="A", teacherId="t3", courseCode="C3", theoryPeriods=4),
        ],
        teachers=[Teacher(id=f"t{n}", name=f"T{n}") for n in (1, 2, 3)],
        rooms=[Room(id="r1", name="Room 1", type="CLASSROOM", capacity=45)],
        sections=[Section(id="A", name="A", size=40)],
    )
    result = solve(request)
    assert result.score is not None
    assert result.score.unevenDays == 0
    per_day: dict[str, int] = defaultdict(int)
    for placement in result.placements:
        per_day[placement.timeSlotId[:2]] += 1
    assert len(per_day) == 6
    assert max(per_day.values()) == 2


def test_a_lab_is_not_treated_as_continuous_across_a_break() -> None:
    # 08:40-09:30 and 09:50-10:40 have a break between them, so only the morning pairs are together.
    request = scenario(
        timeSlots=slots(days=[0], times=TIMES[2:]),
        offerings=[Offering(id="a2", sectionId="A", teacherId="t2", courseCode="C2", labPeriods=2)],
    )
    result = solve(request)
    assert result.score is not None
    assert result.score.splitLabs == 2


def test_a_teacher_is_kept_under_four_in_a_row_when_possible() -> None:
    request = scenario(
        timeSlots=slots(days=[0, 1]),
        sections=[Section(id=name, name=name, size=30) for name in "ABCD"],
        rooms=[Room(id=f"r{n}", name=f"R{n}", type="CLASSROOM", capacity=45) for n in range(4)],
        offerings=[
            Offering(
                id=name, sectionId=name, teacherId="t1", courseCode=f"C{name}", theoryPeriods=1
            )
            for name in "ABCD"
        ],
    )
    result = solve(request)
    assert result.score is not None
    assert result.score.longRuns == 0


def test_section_days_have_no_gaps_when_possible() -> None:
    request = scenario(
        timeSlots=slots(days=[0]),
        offerings=[
            Offering(id="a1", sectionId="A", teacherId="t1", courseCode="C1", theoryPeriods=1),
            Offering(id="a2", sectionId="A", teacherId="t2", courseCode="C2", theoryPeriods=1),
        ],
    )
    result = solve(request)
    assert result.score is not None
    assert result.score.gaps == 0


def test_no_lab_room_is_explained_in_plain_language() -> None:
    request = scenario(rooms=[Room(id="r1", name="Room 1", type="CLASSROOM", capacity=45)])
    result = solve(request)
    assert result.status == "INFEASIBLE"
    assert result.placements == []
    problem = next(p for p in result.unsatisfiable if p.code == "NO_SUITABLE_ROOM")
    assert "C2" in problem.message
    assert "lab" in problem.message


def test_a_section_too_big_for_every_room_is_explained() -> None:
    request = scenario(
        sections=[Section(id="A", name="A", size=500), Section(id="B", name="B", size=30)]
    )
    codes = {problem.code for problem in solve(request).unsatisfiable}
    assert "NO_SUITABLE_ROOM" in codes


def test_an_overloaded_teacher_is_explained() -> None:
    blocked = [Unavailability(teacherId="t1", timeSlotId=slot.id) for slot in slots()[2:]]
    result = solve(scenario(unavailable=blocked))
    problem = next(p for p in result.unsatisfiable if p.code == "TEACHER_OVERLOADED")
    assert "Ramesh" in problem.message


def test_an_overloaded_section_is_explained() -> None:
    request = scenario(
        timeSlots=slots(days=[0]),
        offerings=[
            Offering(id="a1", sectionId="A", teacherId="t1", courseCode="C1", theoryPeriods=9)
        ],
    )
    codes = {problem.code for problem in solve(request).unsatisfiable}
    assert "SECTION_OVERLOADED" in codes


def test_not_enough_room_time_is_explained() -> None:
    request = scenario(
        timeSlots=slots(days=[0], times=TIMES[:2]),
        rooms=[Room(id="r1", name="R1", type="CLASSROOM", capacity=45)],
        offerings=[
            Offering(id="a1", sectionId="A", teacherId="t1", courseCode="C1", theoryPeriods=2),
            Offering(id="b1", sectionId="B", teacherId="t2", courseCode="C3", theoryPeriods=1),
        ],
    )
    codes = {problem.code for problem in solve(request).unsatisfiable}
    assert "NOT_ENOUGH_ROOM_TIME" in codes


def test_a_clash_that_counting_cannot_see_still_gets_an_answer() -> None:
    # Every count passes: the section has two slots for two classes, and each teacher has one free
    # slot for one class. But both teachers are free only in the same slot, so nothing can work.
    request = scenario(
        timeSlots=slots(days=[0], times=TIMES[:2]),
        unavailable=[
            Unavailability(teacherId="t1", timeSlotId="d0t1"),
            Unavailability(teacherId="t2", timeSlotId="d0t1"),
        ],
        rooms=[
            Room(id="r1", name="R1", type="CLASSROOM", capacity=45),
            Room(id="r2", name="R2", type="CLASSROOM", capacity=45),
        ],
        offerings=[
            Offering(id="a1", sectionId="A", teacherId="t1", courseCode="C1", theoryPeriods=1),
            Offering(id="a2", sectionId="A", teacherId="t2", courseCode="C2", theoryPeriods=1),
        ],
    )
    result = solve(request)
    assert result.status == "INFEASIBLE"
    assert [problem.code for problem in result.unsatisfiable] == ["NO_TIMETABLE_FOUND"]


def test_the_checker_itself_catches_double_booking() -> None:
    request = scenario()
    placements = [
        Placement(offeringId="a1", timeSlotId="d0t0", roomId="r1", kind="THEORY"),
        Placement(offeringId="b1", timeSlotId="d0t0", roomId="r1", kind="THEORY"),
    ]
    errors = check_hard_constraints(request, placements)
    assert any("room r1 is double-booked" in error for error in errors)
    assert any("teacher t1 is double-booked" in error for error in errors)
    assert any("needs 3" in error for error in errors)


def test_the_endpoint_returns_a_timetable(client: TestClient) -> None:
    response = client.post("/timetable/generate", json=scenario().model_dump())
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(body["placements"]) == 11
    assert body["score"]["penalty"] >= 0


def test_the_endpoint_refuses_more_than_30_seconds(client: TestClient) -> None:
    payload = scenario().model_dump()
    payload["timeLimitSeconds"] = 300
    assert client.post("/timetable/generate", json=payload).status_code == 422
