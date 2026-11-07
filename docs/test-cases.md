# Test cases

Written for the project report. These are the main cases, in the report's format. Each automated one is a real test: the **Automated by** line under each heading says where. The suite as a whole has many more, and the numbers are below.

"Actual" records the result of the run on 7 November 2026.

## Summary

| Kind                                                 | Tool                                           | Tests    | Result     |
| ---------------------------------------------------- | ---------------------------------------------- | -------- | ---------- |
| API and integration, including the permission matrix | Vitest with Supertest, on a throwaway Postgres | 952      | All passed |
| Shared calculations                                  | Vitest                                         | 67       | All passed |
| Web components                                       | Vitest with Testing Library                    | 47       | All passed |
| AI service                                           | pytest                                         | 59       | All passed |
| Browser journeys                                     | Playwright, on the production build            | 9        | All passed |
| Live AI services                                     | `pnpm ai:check`, against real Gemini           | 7 checks | All passed |

The API figure is made up of 221 routes checked as every role, 213 protected routes checked with no login, 112 row-level checks, and about 400 tests of behaviour. See [permissions.md](permissions.md).

Coverage: `apps/api/src/services` 91% of lines, against a target of 70%. `apps/ai` 97%, against a target of 70%. Run `pnpm coverage`, or `pytest --cov` in `apps/ai`.

## Login and sessions

Automated by `apps/api/test/auth.test.ts` and `security.test.ts`.

| ID         | Module   | Description                                    | Steps                                                     | Expected                                                            | Actual      | Status |
| ---------- | -------- | ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | ----------- | ------ |
| TC-AUTH-01 | Auth     | Log in with a correct password                 | Send a correct email and password                         | 200, with the user and an access token, and no password hash        | As expected | Pass   |
| TC-AUTH-02 | Auth     | Wrong password and unknown email look the same | Log in with a wrong password, then an unknown email       | Both give a 401 with the same message                               | As expected | Pass   |
| TC-AUTH-03 | Auth     | Deactivated account                            | Log in to a deactivated account                           | 401                                                                 | As expected | Pass   |
| TC-AUTH-04 | Auth     | Login rate limit                               | Fail 6 times for one address and email                    | The 6th gets a 429, and other emails are unaffected                 | As expected | Pass   |
| TC-AUTH-05 | Auth     | Account lockout                                | Fail 10 times, then use the right password                | Refused while locked, and works after 15 minutes                    | As expected | Pass   |
| TC-AUTH-06 | Auth     | Refresh token rotates                          | Refresh with a valid cookie                               | A new token, and the old one no longer works                        | As expected | Pass   |
| TC-AUTH-07 | Auth     | A reused refresh token                         | Use a retired token again                                 | All that user's sessions end                                        | As expected | Pass   |
| TC-AUTH-08 | Auth     | Logout                                         | Log out, then try to refresh                              | 401                                                                 | As expected | Pass   |
| TC-AUTH-09 | Auth     | Password rule                                  | Change to `short`, `Password123` and others               | 400 for each                                                        | As expected | Pass   |
| TC-AUTH-10 | Auth     | Change password                                | Change it with the correct current password               | Works, and other sessions end                                       | As expected | Pass   |
| TC-AUTH-11 | Security | CSRF on the refresh route                      | Refresh without the site header, then from another origin | 403 for both                                                        | As expected | Pass   |
| TC-AUTH-12 | Security | Refresh cookie flags                           | Inspect the cookie after login                            | `HttpOnly`, `SameSite=Strict`, limited path, `Secure` in production | As expected | Pass   |

## Permissions

Automated by `apps/api/test/permissions.test.ts`.

