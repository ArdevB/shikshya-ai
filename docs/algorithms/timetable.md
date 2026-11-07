# Automatic timetable generation

Written for the project report and viva. The code is in `apps/ai/timetable/solver.py`.

## The problem

A college must place every class into a weekly grid of time slots and rooms, so that nobody is in two places at once. Each section has several courses, each course needs a set number of periods, and teachers and rooms are shared. Trying every arrangement by hand, or even by brute force, is impossible: the number of arrangements grows exponentially with the number of classes.

This is a **constraint satisfaction and optimisation problem**. Some rules must never be broken, and others should be followed as far as possible.

## The method: constraint programming with CP-SAT

Shikshya uses **CP-SAT**, the constraint programming solver in Google OR-Tools. Instead of writing an algorithm that searches for a timetable, we describe what a valid timetable looks like, and the solver finds one. It was chosen over a genetic algorithm for three reasons:

- It guarantees the hard constraints. A genetic algorithm only makes breaking them less likely.
- It can prove that a timetable is the best possible, or that none exists.
- A short, declarative model is easier to check and to explain.

### Decision variables

There is one yes/no variable for each possible lesson placement:

> `x[offering, kind, slot, room]` is 1 if this offering has a lesson of this kind (theory or lab) in this time slot and room.

Impossible combinations are never created, which makes the model smaller and faster. For example, there is no variable for a lab in a classroom, for a room too small for the section, or for a time when the teacher is unavailable.

### Hard constraints: these must hold

| Rule | How it is expressed |
| --- | --- |
| Each offering gets exactly its required periods | Sum of its variables = required periods |
| No room is double-booked | At most one variable per room and slot |
| No teacher is double-booked | At most one variable per teacher and slot |
| No section is double-booked | At most one variable per section and slot |
| Labs only in lab rooms | The variable does not exist otherwise |
| Room capacity is at least the section size | The variable does not exist otherwise |
| Teacher unavailability is respected | The variable does not exist otherwise |
| Rooms and teachers used by another semester at the same time stay free | The variable does not exist otherwise |

### Soft constraints: these are minimised

Each kind of problem adds to a penalty, and the solver minimises the weighted total.

| Rule | Measured as | Weight |
| --- | --- | --- |
| Avoid more than 3 periods in a row for a teacher | Windows of 4 consecutive busy slots | 6 |
| Keep a lab's periods back to back | Lab periods with no adjacent lab period | 5 |
| Spread a course's theory periods across days | Periods beyond the first in one day | 4 |
| Avoid gaps in a section's day | Empty slots with classes both before and after | 3 |

The weights are a judgement call, and easy to change. A teacher on their feet too long counts for more than a short gap for students.

Two slots only count as adjacent if one ends exactly when the other starts, so a lab cannot be "back to back" across the tea break.

### Time limit

The solver stops after 30 seconds and returns the best timetable found. The result says whether that is proven optimal or just the best found in the time.

## When no timetable exists

A solver that only says "infeasible" is no help to an administrator, so obvious causes are found by counting first, before any solving. These checks give a plain reason:

- A class needs a lab, or a classroom, and none is big enough.
- A section needs more periods than there are time slots.
- A teacher needs to teach more periods than they are free.
- More periods are needed than the rooms offer.

If the counts all pass but the solver still finds nothing, the conflict is a combination of rules. For example, two teachers of the same section may both be free only in the same slot. The admin is then told to add a room or slot, or free a teacher.

## Checking the result

The solver's word is not taken for it. Two independent checks run:

1. `check_hard_constraints` in Python recounts every hard constraint from the result. The tests use it.
2. The API runs each proposal through `findClashes`, the same function that protects manual edits in the timetable editor. A proposal shows its clash count, and saving refuses anything with a clash.

## From proposal to saved timetable

1. The admin chooses a semester, and can adjust periods per class and teacher availability.
2. **Generate** returns a proposal. Nothing is saved.
3. The admin reviews it in the weekly grid, section by section, and can move any class. Each move is rechecked for clashes straight away.
4. **Save** replaces that semester's timetable, in one transaction, after the same clash check. An audit row records who did it.

## Results on the demo data

For Semester 6, with 12 classes across 2 sections, 4 teachers, 5 rooms and 36 time slots, it placed 48 periods in about one second. The result was proven optimal, with a penalty of 0 and no clashes.

## Limitations

- It balances within the rules above, but does not spread a section's whole week evenly, so a section can have some full days and some light ones. A further soft rule could change this.
- It treats all teachers' preferences equally, and has no idea of preferred times, only unavailable ones.
- Reaching a proven optimum may take much longer on a large college. It would then return the best found in 30 seconds.
