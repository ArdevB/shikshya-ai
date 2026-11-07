# Permissions

Who may call each API route. `apps/api/test/permissions.test.ts` makes a real request for every route as every role and fails if the result differs from this table. It also fails if a route exists that is not listed here.

| Cell | Meaning |
| --- | --- |
| `yes` | The role may use this route. Some of these show each person only their own data, which the route does by itself: `/notifications` is always the caller's own, for example. |
| `own` | The role may use this route, but only on records that belong to them. Asking for anyone else's gets a 403 or 404. The test tries this for every `own` cell, with a real record from another class and, for personal records, a classmate's. |
| `no` | The role gets a 403. |
| `public` | No login is needed. The route protects itself another way, explained below. |

Without a login, every route except the `public` ones gets a 401, which the test also checks.

"Belongs to them" means:

- A student's own records, and those of classes they are enrolled in.
- A parent's linked children, and those children's classes.
- A teacher's own classes, and the students enrolled in those classes.

## Public routes

| Route | What protects it |
| --- | --- |
| `POST /auth/login` | Limited to 5 failures per 15 minutes per address and email, then account lockout. |
| `POST /auth/refresh`, `POST /auth/logout` | The refresh cookie, with CSRF protection. |
| `GET /payments/callback/*` | The gateway is asked directly whether a payment succeeded, so a forged callback changes nothing. |
| `GET /public/verify-student/:id/:token` | A signed token, printed as a QR code on the ID card. |

## Every route

<!-- table -->

