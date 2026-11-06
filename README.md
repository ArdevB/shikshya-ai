# Shikshya

An AI-powered management system for universities, colleges and schools in Nepal, with TU-style GPA grading and eSewa/Khalti payments. It is also a BSc. CSIT academic project.

The build is split into five phases, specified in [docs/phases](docs/phases). Conventions for contributors are in [CLAUDE.md](CLAUDE.md).

| Phase | Scope                                                                         | Status                                                            |
| ----- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1     | Monorepo, login and roles, academic structure, students, teachers, attendance | Done                                                              |
| 2     | Timetable, exams and results, assignments, notices, dashboards                | Done                                                              |
| 3     | Fees, eSewa/Khalti, PDFs, notifications                                       | Built, see [the sandbox check](#checking-payments-in-the-sandbox) |
| 4     | AI assistant, at-risk prediction, quiz and timetable generators               |                                                                   |
| 5     | Testing, security hardening, deployment, documentation                        |                                                                   |

## Project layout

```
apps/web         React + Vite frontend
apps/api         Express + Prisma API
apps/ai          FastAPI service (health check only until Phase 4)
packages/shared  Zod schemas, types and the attendance calculation, shared by web and api
docs/phases      The specification for each phase
```

## Run it locally

You need Node.js 20 or newer and [pnpm](https://pnpm.io/installation). Docker is optional.

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Create the API's settings file. The defaults work as they are for local development:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
3. Start Postgres, using **one** of these:
   ```bash
   pnpm db:up      # with Docker
   pnpm db:local   # without Docker: leave this running in its own terminal
   ```
4. Create the tables:
   ```bash
   pnpm db:migrate
   ```
5. Load the demo data. This replaces everything in the database:
   ```bash
   pnpm db:seed
   ```
6. Start the web app and API:
   ```bash
   pnpm dev
   ```
7. Open <http://localhost:5173> and log in with an account below.

### Demo accounts

Every account uses the password `Shikshya@123`.

| Role                        | Email                      |
| --------------------------- | -------------------------- |
| Super admin                 | `superadmin@shikshya.test` |
| Admin                       | `admin@shikshya.test`      |
| Accountant                  | `accountant@shikshya.test` |
| Teacher (1 to 4)            | `teacher1@shikshya.test`   |
| Student (01 to 40)          | `student01@shikshya.test`  |
| Student with low attendance | `student03@shikshya.test`  |
| Parent of two children      | `parent1@shikshya.test`    |

### Importing students

Admins can import students from a CSV file under **Students → Import CSV**, which also offers a template. Every row is checked first, and if any row has a problem nothing is imported. The program, semester and section must already exist in the current academic year.

## Commands

| Command           | What it does                                                 |
| ----------------- | ------------------------------------------------------------ |
| `pnpm dev`        | Runs the web app (port 5173) and API (port 4000)             |
| `pnpm test`       | Runs all tests. Starts its own throwaway Postgres            |
| `pnpm lint`       | ESLint and the Prettier check                                |
| `pnpm format`     | Formats the code with Prettier                               |
| `pnpm typecheck`  | Type-checks every workspace                                  |
| `pnpm build`      | Production builds                                            |
| `pnpm db:migrate` | Applies database migrations, creating new ones as needed     |
| `pnpm db:seed`    | Replaces the database with demo data (refused in production) |

The AI service has its own Python 3.11 environment:

```bash
cd apps/ai
py -3.11 -m venv .venv        # on macOS/Linux: python3.11 -m venv .venv
.venv/Scripts/activate        # on macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest
uvicorn app.main:app --port 8000
```

## Settings

Settings for the API are in `apps/api/.env`, described in [apps/api/.env.example](apps/api/.env.example). The web app works with no settings in development, because Vite forwards `/api` to the API; see [apps/web/.env.example](apps/web/.env.example).

## Attendance rules

- A student's percentage is `(present + late) / (present + late + absent)`. Excused classes are left out entirely.
- Below 75% is flagged throughout the system. Exactly 75% is not.
- Teachers may edit a session for 48 hours after taking it. Admins may edit at any time. Every create and edit is written to the audit log.

## Grading

The grade table lives in the database (`GradeScale`) so a college can adjust it. The seed uses the table published by [TU's Central Department of CS & IT](https://cdcsit.tu.edu.np/pages/bs-2733):

| Percent   | Grade | Grade point |
| --------- | ----- | ----------- |
| 90 to 100 | A     | 4.0         |
| 80 to <90 | A-    | 3.7         |
| 70 to <80 | B+    | 3.3         |
| 60 to <70 | B     | 3.0         |
| 50 to <60 | B-    | 2.7         |
| 40 to <50 | C     | 2.3         |
| below 40  | F     | 0           |

- A course's percentage is its total marks over its total full marks, across the semester's published exams. Reaching the combined pass marks is also required, otherwise the course is an F.
- An absent student scores zero for that paper.
- GPA is the sum of (grade point x credit) divided by the sum of credits. CGPA does the same across published semesters. Both round to 2 decimals.
- Publishing an exam locks its marks and calculates results in one transaction, and is refused while any marks are missing. An admin can unlock it, which withdraws that exam from students' results until it is published again. Both actions are logged.

## Files

Uploads are limited to 10 MB each and to pdf, docx, pptx, zip, jpg and png. They are stored in `apps/api/uploads` behind a `StorageService` interface, so Phase 5 can switch to cloud storage. Every download goes through the API, which applies the same access rules as the record the file belongs to.

## Fees and payments

All money is stored as integer paisa. Staff type rupees, and the API converts them.

- **Invoices** are generated per semester from its fee structure. Generating twice creates no duplicates.
- **Fines** are recalculated from the due date by a daily job, so running it twice changes nothing.
- **Online payments** go through one `PaymentGateway` interface, with eSewa and Khalti behind it. A redirect back from a gateway is never believed: the API asks the gateway directly, checks the amount matches exactly, and only then credits the invoice. Duplicate callbacks do nothing. A payment left unconfirmed is rechecked every 15 minutes and given up on after a day.
- **Khalti** needs a key in `KHALTI_SECRET_KEY`. Until then, choosing it explains that it is not set up.

### Checking payments in the sandbox

Automated tests cover the payment logic against mocked gateway responses. A real sandbox payment has to be done by hand, because it means logging in on the gateway's own site:

1. Start the app, log in as `student02@shikshya.test` and open **Fees**.
2. **eSewa:** choose **Pay now → Pay with eSewa**, then log in on eSewa's test page with ID `9711111111`, password `Nepal@123`, MPIN `1122` and token `123456`.
3. **Khalti:** first create a merchant account at <https://test-admin.khalti.com>, put its `live_secret_key` in `apps/api/.env` as `KHALTI_SECRET_KEY`, and restart. Then choose **Pay with Khalti** and use ID `9800000000`, MPIN `1111` and OTP `987654`.
4. You should return to a "Payment successful" page where the receipt downloads, and the invoice should now show as paid.

These test values come from [eSewa's](https://developer.esewa.com.np/pages/Epay) and [Khalti's](https://docs.khalti.com/khalti-epayment/) developer docs. For production, set your own keys and URLs in `apps/api/.env`.

## Notifications

Notifications appear in the app in real time and by email, and each person can turn types off under **Notification settings**. With no `SMTP_HOST` set, emails are logged rather than sent. To see real ones locally, run [Mailpit](https://mailpit.axllent.org/) and set `SMTP_HOST=localhost` and `SMTP_PORT=1025`. Scheduled jobs run inside the API process.

## Who can see what

Each API route declares which roles may call it, and services apply row-level rules on top: a student sees only their own records, a parent only their linked children, and a teacher only the sections they teach. Hiding a page in the web app is only a convenience. The API is what enforces access.

## Temporary passwords

Accounts created by an admin get a temporary password, shown to the admin once, and must choose a new one at first login. Email delivery arrives with Phase 3.
