# API reference

Generated from the code by `pnpm docs:generate`. Do not edit by hand: `apps/api/test/docs.test.ts` fails if this differs from the routes and schemas.

The routes come from the routers themselves, who may call them from [permissions.md](permissions.md), and the fields from the Zod schemas in `packages/shared`.

## How it works

- **Base address:** `/api/v1`. Requests and responses are JSON, except file uploads and downloads, and the assistant's reply, which arrives as server-sent events.
- **Logging in:** `POST /auth/login` returns an access token and sets a refresh cookie. Send the token as `Authorization: Bearer <token>`. It lasts 15 minutes, after which `POST /auth/refresh` gets a new one.
- **Cookie routes:** `/auth/refresh` and `/auth/logout` also need the header `X-Shikshya-Client: web`, as CSRF protection.
- **Errors:** always `{ "error": { "code", "message", "details"? } }`. Validation errors list each field in `details`.
- **Lists:** `?page=` and `?pageSize=`, with a default of 20 and a maximum of 100. The reply is `{ "data": [], "meta": { "page", "pageSize", "total", "totalPages" } }`. Lists that are small by nature, such as one class's students, come back whole.
- **Money:** whole paisa in storage and in `...Paisa` fields. The `amount` in a request is rupees.
- **"(own)"** means only records that belong to the caller. See [permissions.md](permissions.md) for exactly what that means.
- **Limits:** see [security.md](security.md). Going over one gets a 429.

## Login and sessions

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | No login | Body: `email` text, `password` text |
| `POST` | `/auth/refresh` | No login |  |
| `POST` | `/auth/logout` | No login |  |
| `GET` | `/auth/me` | Everyone logged in |  |
| `POST` | `/auth/change-password` | Everyone logged in | Body: `currentPassword` text, `newPassword` text |