| Method | Path | SUPER_ADMIN | ADMIN | TEACHER | STUDENT | PARENT | ACCOUNTANT | LIBRARIAN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/auth/login` | public | public | public | public | public | public | public |
| `POST` | `/auth/refresh` | public | public | public | public | public | public | public |
| `POST` | `/auth/logout` | public | public | public | public | public | public | public |
| `GET` | `/auth/me` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/auth/change-password` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/payments/callback/esewa` | public | public | public | public | public | public | public |
| `GET` | `/payments/callback/khalti` | public | public | public | public | public | public | public |
| `GET` | `/payments/callback/esewa/failed/:paymentId` | public | public | public | public | public | public | public |
| `GET` | `/payments/callback/khalti/failed/:paymentId` | public | public | public | public | public | public | public |
| `GET` | `/public/verify-student/:id/:token` | public | public | public | public | public | public | public |
| `GET` | `/departments` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/departments/:id` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/departments` | yes | yes | no | no | no | no | no |
| `PUT` | `/departments/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/departments/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/programs` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/programs/:id` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/programs` | yes | yes | no | no | no | no | no |
| `PUT` | `/programs/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/programs/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/academic-years` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/academic-years/:id` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/academic-years` | yes | yes | no | no | no | no | no |
| `PUT` | `/academic-years/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/academic-years/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/semesters` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/semesters/:id` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/semesters` | yes | yes | no | no | no | no | no |
| `PUT` | `/semesters/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/semesters/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/sections` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/sections/:id` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/sections` | yes | yes | no | no | no | no | no |
| `PUT` | `/sections/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/sections/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/courses` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/courses/:id` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/courses` | yes | yes | no | no | no | no | no |
| `PUT` | `/courses/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/courses/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/course-offerings` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/course-offerings/:id` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/course-offerings` | yes | yes | no | no | no | no | no |
| `PUT` | `/course-offerings/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/course-offerings/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/teachers` | yes | yes | no | no | no | no | no |
| `GET` | `/teachers/:id` | yes | yes | no | no | no | no | no |
| `POST` | `/teachers` | yes | yes | no | no | no | no | no |
| `PUT` | `/teachers/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/teachers/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/students/:id/attendance-summary` | yes | yes | own | own | own | no | no |
| `GET` | `/students/:id/results` | yes | yes | own | own | own | no | no |
| `GET` | `/students/:id/timetable` | yes | yes | own | own | own | no | no |
| `GET` | `/students/:id/assignments` | yes | yes | own | own | own | no | no |
| `GET` | `/students/:id/materials` | yes | yes | own | own | own | no | no |
| `PUT` | `/students/:id/photo` | yes | yes | no | no | no | no | no |
| `GET` | `/students` | yes | yes | no | no | no | no | no |
| `POST` | `/students` | yes | yes | no | no | no | no | no |
| `POST` | `/students/import` | yes | yes | no | no | no | no | no |
| `GET` | `/students/:id` | yes | yes | no | no | no | no | no |
| `PUT` | `/students/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/students/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/parents/me/children` | no | no | no | no | yes | no | no |
| `GET` | `/parents` | yes | yes | no | no | no | no | no |
| `GET` | `/parents/:id` | yes | yes | no | no | no | no | no |
| `POST` | `/parents` | yes | yes | no | no | no | no | no |
| `PUT` | `/parents/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/parents/:id` | yes | yes | no | no | no | no | no |
| `POST` | `/parents/:id/students` | yes | yes | no | no | no | no | no |
| `DELETE` | `/parents/:id/students/:studentId` | yes | yes | no | no | no | no | no |
| `POST` | `/attendance/sessions` | no | no | own | no | no | no | no |
| `PUT` | `/attendance/sessions/:id` | yes | yes | own | no | no | no | no |
| `GET` | `/attendance/sessions` | yes | yes | yes | no | no | no | no |
| `GET` | `/attendance/sessions/:id` | yes | yes | own | no | no | no | no |
| `GET` | `/offerings/:id/attendance-report` | yes | yes | own | no | no | no | no |
| `GET` | `/offerings/:id/roster` | yes | yes | own | no | no | no | no |
| `GET` | `/stats/overview` | yes | yes | no | no | no | no | no |
| `GET` | `/rooms` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/rooms/:id` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/rooms` | yes | yes | no | no | no | no | no |
| `PUT` | `/rooms/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/rooms/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/time-slots` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/time-slots/:id` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/time-slots` | yes | yes | no | no | no | no | no |
| `PUT` | `/time-slots/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/time-slots/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/timetable` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/timetable/entries` | yes | yes | no | no | no | no | no |
| `DELETE` | `/timetable/entries/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/exams` | yes | yes | yes | no | no | no | no |
| `GET` | `/exams/:id` | yes | yes | yes | no | no | no | no |
| `POST` | `/exams` | yes | yes | no | no | no | no | no |
| `PUT` | `/exams/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/exams/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/exams/:id/subjects` | yes | yes | no | no | no | no | no |
| `POST` | `/exams/:id/subjects` | yes | yes | no | no | no | no | no |
| `POST` | `/exams/:id/publish` | yes | yes | no | no | no | no | no |
| `POST` | `/exams/:id/unlock` | yes | yes | no | no | no | no | no |
| `GET` | `/exam-subjects/mine` | no | no | yes | no | no | no | no |
| `PUT` | `/exam-subjects/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/exam-subjects/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/exam-subjects/:id/marks` | yes | yes | own | no | no | no | no |
| `PUT` | `/exam-subjects/:id/marks/:studentId` | no | no | own | no | no | no | no |
| `GET` | `/sections/:id/results` | yes | yes | own | no | no | no | no |
| `GET` | `/assignments` | yes | yes | yes | no | no | no | no |
| `POST` | `/assignments` | no | no | own | no | no | no | no |
| `PUT` | `/assignments/:id` | no | no | own | no | no | no | no |
| `DELETE` | `/assignments/:id` | no | no | own | no | no | no | no |
| `GET` | `/assignments/:id/submissions` | yes | yes | own | no | no | no | no |
| `POST` | `/assignments/:id/submission` | no | no | no | own | no | no | no |
| `GET` | `/assignments/:id/files/:fileId` | yes | yes | own | own | own | no | no |
| `PUT` | `/submissions/:id/grade` | no | no | own | no | no | no | no |
| `GET` | `/submissions/:id/files/:fileId` | yes | yes | own | own | own | no | no |
| `GET` | `/materials` | yes | yes | yes | no | no | no | no |
| `POST` | `/materials` | no | no | own | no | no | no | no |
| `DELETE` | `/materials/:id` | no | no | own | no | no | no | no |
| `GET` | `/materials/:id/files/:fileId` | yes | yes | own | own | own | no | no |
| `GET` | `/notices` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/notices/unread-count` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/notices/:id` | yes | yes | own | own | own | own | own |
| `POST` | `/notices/:id/read` | yes | yes | own | own | own | own | own |
| `POST` | `/notices` | yes | yes | own | no | no | no | no |
| `PUT` | `/notices/:id` | yes | yes | own | no | no | no | no |
| `DELETE` | `/notices/:id` | yes | yes | own | no | no | no | no |
| `GET` | `/events` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/events` | yes | yes | no | no | no | no | no |
| `PUT` | `/events/:id` | yes | yes | no | no | no | no | no |
| `DELETE` | `/events/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/dashboard/admin/students-by-program` | yes | yes | no | no | no | no | no |
| `GET` | `/dashboard/admin/attendance-today` | yes | yes | no | no | no | no | no |
| `GET` | `/dashboard/admin/low-attendance` | yes | yes | no | no | no | no | no |
| `GET` | `/dashboard/admin/upcoming-exams` | yes | yes | no | no | no | no | no |
| `GET` | `/dashboard/admin/attendance-trend` | yes | yes | no | no | no | no | no |
| `GET` | `/dashboard/teacher/today-classes` | no | no | yes | no | no | no | no |
| `GET` | `/dashboard/teacher/pending-attendance` | no | no | yes | no | no | no | no |
| `GET` | `/dashboard/teacher/ungraded-submissions` | no | no | yes | no | no | no | no |
| `GET` | `/dashboard/teacher/low-attendance` | no | no | yes | no | no | no | no |
| `GET` | `/dashboard/students/:id/today` | yes | yes | own | own | own | no | no |
| `GET` | `/dashboard/students/:id/deadlines` | yes | yes | own | own | own | no | no |
| `GET` | `/dashboard/students/:id/latest-result` | yes | yes | own | own | own | no | no |
| `GET` | `/dashboard/recent-notices` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/fee-heads` | yes | yes | no | no | no | yes | no |
| `GET` | `/fee-heads/:id` | yes | yes | no | no | no | yes | no |
| `POST` | `/fee-heads` | yes | yes | no | no | no | yes | no |
| `PUT` | `/fee-heads/:id` | yes | yes | no | no | no | yes | no |
| `DELETE` | `/fee-heads/:id` | yes | yes | no | no | no | yes | no |
| `GET` | `/fee-structures` | yes | yes | no | no | no | yes | no |
| `GET` | `/fee-structures/:id` | yes | yes | no | no | no | yes | no |
| `POST` | `/fee-structures` | yes | yes | no | no | no | yes | no |
| `PUT` | `/fee-structures/:id` | yes | yes | no | no | no | yes | no |
| `DELETE` | `/fee-structures/:id` | yes | yes | no | no | no | yes | no |
| `GET` | `/fine-rules` | yes | yes | no | no | no | yes | no |
| `GET` | `/fine-rules/:id` | yes | yes | no | no | no | yes | no |
| `POST` | `/fine-rules` | yes | yes | no | no | no | yes | no |
| `PUT` | `/fine-rules/:id` | yes | yes | no | no | no | yes | no |
| `DELETE` | `/fine-rules/:id` | yes | yes | no | no | no | yes | no |
| `GET` | `/invoices` | yes | yes | no | yes | yes | yes | no |
| `POST` | `/invoices/generate` | yes | yes | no | no | no | yes | no |
| `POST` | `/invoices` | yes | yes | no | no | no | yes | no |
| `GET` | `/invoices/:id` | yes | yes | no | own | own | yes | no |
| `POST` | `/invoices/:id/discount` | yes | yes | no | no | no | yes | no |
| `POST` | `/invoices/:id/cancel` | yes | yes | no | no | no | yes | no |
| `GET` | `/payments/gateways` | yes | yes | no | yes | yes | yes | no |
| `POST` | `/payments/initiate` | no | no | no | own | own | no | no |
| `POST` | `/payments/manual` | yes | yes | no | no | no | yes | no |
| `GET` | `/payments` | yes | yes | no | yes | yes | yes | no |
| `GET` | `/payments/:id` | yes | yes | no | own | own | yes | no |
| `POST` | `/payments/:id/refresh` | yes | yes | no | own | own | yes | no |
| `GET` | `/finance/outstanding.csv` | yes | yes | no | no | no | yes | no |
| `GET` | `/finance/collections-summary` | yes | yes | no | no | no | yes | no |
| `GET` | `/finance/outstanding-by-program` | yes | yes | no | no | no | yes | no |
| `GET` | `/finance/collections-trend` | yes | yes | no | no | no | yes | no |
| `GET` | `/pdf/receipt/:paymentId` | yes | yes | no | own | own | yes | no |
| `GET` | `/pdf/invoice/:invoiceId` | yes | yes | no | own | own | yes | no |
| `GET` | `/pdf/marksheet/:studentId/:semesterId` | yes | yes | own | own | own | no | no |
| `GET` | `/pdf/transcript/:studentId` | yes | yes | own | own | own | no | no |
| `GET` | `/pdf/id-card/:studentId` | yes | yes | own | own | own | no | no |
| `GET` | `/settings/institution` | yes | yes | yes | yes | yes | yes | yes |
| `PUT` | `/settings/institution` | yes | no | no | no | no | no | no |
| `GET` | `/notifications` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/notifications/unread-count` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/notifications/read-all` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/notifications/preferences` | yes | yes | yes | yes | yes | yes | yes |
| `PUT` | `/notifications/preferences` | yes | yes | yes | yes | yes | yes | yes |
| `POST` | `/notifications/:id/read` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/assistant/status` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/assistant/conversations` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/assistant/conversations/:id/messages` | own | own | own | own | own | own | own |
| `DELETE` | `/assistant/conversations/:id` | own | own | own | own | own | own | own |
| `POST` | `/assistant/messages` | yes | yes | yes | yes | yes | yes | yes |
| `GET` | `/policies` | yes | yes | no | no | no | no | no |
| `POST` | `/policies` | yes | yes | no | no | no | no | no |
| `POST` | `/policies/reindex` | yes | yes | no | no | no | no | no |
| `DELETE` | `/policies/:id` | yes | yes | no | no | no | no | no |
| `GET` | `/risk` | yes | yes | yes | no | no | no | no |
| `GET` | `/risk/summary` | yes | yes | no | no | no | no | no |
| `POST` | `/risk/recompute` | yes | yes | no | no | no | no | no |
| `POST` | `/risk/:id/review` | yes | yes | own | no | no | no | no |
| `GET` | `/quizzes/mine` | no | no | no | yes | no | no | no |
| `GET` | `/quizzes/mine/:id` | no | no | no | own | no | no | no |
| `POST` | `/quizzes/mine/:id/submit` | no | no | no | own | no | no | no |
| `GET` | `/quizzes` | yes | yes | yes | no | no | no | no |
| `POST` | `/quizzes/generate` | no | no | own | no | no | no | no |
| `POST` | `/quizzes/answers/:answerId/grade` | no | no | own | no | no | no | no |
| `GET` | `/quizzes/:id` | yes | yes | own | no | no | no | no |
| `PUT` | `/quizzes/:id` | no | no | own | no | no | no | no |
| `DELETE` | `/quizzes/:id` | no | no | own | no | no | no | no |
| `POST` | `/quizzes/:id/publish` | no | no | own | no | no | no | no |
| `GET` | `/quizzes/:id/attempts` | yes | yes | own | no | no | no | no |
| `PUT` | `/quizzes/:id/questions/:questionId` | no | no | own | no | no | no | no |
| `DELETE` | `/quizzes/:id/questions/:questionId` | no | no | own | no | no | no | no |
| `POST` | `/quizzes/:id/questions/:questionId/approve` | no | no | own | no | no | no | no |
| `POST` | `/quizzes/:id/questions/:questionId/unapprove` | no | no | own | no | no | no | no |
| `POST` | `/quizzes/:id/questions/:questionId/regenerate` | no | no | own | no | no | no | no |
| `GET` | `/timetable-generator/semesters/:semesterId/inputs` | yes | yes | no | no | no | no | no |
| `PUT` | `/timetable-generator/offerings/:id/periods` | yes | yes | no | no | no | no | no |
| `PUT` | `/timetable-generator/teachers/:id/unavailability` | yes | yes | no | no | no | no | no |
| `POST` | `/timetable-generator/generate` | yes | yes | no | no | no | no | no |
| `POST` | `/timetable-generator/check` | yes | yes | no | no | no | no | no |
| `POST` | `/timetable-generator/apply` | yes | yes | no | no | no | no | no |

<!-- /table -->
