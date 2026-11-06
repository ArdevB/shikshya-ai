# Phase 2 — Academics

**Goal:** timetables, exams and results with TU-style GPA/CGPA, assignments with submissions, notices, and real dashboards for each role.

Prerequisite: Phase 1 acceptance criteria pass. Read `CLAUDE.md` first.

---

## 1. Data models (Prisma)

```
Room            id, name, capacity, type (CLASSROOM|LAB|HALL)
TimeSlot        id, dayOfWeek (0-6), startTime, endTime, label?
TimetableEntry  id, courseOfferingId, roomId, timeSlotId, semesterId
                unique(roomId, timeSlotId, semesterId), unique(teacher via offering, timeSlotId) — enforce in service

Exam            id, semesterId, name ("First Term", "Pre-board", "Final"), type (INTERNAL|PRACTICAL|FINAL), startDate, endDate, isPublished
ExamSubject     id, examId, courseOfferingId, fullMarks, passMarks, date?
Mark            id, examSubjectId, studentId, marksObtained (Decimal), isAbsent, enteredById, updatedAt
                unique(examSubjectId, studentId)
GradeScale      id, scheme (TU_GPA), minPercent, maxPercent, grade ("A", "A-", …), gradePoint (Decimal)
Result          id, studentId, semesterId, gpa (Decimal), totalCredits, status (PASS|FAIL|WITHHELD), publishedAt?
ResultCourse    id, resultId, courseId, percent, grade, gradePoint, creditHours

Assignment      id, courseOfferingId, title, description (markdown), dueAt, maxMarks, allowLate, attachments (Json), createdById
Submission      id, assignmentId, studentId, submittedAt, files (Json), text?, isLate, marks?, feedback?, gradedById?, gradedAt?
                unique(assignmentId, studentId)
Material        id, courseOfferingId, title, description?, files (Json), createdById, createdAt

Notice          id, title, body (markdown), audience (ALL|STUDENTS|TEACHERS|PARENTS|PROGRAM|SECTION), programId?, sectionId?, isPinned, publishAt, expiresAt?, createdById
NoticeRead      noticeId, userId, readAt
Event           id, title, description?, startAt, endAt, location?, audience (same as Notice)
```

File uploads for this phase: store locally under `uploads/` behind an interface (`StorageService`) so Phase 5 can switch to Cloudinary/S3. Limit 10 MB, allow pdf, docx, pptx, zip, jpg, png.

## 2. Timetable

- [ ] CRUD rooms and time slots [ADMIN]
- [ ] `POST /timetable/entries` with clash detection: same room + slot, same teacher + slot, same section + slot → 409 with which clash
- [ ] `GET /timetable?sectionId=` | `?teacherId=` | `?roomId=` → weekly grid
- [ ] UI: weekly grid editor for admins (drag a course offering into a cell), read-only grid for teachers/students/parents, "today's classes" widget

(Automatic generation comes in Phase 4. Keep the clash-check logic in a pure function `findClashes(entries)` so Phase 4 can reuse it.)

## 3. Exams & results

- [ ] CRUD exams and exam subjects [ADMIN]
- [ ] Mark entry grid [TEACHER for own offerings]: rows = students, column = marks, keyboard navigation, autosave, validate `0 ≤ marks ≤ fullMarks`, "absent" toggle → AuditLog on every change
- [ ] Lock marks when the exam is published (ADMIN can unlock, logged)
- [ ] `GradeScale` seeded with the TU grading table (keep it in the database, not hard-coded, so it can be adjusted)
- [ ] `services/grading.ts`: percent → grade → grade point; GPA = Σ(gradePoint × credit) / Σcredit; CGPA across published semesters; round to 2 decimals
- [ ] `POST /exams/:id/publish` → computes `Result` + `ResultCourse` rows in one transaction
- [ ] `GET /students/:id/results` [self, parent, teacher, admin] and `GET /sections/:id/results` [teacher, admin]
- [ ] UI: result view per semester, CGPA trend chart, class result summary (pass %, grade distribution chart)

## 4. Assignments & materials

- [ ] Teacher creates assignments and uploads materials for own offerings
- [ ] Student sees assignments with due-date status (Due, Overdue, Submitted, Graded), submits files/text, can resubmit until the deadline
- [ ] Late submissions are flagged; rejected if `allowLate = false`
- [ ] Teacher grading view: list of submissions, download, enter marks + feedback
- [ ] Student sees marks and feedback once graded

## 5. Notices & events

- [ ] Admin/teacher creates notices with audience targeting (teachers may only target their own sections)
- [ ] Users see notices relevant to them, pinned first, unread badge count, mark-as-read
- [ ] Event calendar (month view) filtered by audience

## 6. Dashboards

Replace Phase 1 placeholders with real data (each card backed by one API endpoint, cached 60s):

- **Admin:** total students by program, today's attendance %, students below 75%, upcoming exams, recent notices, chart: attendance trend (last 30 days)
- **Teacher:** today's classes, pending attendance sessions, ungraded submissions, low-attendance students in my sections
- **Student:** today's timetable, attendance % by course, upcoming deadlines, latest result/GPA, notices
- **Parent:** same as student, per child

## 7. Seed data

Extend the seed: rooms, time slots (Sun–Fri, 6 periods), a clash-free timetable for semester 6, one published internal exam with marks, one unpublished exam, 6 assignments with mixed submissions, 8 notices, 4 events.

## 8. Acceptance criteria

- [ ] Creating a clashing timetable entry returns 409 naming the clash; unit tests cover all three clash types
- [ ] GPA/CGPA calculation matches hand-worked examples in unit tests (include a failed course and an absent student)
- [ ] Teachers cannot enter marks for another teacher's course; marks are read-only after publishing
- [ ] Students only see published results
- [ ] Late submission rules work as specified
- [ ] Notices are only visible to their audience (tests for each audience type)
- [ ] Every dashboard loads in under 1s with seed data