## Academic structure

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/departments` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional) |
| `GET` | `/departments/:id` | Everyone logged in |  |
| `POST` | `/departments` | Super admin, Admin | Body: `name` text, `code` text |
| `PUT` | `/departments/:id` | Super admin, Admin | Body: `name` text, `code` text |
| `DELETE` | `/departments/:id` | Super admin, Admin |  |
| `GET` | `/programs` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional), `departmentId` text (optional) |
| `GET` | `/programs/:id` | Everyone logged in |  |
| `POST` | `/programs` | Super admin, Admin | Body: `departmentId` text, `name` text, `code` text, `durationSemesters` number, `gradingScheme` TU_GPA (optional) |
| `PUT` | `/programs/:id` | Super admin, Admin | Body: `departmentId` text, `name` text, `code` text, `durationSemesters` number, `gradingScheme` TU_GPA (optional) |
| `DELETE` | `/programs/:id` | Super admin, Admin |  |
| `GET` | `/academic-years` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional) |
| `GET` | `/academic-years/:id` | Everyone logged in |  |
| `POST` | `/academic-years` | Super admin, Admin | Body: `name` text, `startDate` text, `endDate` text, `isCurrent` true or false (optional) |
| `PUT` | `/academic-years/:id` | Super admin, Admin | Body: `name` text, `startDate` text, `endDate` text, `isCurrent` true or false (optional) |
| `DELETE` | `/academic-years/:id` | Super admin, Admin |  |
| `GET` | `/semesters` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional), `programId` text (optional), `academicYearId` text (optional) |
| `GET` | `/semesters/:id` | Everyone logged in |  |
| `POST` | `/semesters` | Super admin, Admin | Body: `programId` text, `academicYearId` text, `number` number, `startDate` text, `endDate` text |
| `PUT` | `/semesters/:id` | Super admin, Admin | Body: `programId` text, `academicYearId` text, `number` number, `startDate` text, `endDate` text |
| `DELETE` | `/semesters/:id` | Super admin, Admin |  |
| `GET` | `/sections` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional), `semesterId` text (optional), `programId` text (optional) |
| `GET` | `/sections/:id` | Everyone logged in |  |
| `POST` | `/sections` | Super admin, Admin | Body: `semesterId` text, `name` text |
| `PUT` | `/sections/:id` | Super admin, Admin | Body: `semesterId` text, `name` text |
| `DELETE` | `/sections/:id` | Super admin, Admin |  |
| `GET` | `/courses` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional), `programId` text (optional), `semesterNumber` number (optional) |
| `GET` | `/courses/:id` | Everyone logged in |  |
| `POST` | `/courses` | Super admin, Admin | Body: `programId` text, `code` text, `title` text, `creditHours` number, `semesterNumber` number, `hasPractical` true or false (optional) |
| `PUT` | `/courses/:id` | Super admin, Admin | Body: `programId` text, `code` text, `title` text, `creditHours` number, `semesterNumber` number, `hasPractical` true or false (optional) |
| `DELETE` | `/courses/:id` | Super admin, Admin |  |
| `GET` | `/course-offerings` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional), `sectionId` text (optional), `teacherId` text (optional), `courseId` text (optional) |
| `GET` | `/course-offerings/:id` | Everyone logged in |  |
| `POST` | `/course-offerings` | Super admin, Admin | Body: `courseId` text, `sectionId` text, `teacherId` text |
| `PUT` | `/course-offerings/:id` | Super admin, Admin | Body: `courseId` text, `sectionId` text, `teacherId` text |
| `DELETE` | `/course-offerings/:id` | Super admin, Admin |  |

## People

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/teachers` | Super admin, Admin | Query: `page` number (optional), `pageSize` number (optional), `departmentId` text (optional), `search` text (optional) |
| `GET` | `/teachers/:id` | Super admin, Admin |  |
| `POST` | `/teachers` | Super admin, Admin | Body: `email` text, `firstName` text, `lastName` text, `phone` text or value (optional), `employeeCode` text, `departmentId` text, `designation` text |
| `PUT` | `/teachers/:id` | Super admin, Admin | Body: `email` text (optional), `firstName` text (optional), `lastName` text (optional), `phone` text or value (optional), `employeeCode` text (optional), `departmentId` text (optional), `designation` text (optional), `isActive` true or false (optional) |
| `DELETE` | `/teachers/:id` | Super admin, Admin |  |
| `PUT` | `/students/:id/photo` | Super admin, Admin | Body: `photoDataUrl` text |
| `GET` | `/students` | Super admin, Admin | Query: `page` number (optional), `pageSize` number (optional), `programId` text (optional), `sectionId` text (optional), `search` text (optional) |
| `POST` | `/students` | Super admin, Admin | Body: `email` text, `firstName` text, `lastName` text, `phone` text or value (optional), `rollNumber` text, `registrationNumber` text (optional), `programId` text, `currentSectionId` text, `admissionDate` text, `dateOfBirth` text or value (optional), `address` text (optional), `guardianName` text (optional), `guardianPhone` text or value (optional) |
| `POST` | `/students/import` | Super admin, Admin |  |
| `GET` | `/students/:id` | Super admin, Admin |  |
| `PUT` | `/students/:id` | Super admin, Admin | Body: `email` text (optional), `firstName` text (optional), `lastName` text (optional), `phone` text or value (optional), `rollNumber` text (optional), `registrationNumber` text (optional), `programId` text (optional), `currentSectionId` text (optional), `admissionDate` text (optional), `dateOfBirth` text or value (optional), `address` text (optional), `guardianName` text (optional), `guardianPhone` text or value (optional), `isActive` true or false (optional) |
| `DELETE` | `/students/:id` | Super admin, Admin |  |
| `GET` | `/parents/me/children` | Parent |  |
| `GET` | `/parents` | Super admin, Admin | Query: `page` number (optional), `pageSize` number (optional), `search` text (optional) |
| `GET` | `/parents/:id` | Super admin, Admin |  |
| `POST` | `/parents` | Super admin, Admin | Body: `email` text, `firstName` text, `lastName` text, `phone` text or value (optional) |
| `PUT` | `/parents/:id` | Super admin, Admin | Body: `email` text (optional), `firstName` text (optional), `lastName` text (optional), `phone` text or value (optional), `isActive` true or false (optional) |
| `DELETE` | `/parents/:id` | Super admin, Admin |  |
| `POST` | `/parents/:id/students` | Super admin, Admin | Body: `studentId` text, `relation` text |
| `DELETE` | `/parents/:id/students/:studentId` | Super admin, Admin |  |