| ID         | Module | Description               | Steps                                                                             | Expected                                  | Actual      | Status |
| ---------- | ------ | ------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- | ----------- | ------ |
| TC-PERM-01 | Access | Every route is documented | Compare the routers with `docs/permissions.md`                                    | The same list, with none missing or extra | As expected | Pass   |
| TC-PERM-02 | Access | Every role on every route | Make a real request for each of 221 routes as each of 7 roles                     | The result matches the table              | As expected | Pass   |
| TC-PERM-03 | Access | No login                  | Call every protected route with no token                                          | 401                                       | As expected | Pass   |
| TC-PERM-04 | Access | Another class's records   | For every `own` cell, use a real record from another class                        | 403 or 404                                | As expected | Pass   |
| TC-PERM-05 | Access | A classmate's records     | As a student and parent, use a classmate's invoice, payment, submission or result | 403 or 404                                | As expected | Pass   |
| TC-PERM-06 | Access | Your own records          | For every `own` cell, use a record of your own                                    | Allowed                                   | As expected | Pass   |
| TC-PERM-07 | Access | Lists only show your own  | List invoices, payments, notifications and others                                 | Only your records appear                  | As expected | Pass   |
| TC-PERM-08 | Access | A list cannot be widened  | Ask for `?studentId=` of someone else                                             | Their records do not appear               | As expected | Pass   |

## Academic structure and people

Automated by `apps/api/test/academic.test.ts` and `students-import.test.ts`.

| ID         | Module   | Description                    | Steps                                                                    | Expected                                                | Actual      | Status |
| ---------- | -------- | ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------- | ----------- | ------ |
| TC-ACAD-01 | Academic | Build the whole chain          | Create department, program, year, semester, section, course and offering | Each is created and linked                              | As expected | Pass   |
| TC-ACAD-02 | Academic | Duplicate code                 | Create a second department with the same code                            | 409                                                     | As expected | Pass   |
| TC-ACAD-03 | Academic | Delete something in use        | Delete a department with programs                                        | 409                                                     | As expected | Pass   |
| TC-ACAD-04 | Academic | Only one current year          | Mark a second year as current                                            | The first stops being current                           | As expected | Pass   |
| TC-ACAD-05 | Academic | Offering in the wrong semester | Offer a course to a section of another semester                          | Refused                                                 | As expected | Pass   |
| TC-ACAD-06 | Academic | Pagination                     | List with no size, then with 1000                                        | Default of 20, maximum of 100                           | As expected | Pass   |
| TC-PEOP-01 | People   | Create a teacher               | Create one as an admin                                                   | A login with a temporary password, and a profile        | As expected | Pass   |
| TC-PEOP-02 | People   | Failure leaves nothing behind  | Make the profile fail after the login is created                         | The login is rolled back                                | As expected | Pass   |
| TC-PEOP-03 | People   | Import a clean CSV             | Upload a valid file                                                      | Logins, profiles and enrollments created                | As expected | Pass   |
| TC-PEOP-04 | People   | Import with an error           | Upload a file with one bad row                                           | Nothing is imported, and the row and field are reported | As expected | Pass   |
| TC-PEOP-05 | People   | Import a binary file           | Upload a program named `.csv`                                            | 400                                                     | As expected | Pass   |

## Attendance

Automated by `apps/api/test/attendance.test.ts` and `apps/web/e2e/journeys.spec.ts`.

| ID        | Module     | Description                           | Steps                                              | Expected                                                              | Actual      | Status |
| --------- | ---------- | ------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- | ----------- | ------ |
| TC-ATT-01 | Attendance | Take attendance for your own class    | Submit a session as its teacher                    | Saved                                                                 | As expected | Pass   |
| TC-ATT-02 | Attendance | Another teacher's class               | Submit one as a different teacher                  | 403                                                                   | As expected | Pass   |
| TC-ATT-03 | Attendance | Same class, date and period twice     | Submit a second session                            | Refused                                                               | As expected | Pass   |
| TC-ATT-04 | Attendance | A student not in the section          | Include them in the records                        | Refused                                                               | As expected | Pass   |
| TC-ATT-05 | Attendance | Audit log                             | Edit a session                                     | A row with the before and after values                                | As expected | Pass   |
| TC-ATT-06 | Attendance | Edit window                           | Edit after 48 hours as a teacher, then as an admin | The teacher is refused and the admin is not                           | As expected | Pass   |
| TC-ATT-07 | Attendance | How the percentage is worked out      | Mix of present, late, absent and excused           | Late counts as present, excused is left out, and below 75% is flagged | As expected | Pass   |
| TC-ATT-08 | Attendance | Low attendance warning                | Fall below 75%                                     | The student and parent are told once, not after every class           | As expected | Pass   |
| TC-ATT-09 | Journey    | Teacher takes attendance in a browser | Choose a class, mark someone absent, save, reload  | "Attendance saved", and still there after reloading                   | As expected | Pass   |

