# Shikshya — Project Context for Claude Code

Shikshya is an AI-powered University/School/College Management System built for institutions in Nepal (TU-style GPA grading, eSewa/Khalti payments). It is also a BSc. CSIT academic project, so code must be clean, well-structured and easy to explain in a viva.

The build is split into phases. Each phase has its own spec in `docs/phases/`:

| Phase | File | Scope |
| --- | --- | --- |
| 1 | `PHASE-1-foundation.md` | Monorepo, auth + RBAC, academic structure, students & teachers, attendance |
| 2 | `PHASE-2-academics.md` | Timetable, exams & results (GPA/CGPA), assignments, notices, dashboards |
| 3 | `PHASE-3-finance-notifications.md` | Fees, eSewa/Khalti, PDF generation, email/in-app notifications |
| 4 | `PHASE-4-ai.md` | AI assistant, at-risk prediction, quiz generator, timetable generator |
| 5 | `PHASE-5-quality-deploy.md` | Testing, security hardening, deployment, documentation |

**Work one phase at a time.** Do not start a phase until the previous phase's acceptance criteria pass. Do not build features from later phases early.

## Tech stack (fixed — do not swap without asking)

- **Monorepo:** pnpm workspaces — `apps/web`, `apps/api`, `apps/ai`, `packages/shared`
- **Frontend (`apps/web`):** React 18 + Vite + TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, Recharts
- **Backend (`apps/api`):** Node.js 20 + Express + TypeScript, Prisma ORM, PostgreSQL 16, Zod validation, JWT (access + refresh), bcrypt
- **AI service (`apps/ai`):** Python 3.11 + FastAPI, scikit-learn, pandas; LLM calls via the Anthropic SDK (model configurable by env var)
- **Shared (`packages/shared`):** Zod schemas, TypeScript types and enums shared by web and api
- **Local dev:** Docker Compose for Postgres (and later the AI service)

## Brand

Palette chosen by the project owner (replaces the original navy/indigo/saffron design):

- Sky Blue `#0593C6` (primary), Hot Pink `#D83995` (accent), White `#FCFFFF` (page background and cards)
- Shades derived from those, so text stays readable: Ink `#0B2B3A` (body text, dark surfaces), Muted `#4A6472` (secondary text), Border `#D5E6ED`, Sky Dark `#04729A` (links and small blue text, because Sky Blue on white is only 3.5:1), Pink Dark `#B02476` (small pink text)
- Headings: Space Grotesk. Body: Inter.
- Tokens live in `apps/web/src/index.css` and `apps/web/tailwind.config.ts`. Components use the tokens, never raw hex values.
- Set these as Tailwind theme tokens / shadcn CSS variables in Phase 1.

## Roles

`SUPER_ADMIN`, `ADMIN`, `TEACHER`, `STUDENT`, `PARENT`, `ACCOUNTANT`, `LIBRARIAN`

Every API route declares which roles may call it. Row-level rules also apply: a student only sees their own records, a parent only their linked children, a teacher only the sections/courses they teach.

## Conventions

- TypeScript `strict: true` everywhere. No `any` without a comment explaining why.
- API: REST under `/api/v1`, JSON, consistent error shape `{ error: { code, message, details? } }`.
- Validate every request body/query with Zod schemas from `packages/shared`.
- Controllers stay thin: route → validate → service → Prisma. Business logic lives in `services/`.
- Paginate list endpoints (`?page=&pageSize=`, default 20, max 100).
- Money is stored as integer paisa (NPR × 100), never floats.
- Dates stored in UTC; display in Asia/Kathmandu.
- Every write to marks, attendance, fees and payments creates an `AuditLog` row.
- Secrets only from env vars; keep `.env.example` up to date.
- Write tests alongside features (Vitest for api/web, pytest for ai).
- Conventional commits (`feat:`, `fix:`, `chore:` …), one logical change per commit.

## Commands (keep this section updated as you build)

```bash
pnpm install          # install all workspaces (also builds shared, generates the Prisma client)
pnpm db:up            # start Postgres with Docker, or...
pnpm db:local         # ...start Postgres without Docker (leave it running)
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # replace the database with demo data
pnpm dev              # run web + api together (web :5173, api :4000)
pnpm test             # run all tests (starts its own throwaway Postgres)
pnpm lint             # eslint + prettier check
pnpm format           # prettier --write
pnpm typecheck        # tsc across workspaces
pnpm build            # production builds
# AI service, from apps/ai with its .venv active: pytest, ruff check .
```

In `apps/api/src/pdf/render.ts`, Puppeteer must stay loaded through `require`, on first use. Importing its ES module build under `tsx watch` on Windows freezes the whole API. Do not switch `dev` to `node --watch` either: it also watches `node_modules`, and restarts the API in the middle of the first PDF.

## Definition of done (every phase)

- All acceptance criteria in the phase file pass
- `pnpm lint` and `pnpm test` pass
- New env vars documented in `.env.example`
- Seed data updated so the feature can be demoed
- `README.md` updated with anything a new developer needs