## Attendance

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/students/:id/attendance-summary` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `POST` | `/attendance/sessions` | Teacher (own) | Body: `offeringId` text, `date` text, `period` number (optional), `records` list of object |
| `PUT` | `/attendance/sessions/:id` | Super admin, Admin, Teacher (own) | Body: `records` list of object |
| `GET` | `/attendance/sessions` | Super admin, Admin, Teacher | Query: `page` number (optional), `pageSize` number (optional), `offeringId` text (optional), `from` text (optional), `to` text (optional) |
| `GET` | `/attendance/sessions/:id` | Super admin, Admin, Teacher (own) |  |
| `GET` | `/offerings/:id/attendance-report` | Super admin, Admin, Teacher (own) |  |
| `GET` | `/offerings/:id/roster` | Super admin, Admin, Teacher (own) |  |

## Timetable and rooms

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/students/:id/timetable` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/rooms` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional) |
| `GET` | `/rooms/:id` | Everyone logged in |  |
| `POST` | `/rooms` | Super admin, Admin | Body: `name` text, `capacity` number, `type` CLASSROOM \| LAB \| HALL |
| `PUT` | `/rooms/:id` | Super admin, Admin | Body: `name` text, `capacity` number, `type` CLASSROOM \| LAB \| HALL |
| `DELETE` | `/rooms/:id` | Super admin, Admin |  |
| `GET` | `/time-slots` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional), `dayOfWeek` number (optional) |
| `GET` | `/time-slots/:id` | Everyone logged in |  |
| `POST` | `/time-slots` | Super admin, Admin | Body: `dayOfWeek` number, `startTime` text, `endTime` text, `label` text (optional) |
| `PUT` | `/time-slots/:id` | Super admin, Admin | Body: `dayOfWeek` number, `startTime` text, `endTime` text, `label` text (optional) |
| `DELETE` | `/time-slots/:id` | Super admin, Admin |  |
| `GET` | `/timetable` | Everyone logged in | Query: `sectionId` text (optional), `teacherId` text (optional), `roomId` text (optional) |
| `POST` | `/timetable/entries` | Super admin, Admin | Body: `courseOfferingId` text, `roomId` text, `timeSlotId` text |
| `DELETE` | `/timetable/entries/:id` | Super admin, Admin |  |

## Exams and results

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/students/:id/results` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/exams` | Super admin, Admin, Teacher | Query: `page` number (optional), `pageSize` number (optional), `semesterId` text (optional) |
| `GET` | `/exams/:id` | Super admin, Admin, Teacher |  |
| `POST` | `/exams` | Super admin, Admin | Body: `semesterId` text, `name` text, `type` INTERNAL \| PRACTICAL \| FINAL, `startDate` text, `endDate` text |
| `PUT` | `/exams/:id` | Super admin, Admin | Body: `semesterId` text, `name` text, `type` INTERNAL \| PRACTICAL \| FINAL, `startDate` text, `endDate` text |
| `DELETE` | `/exams/:id` | Super admin, Admin |  |
| `GET` | `/exams/:id/subjects` | Super admin, Admin |  |
| `POST` | `/exams/:id/subjects` | Super admin, Admin | Body: `courseOfferingId` text, `fullMarks` number, `passMarks` number, `date` text or value (optional) |
| `POST` | `/exams/:id/publish` | Super admin, Admin |  |
| `POST` | `/exams/:id/unlock` | Super admin, Admin |  |
| `GET` | `/exam-subjects/mine` | Teacher |  |
| `PUT` | `/exam-subjects/:id` | Super admin, Admin | Body: `courseOfferingId` text, `fullMarks` number, `passMarks` number, `date` text or value (optional) |
| `DELETE` | `/exam-subjects/:id` | Super admin, Admin |  |
| `GET` | `/exam-subjects/:id/marks` | Super admin, Admin, Teacher (own) |  |
| `PUT` | `/exam-subjects/:id/marks/:studentId` | Teacher (own) | Body: `marksObtained` number, `isAbsent` true or false (optional) |
| `GET` | `/sections/:id/results` | Super admin, Admin, Teacher (own) |  |

## Assignments and materials

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/students/:id/assignments` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/students/:id/materials` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/assignments` | Super admin, Admin, Teacher | Query: `page` number (optional), `pageSize` number (optional), `offeringId` text (optional) |
| `POST` | `/assignments` | Teacher (own) | Body: `courseOfferingId` text, `title` text, `description` text (optional), `dueAt` text, `maxMarks` number, `allowLate` true or false or text (optional) |
| `PUT` | `/assignments/:id` | Teacher (own) | Body: `courseOfferingId` text, `title` text, `description` text (optional), `dueAt` text, `maxMarks` number, `allowLate` true or false or text (optional) |
| `DELETE` | `/assignments/:id` | Teacher (own) |  |
| `GET` | `/assignments/:id/submissions` | Super admin, Admin, Teacher (own) |  |
| `POST` | `/assignments/:id/submission` | Student (own) | Body: `text` text (optional) |
| `GET` | `/assignments/:id/files/:fileId` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `PUT` | `/submissions/:id/grade` | Teacher (own) | Body: `marks` number, `feedback` text (optional) |
| `GET` | `/submissions/:id/files/:fileId` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/materials` | Super admin, Admin, Teacher | Query: `page` number (optional), `pageSize` number (optional), `offeringId` text (optional) |
| `POST` | `/materials` | Teacher (own) | Body: `courseOfferingId` text, `title` text, `description` text (optional) |
| `DELETE` | `/materials/:id` | Teacher (own) |  |
| `GET` | `/materials/:id/files/:fileId` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |

## Notices and events

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/notices` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional), `unreadOnly` true \| false (optional) |
| `GET` | `/notices/unread-count` | Everyone logged in |  |
| `GET` | `/notices/:id` | Super admin, Admin, Teacher (own), Student (own), Parent (own), Accountant (own), Librarian (own) |  |
| `POST` | `/notices/:id/read` | Super admin, Admin, Teacher (own), Student (own), Parent (own), Accountant (own), Librarian (own) |  |
| `POST` | `/notices` | Super admin, Admin, Teacher (own) | Body: `title` text, `body` text, `audience` ALL \| STUDENTS \| TEACHERS \| PARENTS \| PROGRAM \| SECTION, `programId` text (optional), `sectionId` text (optional), `isPinned` true or false (optional), `publishAt` text (optional), `expiresAt` text (optional) |
| `PUT` | `/notices/:id` | Super admin, Admin, Teacher (own) | Body: `title` text, `body` text, `audience` ALL \| STUDENTS \| TEACHERS \| PARENTS \| PROGRAM \| SECTION, `programId` text (optional), `sectionId` text (optional), `isPinned` true or false (optional), `publishAt` text (optional), `expiresAt` text (optional) |
| `DELETE` | `/notices/:id` | Super admin, Admin, Teacher (own) |  |
| `GET` | `/events` | Everyone logged in | Query: `from` text, `to` text |
| `POST` | `/events` | Super admin, Admin | Body: `title` text, `description` text (optional), `startAt` text, `endAt` text, `location` text (optional), `audience` ALL \| STUDENTS \| TEACHERS \| PARENTS \| PROGRAM \| SECTION, `programId` text (optional), `sectionId` text (optional) |
| `PUT` | `/events/:id` | Super admin, Admin | Body: `title` text, `description` text (optional), `startAt` text, `endAt` text, `location` text (optional), `audience` ALL \| STUDENTS \| TEACHERS \| PARENTS \| PROGRAM \| SECTION, `programId` text (optional), `sectionId` text (optional) |
| `DELETE` | `/events/:id` | Super admin, Admin |  |