## Timetable, exams and results

Automated by `apps/api/test/academics.test.ts` and `apps/web/e2e/journeys.spec.ts`.

| ID         | Module    | Description                   | Steps                                            | Expected                          | Actual      | Status |
| ---------- | --------- | ----------------------------- | ------------------------------------------------ | --------------------------------- | ----------- | ------ |
| TC-TIME-01 | Timetable | Teacher clash                 | Book a teacher twice in one period               | 409 naming the clash              | As expected | Pass   |
| TC-TIME-02 | Timetable | Room clash across programs    | Book one room for two programs in one period     | 409                               | As expected | Pass   |
| TC-EXAM-01 | Exams     | Only the teacher enters marks | Enter marks as a student, and as another teacher | 403                               | As expected | Pass   |
| TC-EXAM-02 | Exams     | Marks or absent               | Save with neither                                | 400                               | As expected | Pass   |
| TC-EXAM-03 | Exams     | Audit log for marks           | Change a mark                                    | A row for each change             | As expected | Pass   |
| TC-EXAM-04 | Exams     | Publishing locks marks        | Publish, then try to change a mark               | Refused                           | As expected | Pass   |
| TC-EXAM-05 | Exams     | Marks missing                 | Publish with a mark missing                      | Refused                           | As expected | Pass   |
| TC-EXAM-06 | Results   | A second exam                 | Publish a final after an internal                | Both combine into the same result | As expected | Pass   |
| TC-EXAM-07 | Results   | GPA and CGPA                  | Compare the API, marksheet and transcript        | The same figures                  | As expected | Pass   |
| TC-EXAM-08 | Journey   | Publish, then the marksheet   | Publish as an admin, then download as a student  | A real PDF                        | As expected | Pass   |

## Assignments and notices

Automated by `apps/api/test/academics.test.ts`, `notifications.test.ts` and `security.test.ts`.

| ID        | Module        | Description              | Steps                                         | Expected                                             | Actual      | Status |
| --------- | ------------- | ------------------------ | --------------------------------------------- | ---------------------------------------------------- | ----------- | ------ |
| TC-ASG-01 | Assignments   | Teacher's own class only | Create one for another teacher's class        | Refused                                              | As expected | Pass   |
| TC-ASG-02 | Assignments   | Late work                | Submit after the deadline, with late work off | Refused                                              | As expected | Pass   |
| TC-ASG-03 | Files         | Size limit               | Upload a file over 10 MB                      | 400                                                  | As expected | Pass   |
| TC-ASG-04 | Files         | Type by content          | Upload a program named `notes.pdf`            | 400                                                  | As expected | Pass   |
| TC-ASG-05 | Files         | Who can download         | Download as someone with no access            | Refused                                              | As expected | Pass   |
| TC-ASG-06 | Files         | Random names             | Upload `../../evil.pdf`                       | Stored under a random id, shown as `evil.pdf`        | As expected | Pass   |
| TC-NOT-01 | Notices       | Audience                 | Post a section notice                         | Only that audience sees it, and others get a 404     | As expected | Pass   |
| TC-NOT-02 | Notices       | Teacher's own sections   | Target a section they do not teach            | Refused                                              | As expected | Pass   |
| TC-NOT-03 | Notifications | Live delivery            | Trigger one while connected                   | It reaches the right person at once, and nobody else | As expected | Pass   |
| TC-NOT-04 | Notifications | Preferences              | Turn email off                                | The in-app one still arrives                         | As expected | Pass   |
| TC-NOT-05 | Notifications | Someone else's           | Mark another person's as read                 | It stays unread                                      | As expected | Pass   |

