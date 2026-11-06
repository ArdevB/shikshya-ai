# Phase 5 — Testing, Security, Deployment & Documentation

**Goal:** make Shikshya reliable, secure and deployed, with everything needed for the TU project report and viva.

Prerequisite: Phase 4 acceptance criteria pass. Read `CLAUDE.md` first.

---

## 1. Testing

- [ ] Coverage report for api, web and ai; target ≥ 70% on `apps/api/src/services` and `apps/ai`
- [ ] Integration tests for every route group against a test Postgres (Testcontainers or a separate Compose service), resetting data per suite
- [ ] Permission matrix test: for every route × role, assert allowed/forbidden matches a table in `docs/permissions.md`
- [ ] End-to-end tests with Playwright for the main journeys:
  - Admin sets up a course offering and assigns a teacher
  - Teacher takes attendance and enters marks
  - Admin publishes results → student views marksheet PDF
  - Student pays an invoice (mocked gateway) → receipt
  - Student asks the assistant about attendance (mocked LLM)
- [ ] Load test the main read endpoints with k6 (e.g. 100 virtual users); document results
- [ ] Write `docs/test-cases.md` in report format: ID, module, description, steps, expected, actual, status

## 2. Security hardening

- [ ] Helmet, strict CORS (only the web origin), secure cookie flags, CSRF protection for cookie-based refresh
- [ ] Rate limits on auth, AI and payment routes
- [ ] Validate and sanitize file uploads (type by magic bytes, size, random filenames); markdown rendered with sanitization
- [ ] Check for IDOR on every `:id` route (covered by the permission matrix test)
- [ ] `pnpm audit` / `pip-audit` clean or documented
- [ ] Password policy + account lockout after repeated failures
- [ ] Prompt-injection check: policy documents and student submissions sent to the LLM are wrapped as data, and tool permissions don't depend on the model's judgment
- [ ] Write `docs/security.md` summarizing measures

## 3. Performance & reliability

- [ ] Review Prisma queries for N+1 problems; add missing indexes (check with `EXPLAIN ANALYZE` on the slowest queries)
- [ ] Cache dashboard aggregates; paginate everything
- [ ] Structured logging (pino) with request IDs; error tracking hook (Sentry optional)
- [ ] Health checks: `/health` for api (db ping) and ai
- [ ] Database backup script (`pg_dump`) + restore instructions

## 4. Storage & production config

- [ ] Implement the Cloudinary (or S3) version of `StorageService`; switch by env var
- [ ] Production env validation at startup (fail fast with a clear message if a required var is missing)
- [ ] Production builds: Vite static build; API compiled with tsc; AI service Dockerfile

## 5. Deployment

- [ ] Database: Neon or Supabase Postgres (enable pgvector)
- [ ] API + AI service: Render or Railway (Dockerfiles), AI service private/internal where the platform allows
- [ ] Web: Vercel
- [ ] Run migrations as a release step; seed a **demo** institution (clearly fake data) for the viva
- [ ] GitHub Actions: lint → test → build on every PR; deploy on merge to `main`
- [ ] Custom domain + HTTPS (optional)
- [ ] Turn the landing page design into the public homepage route `/` with a "Log in" button

## 6. Documentation

- [ ] `README.md`: overview, screenshots, architecture diagram, local setup in < 10 steps, env vars, demo credentials
- [ ] `docs/architecture.md`: system diagram (web ↔ api ↔ ai ↔ db ↔ gateways ↔ LLM), request flow for login, payment and the assistant
- [ ] `docs/api.md` or OpenAPI spec generated from Zod schemas (served at `/api/docs`)
- [ ] `docs/database.md`: ER diagram (Mermaid) generated from the Prisma schema
- [ ] `docs/algorithms/`: risk model (features, metrics, limitations), timetable solver, GPA calculation, RAG pipeline
- [ ] `docs/user-manual.md`: one section per role with screenshots
- [ ] Report diagrams in Mermaid: use case, DFD level 0/1/2, class diagram, sequence diagrams (login, payment, assistant), activity diagram (attendance), Gantt chart of the five phases

## 7. Acceptance criteria

- [ ] All tests pass in CI; coverage targets met
- [ ] Permission matrix test passes for every route and role
- [ ] Deployed app works end to end for every role using the demo data
- [ ] Payments work in gateway sandbox mode on the deployed site
- [ ] A new developer can run the project locally using only the README
- [ ] All report diagrams and docs listed above exist and match the code