## Dashboards

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/stats/overview` | Super admin, Admin |  |
| `GET` | `/dashboard/admin/students-by-program` | Super admin, Admin |  |
| `GET` | `/dashboard/admin/attendance-today` | Super admin, Admin |  |
| `GET` | `/dashboard/admin/low-attendance` | Super admin, Admin |  |
| `GET` | `/dashboard/admin/upcoming-exams` | Super admin, Admin |  |
| `GET` | `/dashboard/admin/attendance-trend` | Super admin, Admin |  |
| `GET` | `/dashboard/teacher/today-classes` | Teacher |  |
| `GET` | `/dashboard/teacher/pending-attendance` | Teacher |  |
| `GET` | `/dashboard/teacher/ungraded-submissions` | Teacher |  |
| `GET` | `/dashboard/teacher/low-attendance` | Teacher |  |
| `GET` | `/dashboard/students/:id/today` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/dashboard/students/:id/deadlines` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/dashboard/students/:id/latest-result` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/dashboard/recent-notices` | Everyone logged in |  |

## Fees

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/fee-heads` | Super admin, Admin, Accountant | Query: `page` number (optional), `pageSize` number (optional) |
| `GET` | `/fee-heads/:id` | Super admin, Admin, Accountant |  |
| `POST` | `/fee-heads` | Super admin, Admin, Accountant | Body: `name` text, `code` text |
| `PUT` | `/fee-heads/:id` | Super admin, Admin, Accountant | Body: `name` text, `code` text |
| `DELETE` | `/fee-heads/:id` | Super admin, Admin, Accountant |  |
| `GET` | `/fee-structures` | Super admin, Admin, Accountant | Query: `page` number (optional), `pageSize` number (optional) |
| `GET` | `/fee-structures/:id` | Super admin, Admin, Accountant |  |
| `POST` | `/fee-structures` | Super admin, Admin, Accountant | Body: `programId` text, `academicYearId` text, `semesterNumber` number, `items` list of object |
| `PUT` | `/fee-structures/:id` | Super admin, Admin, Accountant | Body: `programId` text, `academicYearId` text, `semesterNumber` number, `items` list of object |
| `DELETE` | `/fee-structures/:id` | Super admin, Admin, Accountant |  |
| `GET` | `/fine-rules` | Super admin, Admin, Accountant | Query: `page` number (optional), `pageSize` number (optional) |
| `GET` | `/fine-rules/:id` | Super admin, Admin, Accountant |  |
| `POST` | `/fine-rules` | Super admin, Admin, Accountant | Body: `name` text, `type` FIXED \| PER_DAY, `amount` text or number, `graceDays` number, `max` text or number (optional) |
| `PUT` | `/fine-rules/:id` | Super admin, Admin, Accountant | Body: `name` text, `type` FIXED \| PER_DAY, `amount` text or number, `graceDays` number, `max` text or number (optional) |
| `DELETE` | `/fine-rules/:id` | Super admin, Admin, Accountant |  |
| `GET` | `/invoices` | Super admin, Admin, Student, Parent, Accountant | Query: `page` number (optional), `pageSize` number (optional), `status` text (optional), `studentId` text (optional), `semesterId` text (optional), `search` text (optional) |
| `POST` | `/invoices/generate` | Super admin, Admin, Accountant | Body: `semesterId` text, `dueDate` text |
| `POST` | `/invoices` | Super admin, Admin, Accountant | Body: `studentId` text, `semesterId` text, `dueDate` text, `items` list of object |
| `GET` | `/invoices/:id` | Super admin, Admin, Student (own), Parent (own), Accountant |  |
| `POST` | `/invoices/:id/discount` | Super admin, Admin, Accountant | Body: `amount` text or number, `reason` text |
| `POST` | `/invoices/:id/cancel` | Super admin, Admin, Accountant | Body: `reason` text |
| `GET` | `/finance/outstanding.csv` | Super admin, Admin, Accountant |  |
| `GET` | `/finance/collections-summary` | Super admin, Admin, Accountant |  |
| `GET` | `/finance/outstanding-by-program` | Super admin, Admin, Accountant |  |
| `GET` | `/finance/collections-trend` | Super admin, Admin, Accountant |  |

## Payments

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/payments/callback/esewa` | No login |  |
| `GET` | `/payments/callback/khalti` | No login |  |
| `GET` | `/payments/callback/esewa/failed/:paymentId` | No login |  |
| `GET` | `/payments/callback/khalti/failed/:paymentId` | No login |  |
| `GET` | `/payments/gateways` | Super admin, Admin, Student, Parent, Accountant |  |
| `POST` | `/payments/initiate` | Student (own), Parent (own) | Body: `invoiceId` text, `method` ESEWA \| KHALTI |
| `POST` | `/payments/manual` | Super admin, Admin, Accountant | Body: `invoiceId` text, `method` CASH \| BANK, `amount` text or number, `reference` text (optional) |
| `GET` | `/payments` | Super admin, Admin, Student, Parent, Accountant | Query: `page` number (optional), `pageSize` number (optional), `invoiceId` text (optional), `status` text (optional) |
| `GET` | `/payments/:id` | Super admin, Admin, Student (own), Parent (own), Accountant |  |
| `POST` | `/payments/:id/refresh` | Super admin, Admin, Student (own), Parent (own), Accountant |  |