## Fees and payments

Automated by `apps/api/test/finance.test.ts` and `apps/web/e2e/journeys.spec.ts`.

| ID        | Module   | Description                    | Steps                                               | Expected                                          | Actual                          | Status |
| --------- | -------- | ------------------------------ | --------------------------------------------------- | ------------------------------------------------- | ------------------------------- | ------ |
| TC-FIN-01 | Fees     | Rupees to paisa                | Enter an amount in rupees                           | Stored as whole paisa                             | As expected                     | Pass   |
| TC-FIN-02 | Fees     | Generate invoices twice        | Run generation again                                | Creates nothing new                               | As expected                     | Pass   |
| TC-FIN-03 | Fees     | Fines                          | Run the daily job twice                             | The same amount each time                         | As expected                     | Pass   |
| TC-FIN-04 | Fees     | Discount                       | Give a discount with no reason                      | Refused, and logged when given                    | As expected                     | Pass   |
| TC-PAY-01 | Payments | Successful eSewa payment       | Callback, with the gateway confirming               | Paid, credited, with a receipt and a notification | As expected                     | Pass   |
| TC-PAY-02 | Payments | Forged callback                | Callback with garbage                               | Not marked as paid                                | As expected                     | Pass   |
| TC-PAY-03 | Payments | Wrong amount                   | Gateway reports a different amount                  | Not marked as paid, and logged                    | As expected                     | Pass   |
| TC-PAY-04 | Payments | Two callbacks at once          | Send both at the same moment                        | Credited once                                     | As expected                     | Pass   |
| TC-PAY-05 | Payments | Status in the redirect         | Khalti redirect says Completed, its lookup says not | Not marked as paid                                | As expected                     | Pass   |
| TC-PAY-06 | Payments | Customer never returns         | Run the reconcile job                               | The payment completes                             | As expected                     | Pass   |
| TC-PAY-07 | Payments | Someone else's receipt         | Download another student's                          | 403                                               | As expected                     | Pass   |
| TC-PAY-08 | Journey  | Pay through a stand-in gateway | Pay now, Khalti, back to the site, download         | "Payment successful", and a real PDF              | As expected                     | Pass   |
| TC-PAY-09 | Manual   | Real Khalti sandbox            | Pay the Rs. 150 fine with a test wallet             | Paid, with a receipt                              | As expected, on 7 November 2026 | Pass   |

## AI features

Automated by `apps/api/test/assistant.test.ts`, `ai-features.test.ts`, `apps/ai/tests` and `apps/web/e2e/journeys.spec.ts`.

