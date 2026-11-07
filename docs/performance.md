# Performance

How the system was measured, what was found, and what was changed. All measurements are from 7 November 2026, on a Windows laptop with the API and a local Postgres 18 on the same machine, using the demo data unless stated. So they compare one part of the system with another, and do not predict a hosted site. A database across the network adds about 80 ms to each query.

## Looking for N+1 queries

An N+1 problem is one query for a list, then another for each row, which gets slower as data grows. To find any, every main read endpoint was called while counting the queries Prisma sent.

**None were found.** Across 57 endpoints, no query shape repeated more than twice in a request, and none made more than about 12 queries. The slowest single query took 11 ms.

## Checking indexes at a larger scale

With only 40 students, Postgres reads whole tables because that is quickest, so the demo data says little about indexes. So the data was inflated to about a college-year of activity, and `EXPLAIN ANALYZE` was run on the heaviest queries:

| Table               | Rows    |
| ------------------- | ------- |
| `AttendanceRecord`  | 98,100  |
| `AttendanceSession` | 4,905   |
| `Notification`      | 104,002 |
| `Payment`           | 41,024  |

| Endpoint                            | Time   | What the plan showed                                                                                          |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `/finance/collections-summary`      | 164 ms | Reads every payment, because it totals all of them. Now cached.                                               |
| `/finance/collections-trend`        | 111 ms | Reads most payments here, because the test data was all recent. Now cached, with an index for when it is not. |
| `/dashboard/admin/low-attendance`   | 110 ms | Reads all attendance, because it is about everyone. Already cached.                                           |
| `/payments` (a student's)           | 79 ms  | Uses the index on `invoiceId`.                                                                                |
| `/dashboard/teacher/low-attendance` | 34 ms  | Uses the index on `courseOfferingId, date`.                                                                   |
| `/notifications?pageSize=20`        | 23 ms  | Uses the index on `userId`.                                                                                   |

Nothing was slow, even at this size.

### Indexes added

Postgres's own catalog was asked for foreign keys with no index starting with them, then each was compared against how queries use it. Migration `20261107160000_phase5_indexes` adds:

- `Payment (status, paidAt)`, for the finance reports
- `QuizAttempt (studentId)`, for a student's quiz list
- `QuizAnswer (questionId)`, for quiz marking
- `Invoice (feeStructureId)`, `Notice (createdById)`, `Quiz (createdById)`, `Event (sectionId)`, `Event (programId)` and `AiCallLog (userId)`, for filtering

The remaining foreign keys without their own index, such as `Mark.enteredById`, are never filtered on, so an index would only slow down writes.

## Caching

`src/lib/cache.ts` keeps dashboard figures in memory for a minute. A promise is stored rather than a result, so requests arriving during a slow load share one query.

Finance totals now work the same way, and any new payment clears them, so an accountant sees it at once. The access check always runs first, including when the answer is already cached.

## Pagination

Every list across the institution is paginated, with a default of 20 and a maximum of 100. Lists that are small by nature come back whole: one class's students, one exam's papers, or one person's quizzes.

## Load test

`load/read-endpoints.js` is a [k6](https://k6.io) test of the main read endpoints, with 100 virtual users who each read a page and pause for a second, 70% students, 20% teachers and 10% admins. To run it:

```bash
winget install k6         # or see k6.io for other systems
pnpm dev                  # in another terminal
k6 run load/read-endpoints.js
```

It passes if fewer than 1% of requests fail and 95% take under 500 ms.

**k6 results: not yet recorded.** k6 needs installing separately. Add its summary here once it has been run.

### Measured with autocannon

For a figure in the meantime, the same endpoints were measured with [autocannon](https://github.com/mcollina/autocannon), against the compiled production API. Each of 100 connections sends its next request as soon as the last finishes, with no pause, so this is much harsher than 100 people. Each mix ran for 30 seconds.

| Mix           | Requests a second | Median | 90% within | 99% within | Failed      |
| ------------- | ----------------- | ------ | ---------- | ---------- | ----------- |
| Student reads | 470               | 199 ms | 297 ms     | 564 ms     | 0 of 14,099 |
| Teacher reads | 641               | 126 ms | 216 ms     | 931 ms     | 0 of 19,226 |
| Admin reads   | 510               | 197 ms | 336 ms     | 418 ms     | 0 of 15,300 |

100 people pausing a second between pages would send about 100 requests a second, a fifth of what was handled here, with no errors. The API used 361 MB of memory by the end of the run.

### What this does not show

- It only covers reads. Writes are less frequent, and each is a small transaction.
- A hosted site is different: a free Render instance has a tenth of a CPU, and the database is across a network. Run the k6 test against the deployed site to see those numbers.

## Memory on small hosts

Measured while running: the API uses about 130 MB at rest, and the AI service about 130 MB after loading its libraries. Chrome, for PDFs, took about 460 MB on Windows. Free hosting plans have 512 MB, so Chrome now closes itself after a minute with nothing to do, and the container starts it with lighter settings. A PDF right after a long quiet spell takes a few seconds longer as a result. Whether a PDF fits in 512 MB on Render can only be confirmed once deployed.

## Finding slow things later

Each request logs its path, status, time taken and request id, as JSON. On Neon, `neon inspect db outliers` lists the queries using the most total time.