## PDFs and verification

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/public/verify-student/:id/:token` | No login |  |
| `GET` | `/pdf/receipt/:paymentId` | Super admin, Admin, Student (own), Parent (own), Accountant |  |
| `GET` | `/pdf/invoice/:invoiceId` | Super admin, Admin, Student (own), Parent (own), Accountant |  |
| `GET` | `/pdf/marksheet/:studentId/:semesterId` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/pdf/transcript/:studentId` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |
| `GET` | `/pdf/id-card/:studentId` | Super admin, Admin, Teacher (own), Student (own), Parent (own) |  |

## Settings and notifications

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/settings/institution` | Everyone logged in |  |
| `PUT` | `/settings/institution` | Super admin | Body: `name` text, `address` text, `phone` text (optional), `email` text or value (optional), `principalName` text (optional), `logoDataUrl` text (optional) |
| `GET` | `/notifications` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional) |
| `GET` | `/notifications/unread-count` | Everyone logged in |  |
| `POST` | `/notifications/read-all` | Everyone logged in |  |
| `GET` | `/notifications/preferences` | Everyone logged in |  |
| `PUT` | `/notifications/preferences` | Everyone logged in | Body: `channel` EMAIL \| IN_APP, `type` NOTICE_PUBLISHED \| ATTENDANCE_LOW \| RESULT_PUBLISHED \| ASSIGNMENT_CREATED \| ASSIGNMENT_DUE_SOON \| INVOICE_ISSUED \| INVOICE_OVERDUE \| PAYMENT_SUCCESS \| STUDY_SUPPORT \| QUIZ_PUBLISHED, `enabled` true or false |
| `POST` | `/notifications/:id/read` | Everyone logged in |  |

## AI: assistant and college rules

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/assistant/status` | Everyone logged in |  |
| `GET` | `/assistant/conversations` | Everyone logged in | Query: `page` number (optional), `pageSize` number (optional) |
| `GET` | `/assistant/conversations/:id/messages` | Super admin (own), Admin (own), Teacher (own), Student (own), Parent (own), Accountant (own), Librarian (own) |  |
| `DELETE` | `/assistant/conversations/:id` | Super admin (own), Admin (own), Teacher (own), Student (own), Parent (own), Accountant (own), Librarian (own) |  |
| `POST` | `/assistant/messages` | Everyone logged in | Body: `conversationId` text (optional), `message` text |
| `GET` | `/policies` | Super admin, Admin | Query: `page` number (optional), `pageSize` number (optional) |
| `POST` | `/policies` | Super admin, Admin | Body: `title` text |
| `POST` | `/policies/reindex` | Super admin, Admin |  |
| `DELETE` | `/policies/:id` | Super admin, Admin |  |