| ID         | Module              | Description                         | Steps                                                                   | Expected                                                                            | Actual            | Status |
| ---------- | ------------------- | ----------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------- | ------ |
| TC-AI-01   | Assistant           | Tools by role                       | List the tools offered to each role                                     | Students never get teacher tools                                                    | As expected       | Pass   |
| TC-AI-02   | Assistant           | No tool takes a student id          | Inspect every tool's parameters                                         | None do                                                                             | As expected       | Pass   |
| TC-AI-03   | Assistant           | Asking about someone else           | Model asks with another student's name                                  | Only the caller's own record comes back                                             | As expected       | Pass   |
| TC-AI-04   | Assistant           | Tool loop                           | Model keeps asking for tools                                            | Stops after 5 rounds                                                                | As expected       | Pass   |
| TC-AI-05   | Assistant           | Message limit                       | Send a 31st message in an hour                                          | Refused before calling Gemini                                                       | As expected       | Pass   |
| TC-AI-06   | Assistant           | Text trying to escape its data tags | Tool result contains `</data>`                                          | Escaped, and still readable as data                                                 | As expected       | Pass   |
| TC-AI-07   | Journey             | Ask about attendance in a browser   | Student asks, with a stand-in model                                     | Their own real figures, as on the attendance page                                   | As expected       | Pass   |
| TC-AI-08   | Manual              | Real Gemini                         | `pnpm ai:check`                                                         | Tool calling, continuing, streaming, usage, embeddings, quiz                        | All OK            | Pass   |
| TC-AI-09   | Manual              | Real tool lists on Gemini           | The demo's questions, as each role                                      | The right tool chosen, and refusals for other people's data and off-topic questions | As expected       | Pass   |
| TC-AI-10   | Manual              | Real meaning-based search on Neon   | Store a real embedding and search, in a transaction that is rolled back | 768 dimensions, and related question scores above an unrelated one                  | 0.62 against 0.47 | Pass   |
| TC-RISK-01 | At-risk             | Target recall                       | Train the model                                                         | Recall of at least 0.75 on the test split                                           | 0.83              | Pass   |
| TC-RISK-02 | At-risk             | Students see no label               | Call `/risk` as a student                                               | 403                                                                                 | As expected       | Pass   |
| TC-RISK-03 | At-risk             | Teachers see only their classes     | List as a teacher                                                       | Only their classes                                                                  | As expected       | Pass   |
| TC-RISK-04 | At-risk             | Reasons                             | A strong score and a weak one                                           | Only real concerns become reasons                                                   | As expected       | Pass   |
| TC-QUIZ-01 | Quiz                | Answer must fit the question        | Model's answer is not among the options                                 | Rejected and retried once, with the reason                                          | As expected       | Pass   |
| TC-QUIZ-02 | Quiz                | Publishing needs approval           | Publish with a question unapproved                                      | Refused                                                                             | As expected       | Pass   |
| TC-QUIZ-03 | Quiz                | Answers stay hidden                 | Open a quiz as a student                                                | The answers are not in the response                                                 | As expected       | Pass   |
| TC-QUIZ-04 | Quiz                | One attempt                         | Submit twice                                                            | The second is refused                                                               | As expected       | Pass   |
| TC-QUIZ-05 | Quiz                | Notes closing their own block       | Notes contain `</notes>`                                                | Neutralised before reaching the model                                               | As expected       | Pass   |
| TC-GEN-01  | Timetable generator | Hard rules                          | Solve the demo semester                                                 | No clashes, confirmed by a separate check                                           | As expected       | Pass   |
| TC-GEN-02  | Timetable generator | Impossible request                  | Teacher unavailable for almost every period                             | Explained in plain words                                                            | As expected       | Pass   |
| TC-GEN-03  | Timetable generator | Service down                        | Generate with the AI service off                                        | A clear message, and it is logged                                                   | As expected       | Pass   |

## Security and reliability

Automated by `apps/api/test/security.test.ts`, `rate-limits.test.ts`, `storage.test.ts` and `src/config/env.test.ts`.

| ID        | Module     | Description             | Steps                                                                       | Expected                                                          | Actual      | Status |
| --------- | ---------- | ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------- | ------ |
| TC-SEC-01 | Headers    | Helmet                  | Read the response headers                                                   | Security headers present, and `X-Powered-By` gone                 | As expected | Pass   |
| TC-SEC-02 | CORS       | Other origins           | Send a request from another origin                                          | Not allowed                                                       | As expected | Pass   |
| TC-SEC-03 | Rate limit | Payments and AI         | Exceed each limit                                                           | 429, in the usual error shape, for that person only               | As expected | Pass   |
| TC-SEC-04 | Config     | Bad production settings | Start with a placeholder secret, and no HTTPS                               | Refuses, listing every problem                                    | As expected | Pass   |
| TC-SEC-05 | Headers    | Content Security Policy | Open the main pages on the production build                                 | No violations and no page errors                                  | As expected | Pass   |
| TC-REL-01 | Health     | Database check          | Call `/health`                                                              | `{"status":"ok","database":"ok"}`                                 | As expected | Pass   |
| TC-REL-02 | Logging    | Request id              | Make a request                                                              | An id in the response, and on an error a matching one in the body | As expected | Pass   |
| TC-REL-03 | Storage    | S3 driver               | Save, read, send and remove through the real SDK against a stand-in service | All work, and files are sent as downloads                         | As expected | Pass   |
| TC-REL-04 | Build      | Production build        | Start the compiled API, log in and make a PDF                               | All work                                                          | As expected | Pass   |
