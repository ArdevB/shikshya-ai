# Phase 4 — AI Features

**Goal:** add the four AI features that make Shikshya stand out:

1. **Shikshya Assistant** — chat assistant that answers questions from live data using tool calling, plus college rules via RAG
2. **At-risk student prediction** — ML model that flags students likely to fail
3. **AI quiz generator** — teachers turn notes into reviewable questions
4. **Automatic timetable generator** — constraint-based scheduler

Prerequisite: Phase 3 acceptance criteria pass. Read `CLAUDE.md` first.

**Non-negotiable rule:** AI never bypasses RBAC. Every piece of data the AI sees is fetched through the same service functions and permission checks as the normal API, as the logged-in user.

---

## 0. AI service setup (`apps/ai`)

- [ ] FastAPI app with routers: `/predict`, `/quiz`, `/timetable`, `/health`
- [ ] Only the Node API calls it (shared secret header `X-Internal-Key`); not exposed publicly
- [ ] Add it to Docker Compose
- [ ] Env: `GEMINI_API_KEY`, `LLM_MODEL` and `EMBEDDING_MODEL` (configurable — check the Gemini docs for current model names), `INTERNAL_KEY`
- [ ] pytest set up; ruff for linting

## 1. Shikshya Assistant (chat)

Lives in `apps/api` (Node, Google Gen AI SDK `@google/genai`) so it can call existing services directly.

**Data models**
```
ChatConversation id, userId, title, createdAt
ChatMessage      id, conversationId, role (USER|ASSISTANT|TOOL), content (Json), tokensIn?, tokensOut?, createdAt
PolicyDocument   id, title, fileUrl, uploadedById, createdAt
PolicyChunk      id, documentId, content, embedding (vector)   // pgvector extension
```

**Tools** (each implemented as a thin wrapper around an existing service, executed with the current user's permissions):

| Tool | Roles | Returns |
| --- | --- | --- |
| `get_my_attendance(courseCode?)` | STUDENT, PARENT (childId) | per-course % and classes needed to reach 75% |
| `get_my_timetable(day?)` | all | classes for the day/week |
| `get_my_results(semester?)` | STUDENT, PARENT | GPA, course grades (published only) |
| `get_my_fees()` | STUDENT, PARENT | invoices, due dates, outstanding |
| `get_upcoming_deadlines()` | STUDENT | assignments and exams in the next 14 days |
| `get_section_attendance(sectionId, courseCode?)` | TEACHER (own), ADMIN | low-attendance list |
| `get_notices(limit)` | all | recent relevant notices |
| `search_college_rules(query)` | all | top policy chunks (RAG) |

- [ ] The tool list sent to the model is filtered by role, so a student never even sees teacher tools
- [ ] System prompt: identity ("Shikshya Assistant"), today's date in Asia/Kathmandu, user's name and role, answer only from tool results or rules, say "I don't know" otherwise, never reveal other users' data, short answers
- [ ] Tool-calling loop with a max of 5 tool rounds per message
- [ ] Stream responses to the frontend (SSE)
- [ ] RAG: admin uploads policy PDFs → extract text → chunk (~800 tokens, overlap 100) → embed → store in pgvector. Embeddings come from Gemini (`gemini-embedding-001`, 768 dimensions), chosen by the project owner along with the LLM
- [ ] Rate limit: 30 messages/user/hour; log token usage
- [ ] UI: chat panel (floating button + full page), conversation history, suggested starter questions per role, show which tools were used ("Checked your attendance")

**Tests:** student asking for another student's data gets refused; teacher tool not available to students; tool wrappers enforce permissions (unit tests with a mocked LLM).

## 2. At-risk student prediction

**Features per student per course** (compute in Node, send to the AI service):
attendance %, attendance trend (last 2 weeks vs previous), internal exam %, assignment submission rate, average assignment %, late submission rate, previous semester GPA.

**Model** (`apps/ai/ml/`):
- [ ] `generate_synthetic.py` — creates a realistic labeled dataset (document the assumptions; real historical data can replace it later)
- [ ] `train.py` — compare Logistic Regression and Random Forest with cross-validation; report accuracy, precision, recall, F1, ROC-AUC; prioritize **recall** for the at-risk class; save the chosen model with joblib + a `model_card.md` (features, metrics, limitations)
- [ ] `POST /predict/risk` → `{ probability, level: LOW|MEDIUM|HIGH, topFactors: [...] }` (top factors from feature importances / coefficients)
- [ ] Nightly job in the API computes predictions → `RiskPrediction` table (studentId, courseOfferingId, probability, level, factors, computedAt)

**UI:**
- [ ] Teacher: "Students needing attention" list per section with level badges and the reasons in plain language
- [ ] Admin: at-risk counts by program/section
- [ ] Students do **not** see their own risk label; instead they get a supportive notification ("Your DBMS attendance is 68%. Attending the next 5 classes brings you back above 75%.")
- [ ] Teachers can mark a flag as "reviewed / action taken" with a note

## 3. AI quiz generator

- [ ] Teacher uploads a PDF/DOCX/text or picks an existing Material, chooses: number of questions, types (MCQ, true/false, short answer), difficulty
- [ ] AI service extracts text, calls the LLM with a strict JSON schema; validate with Pydantic and retry once on invalid output
- [ ] Each question: `type, question, options?, correctAnswer, explanation, difficulty, sourceSnippet`
- [ ] Teacher review screen: edit, delete, regenerate a single question, approve
- [ ] Approved questions → `Quiz` + `QuizQuestion` tables; publish to a section with open/close times
- [ ] Students take the quiz (MCQ/TF auto-graded, short answers graded by the teacher); results visible to the teacher
- [ ] Nothing reaches students without teacher approval

## 4. Automatic timetable generator

Implement in `apps/ai/timetable/` with **Google OR-Tools CP-SAT** (preferred) or a genetic algorithm. Document the algorithm in `docs/algorithms/timetable.md` for the project report.

**Input:** sections, course offerings with weekly periods required (theory + lab), teachers, rooms (type + capacity), time slots, teacher unavailability.

**Hard constraints:** no teacher, room or section double-booked; labs only in LAB rooms; room capacity ≥ section size; each offering gets exactly its required periods; teacher unavailability respected.

**Soft constraints (weighted):** spread a course's periods across different days; avoid more than 3 consecutive periods for a teacher; minimize gaps in a section's day; consecutive slots for labs.

- [ ] `POST /timetable/generate` → returns a proposed timetable + score + any unsatisfiable constraints explained
- [ ] Time limit 30s; return best found
- [ ] Admin UI: set constraints → generate → preview in the weekly grid → manually adjust → save (saving reuses Phase 2's `findClashes` validation)

## 5. Acceptance criteria

- [ ] Assistant answers correctly for each seeded role using live data, and refuses cross-user requests (tests with mocked LLM + a manual demo script in `docs/ai-demo.md`)
- [ ] Role filtering of tools is covered by tests
- [ ] Risk model training script runs end-to-end and writes metrics + model card; recall for the at-risk class ≥ 0.75 on the test split of the synthetic data
- [ ] Teacher sees at-risk students with readable reasons; students never see a risk label
- [ ] Quiz generator returns valid JSON every time (validated + retry), and nothing is published without approval
- [ ] Generated timetable for seed data has zero hard-constraint violations (verified by `findClashes` and a test)
- [ ] All AI calls are logged with user, feature, tokens and latency