## AI: students needing attention

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/risk` | Super admin, Admin, Teacher | Query: `page` number (optional), `pageSize` number (optional), `offeringId` text (optional), `sectionId` text (optional), `level` LOW \| MEDIUM \| HIGH (optional), `unreviewedOnly` true \| false (optional) |
| `GET` | `/risk/summary` | Super admin, Admin |  |
| `POST` | `/risk/recompute` | Super admin, Admin |  |
| `POST` | `/risk/:id/review` | Super admin, Admin, Teacher (own) | Body: `note` text |

## AI: quizzes

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/quizzes/mine` | Student |  |
| `GET` | `/quizzes/mine/:id` | Student (own) |  |
| `POST` | `/quizzes/mine/:id/submit` | Student (own) | Body: `answers` list of object |
| `GET` | `/quizzes` | Super admin, Admin, Teacher | Query: `page` number (optional), `pageSize` number (optional), `offeringId` text (optional) |
| `POST` | `/quizzes/generate` | Teacher (own) | Body: `courseOfferingId` text, `title` text, `numQuestions` number, `types` list of MCQ \| TRUE_FALSE \| SHORT_ANSWER, `difficulty` EASY \| MEDIUM \| HARD, `materialId` text (optional), `text` text (optional) |
| `POST` | `/quizzes/answers/:answerId/grade` | Teacher (own) | Body: `isCorrect` true or false |
| `GET` | `/quizzes/:id` | Super admin, Admin, Teacher (own) |  |
| `PUT` | `/quizzes/:id` | Teacher (own) | Body: `title` text |
| `DELETE` | `/quizzes/:id` | Teacher (own) |  |
| `POST` | `/quizzes/:id/publish` | Teacher (own) | Body: `opensAt` text, `closesAt` text |
| `GET` | `/quizzes/:id/attempts` | Super admin, Admin, Teacher (own) |  |
| `PUT` | `/quizzes/:id/questions/:questionId` | Teacher (own) | Body: `type` MCQ \| TRUE_FALSE \| SHORT_ANSWER, `question` text, `options` list of text, `correctAnswer` text, `explanation` text, `difficulty` EASY \| MEDIUM \| HARD, `approved` true or false (optional) |
| `DELETE` | `/quizzes/:id/questions/:questionId` | Teacher (own) |  |
| `POST` | `/quizzes/:id/questions/:questionId/approve` | Teacher (own) |  |
| `POST` | `/quizzes/:id/questions/:questionId/unapprove` | Teacher (own) |  |
| `POST` | `/quizzes/:id/questions/:questionId/regenerate` | Teacher (own) |  |

## AI: timetable generator

| Method | Path | Who can call it | Request |
| --- | --- | --- | --- |
| `GET` | `/timetable-generator/semesters/:semesterId/inputs` | Super admin, Admin |  |
| `PUT` | `/timetable-generator/offerings/:id/periods` | Super admin, Admin | Body: `theoryPeriods` number, `labPeriods` number |
| `PUT` | `/timetable-generator/teachers/:id/unavailability` | Super admin, Admin | Body: `timeSlotIds` list of text |
| `POST` | `/timetable-generator/generate` | Super admin, Admin | Body: `semesterId` text |
| `POST` | `/timetable-generator/check` | Super admin, Admin | Body: `semesterId` text, `placements` list of object |
| `POST` | `/timetable-generator/apply` | Super admin, Admin | Body: `semesterId` text, `placements` list of object |
