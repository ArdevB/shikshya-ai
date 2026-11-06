# Phase 1 — Foundation (MVP)

**Goal:** a working monorepo where users can log in by role, admins can set up the institution's academic structure, manage students and teachers, and teachers can take attendance.

Read `CLAUDE.md` first. Do not build anything from Phase 2+.

---

## 1. Project setup

- [ ] pnpm monorepo: `apps/web`, `apps/api`, `apps/ai` (empty FastAPI skeleton with `/health` only), `packages/shared`
- [ ] TypeScript, ESLint, Prettier configured at the root and shared by workspaces
- [ ] `docker-compose.yml` with Postgres 16 (+ a volume) for local dev
- [ ] Prisma set up in `apps/api`, connected to Postgres
- [ ] `.env.example` for api and web
- [ ] Root scripts: `dev`, `build`, `test`, `lint`, `db:migrate`, `db:seed`
- [ ] Tailwind + shadcn/ui in `apps/web` with the brand tokens and fonts from `CLAUDE.md`
- [ ] Basic GitHub Actions workflow: install → lint → test

## 2. Data models (Prisma)

```
User          id, email (unique), passwordHash, role, firstName, lastName, phone?, avatarUrl?, isActive, lastLoginAt?, createdAt, updatedAt
RefreshToken  id, userId, tokenHash, expiresAt, revokedAt?
Department    id, name, code (unique)
Program       id, departmentId, name, code (unique), durationSemesters, gradingScheme (enum: TU_GPA)
AcademicYear  id, name ("2026/27"), startDate, endDate, isCurrent
Semester      id, programId, academicYearId, number (1..8), startDate, endDate
Section       id, semesterId, name ("A")
Course        id, programId, code, title, creditHours, semesterNumber, hasPractical
CourseOffering id, courseId, sectionId, teacherId        // who teaches which course to which section
Teacher       id, userId (unique), employeeCode, departmentId, designation
Student       id, userId (unique), rollNumber, registrationNumber?, programId, currentSectionId, admissionDate, dateOfBirth?, address?, guardianName?, guardianPhone?
Parent        id, userId (unique)
ParentStudent parentId, studentId, relation               // many-to-many link
Enrollment    id, studentId, sectionId, status (ACTIVE|COMPLETED|DROPPED)
AttendanceSession id, courseOfferingId, date, period?, takenById, createdAt
AttendanceRecord  id, sessionId, studentId, status (PRESENT|ABSENT|LATE|EXCUSED), remark?
AuditLog      id, actorId, action, entity, entityId, before (Json?), after (Json?), createdAt
```

Add indexes on foreign keys and on `(courseOfferingId, date)` and `(studentId)` for attendance.

## 3. Auth & RBAC

- [ ] `POST /auth/login` → access token (15 min) + refresh token (7 days, httpOnly cookie, stored hashed)
- [ ] `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- [ ] `POST /auth/change-password`
- [ ] Middleware: `requireAuth`, `requireRole(...roles)`
- [ ] Scope helpers: `canAccessStudent(user, studentId)`, `teachesOffering(user, offeringId)`, used in services
- [ ] Rate-limit login (e.g. 5 attempts / 15 min / IP+email)
- [ ] Frontend: login page, auth context, protected routes, role-based redirects, silent refresh

## 4. API endpoints

All under `/api/v1`. Roles in brackets.

**Academic structure** [ADMIN, SUPER_ADMIN; read: all authenticated]
- CRUD `/departments`, `/programs`, `/academic-years`, `/semesters`, `/sections`, `/courses`
- CRUD `/course-offerings` (assign teacher to course + section)

**Users** [ADMIN, SUPER_ADMIN]
- CRUD `/teachers` (creates User + Teacher in one transaction, sends a temporary password)
- CRUD `/students` (creates User + Student + Enrollment), list with filters: program, section, search
- `POST /students/import` — CSV upload, validate every row, return per-row errors, all-or-nothing insert
- CRUD `/parents` + `POST /parents/:id/students` to link children

**Attendance**
- `POST /attendance/sessions` [TEACHER — only for own offerings] body: offeringId, date, period, records[]
- `PUT /attendance/sessions/:id` [TEACHER, within 48h; ADMIN any time] → AuditLog
- `GET /attendance/sessions?offeringId=&from=&to=` [TEACHER own, ADMIN]
- `GET /students/:id/attendance-summary` → per-course percentage [STUDENT self, PARENT linked, TEACHER, ADMIN]
- `GET /offerings/:id/attendance-report` → per-student percentage, flag `< 75%`

## 5. Frontend screens

Layout: sidebar (collapses on mobile) + top bar with user menu. Sidebar items depend on role.

- **Admin:** Dashboard (placeholder counts), Departments, Programs, Semesters & Sections, Courses, Course assignments, Teachers, Students (table + filters + CSV import), Parents
- **Teacher:** My classes, Take attendance (select offering + date → list of students with Present/Absent/Late toggles, "mark all present" button), Attendance reports
- **Student:** My attendance (per-course % with a warning badge under 75%)
- **Parent:** Child switcher + attendance view
- Shared: Profile, Change password, 404, loading and empty states

Take-attendance must work well on a phone (large tap targets).

## 6. Seed data

`pnpm db:seed` creates: 1 super admin, 1 admin, 1 department (Computer Science), 2 programs (BSc. CSIT, BIT), current academic year, semesters 1–8 for CSIT, sections A and B for semester 6, 6 courses for semester 6, 4 teachers with offerings, 40 students, 5 parents linked, 3 weeks of attendance with realistic variation (some students below 75%). Print the login credentials at the end.

## 7. Acceptance criteria

- [ ] `pnpm dev` starts web + api; login works for every seeded role
- [ ] A student cannot read another student's attendance (403), verified by a test
- [ ] A teacher cannot take attendance for an offering they don't teach (403), verified by a test
- [ ] Admin can create the full structure department → program → semester → section → course → offering through the UI
- [ ] CSV import rejects bad rows with clear messages and inserts nothing if any row fails
- [ ] Attendance percentage is correct (LATE counts as present, EXCUSED excluded from total), verified by unit tests
- [ ] Editing attendance writes an AuditLog row
- [ ] UI is usable at 375px width
