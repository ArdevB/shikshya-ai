# AI features: demo script

A walk-through for showing the Phase 4 features, for example in a viva. Every account uses the password `Shikshya@123`.

## Before you start

1. Add `GEMINI_API_KEY` to `apps/api/.env`. Use the fake demo data only on Gemini's free tier, because its terms forbid personal data.
2. Run `pnpm dev`, then `pnpm ai:check` in another terminal. It should end with "Everything works".
3. Run `pnpm db:seed` if the demo data has been changed.
4. Open the app a minute early: the Neon database sleeps when idle, and takes a few seconds to wake.

Features 2 and 4 work with no Gemini key at all.

## 1. Shikshya Assistant

Open the sparkle button at the bottom right, or **Assistant** in the menu.

| Log in as | Ask | What to expect |
| --- | --- | --- |
| `student03@shikshya.test` | What is my attendance like? | Their real figures, and the classes needed to reach 75%. "Checked attendance" appears above the answer. |
| `student01@shikshya.test` | What's due in the next two weeks? | Their assignments and exams. |
| `student01@shikshya.test` | How much do I owe in fees? | Their invoices, in rupees. |
| `student01@shikshya.test` | What marks did student02 get? | A refusal. No tool even accepts another student. |
| `student01@shikshya.test` | Who is below 75% in my class? | A refusal. The teacher tool is not offered to students at all. |
| `student01@shikshya.test` | How many days late can I pay my fees? | The answer from the college rules: a 7 day grace period. |
| `student01@shikshya.test` | What is the capital of France? | "I don't know". It only answers from college data. |
| `parent1@shikshya.test` | How is attendance? | With two children, it asks which one. |
| `teacher1@shikshya.test` | Who is below 75% in CSC364? | The low-attendance list for that class. |
| `teacher2@shikshya.test` | Who is below 75% in CSC364? | Nothing, unless that teacher teaches it. |

**Explain:** the model never gets to choose whose data it sees. The tool list is filtered by role, and each tool works out the student from who is logged in, then calls the same service and permission check as the normal API. A prompt cannot change that.

**College rules:** as `admin@shikshya.test`, open **College rules**. Press **Prepare search** so the seeded rules can be found by meaning, then add your own PDF.

## 2. Students needing attention

1. As `admin@shikshya.test`, open **Students needing attention** and press **Recalculate now**. It takes up to a minute. The counts by section fill in.
2. As `teacher1@shikshya.test`, open the same page: flagged students with reasons in plain language, only from their own classes.
3. Press **Mark as reviewed** and record what was done. They leave the "Still to review" list.
4. Log in as a flagged student. There is no risk label anywhere, and `/api/v1/risk` returns 403. They may have a supportive notification in the bell instead.

**Explain:** the model is trained on synthetic data, and `apps/ai/ml/model_card.md` says so, with its metrics and limits. Recall is favoured because missing a struggling student costs more than an unneeded check-in. Run `python -m ml.train` from `apps/ai` to retrain it.

## 3. Quiz generator

1. As `teacher1@shikshya.test`, open **Quizzes**. The seed has one published quiz and one draft.
2. Press **Write a quiz with AI**, paste some notes or upload a PDF, and generate.
3. Each question shows the answer, why, and the sentence from your notes it came from. Edit, regenerate or delete any of them.
4. **Publish** stays off until every question is approved. That is the rule: nothing reaches students without a teacher's approval.
5. As `student01@shikshya.test`, open **Quizzes** and take the published one. The answers are never sent to the browser while it is open.
6. As `teacher1`, open the published quiz and mark `student02`'s short answer.

## 4. Timetable generator

1. As `admin@shikshya.test`, open **Timetable generator** and choose CSIT Semester 6.
2. Change the periods for a class if you like, or use **Set** to mark a teacher as unavailable.
3. Press **Generate**. It takes a second or two, and shows clashes at 0.
4. Press a class to move it somewhere that clashes. The warning appears and **Save** turns off. Move it back.
5. Save it, then look at the normal **Timetable** page.
6. To see an impossible request, mark a teacher as unavailable for almost every period, then generate. It explains why in plain words.

**Explain:** see `docs/algorithms/timetable.md`.

## If something goes wrong

- **"The AI service is not running":** check that the `[ai]` lines in the `pnpm dev` output look healthy, and that `apps/ai/.venv` exists.
- **"Gemini is not set up yet":** add the key to `apps/api/.env`, and restart `pnpm dev`.
- **An answer fails after several tries:** the free tier has daily limits, which AI Studio shows for your project.
