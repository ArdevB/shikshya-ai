# Security

What protects Shikshya, and how each measure is checked. Most of it is enforced by automated tests, named below, rather than by good intentions.

## Who can do what

- **Every route declares its roles**, and services apply row-level rules on top: a student sees only their own records, a parent only their linked children, and a teacher only the classes they teach. The web app hiding a page is only a convenience, and the API is what enforces access.
- **[permissions.md](permissions.md) lists every route and role.** `apps/api/test/permissions.test.ts` makes a real request for each combination and fails if the result differs. A new route fails the test until someone decides who may use it.
- **Insecure direct object references (IDOR):** for every cell marked `own`, the same test tries a real record belonging to someone in another class and, for personal records, a classmate, and expects a refusal. It also sends valid request bodies, because validation runs first and an empty body would never reach the ownership check. Lists are tested too, including trying to widen one by asking for someone else's id.

## Logging in

| Measure              | How                                                                                                                                                                                  | Checked by              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Password storage     | bcrypt with cost 12. Never returned by any route.                                                                                                                                    | `test/auth.test.ts`     |
| Password policy      | 8 to 72 characters, with a letter and a number, and not on a list of common passwords. bcrypt only reads 72 bytes, so longer ones would be silently cut.                             | `test/security.test.ts` |
| Rate limit           | 5 failed attempts per 15 minutes, per address and email. Successful logins do not count.                                                                                             | `test/auth.test.ts`     |
| Account lockout      | 10 wrong passwords in a row, from anywhere, locks the account for 15 minutes, even for the right password. This covers guesses from many addresses, which the rate limit cannot see. | `test/security.test.ts` |
| No account discovery | The same message for every failure, including a locked account. An unknown email still does a bcrypt comparison, so timing gives nothing away either.                                | `test/security.test.ts` |
| Access tokens        | JWT, 15 minutes, kept only in the page's memory.                                                                                                                                     | `test/auth.test.ts`     |
| Refresh tokens       | Random, stored only as a hash, and valid once. If a used one comes back it may have been stolen, so all that user's sessions end.                                                    | `test/auth.test.ts`     |
| Deactivated accounts | Checked on every request, so they stop working at once rather than when a token expires.                                                                                             | `test/auth.test.ts`     |

## Browsers

| Measure              | How                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secure cookie        | The refresh cookie is `HttpOnly`, `SameSite=Strict`, limited to `/api/v1/auth`, and `Secure` in production.                                                                                                                                                 |
| CSRF protection      | `/auth/refresh` and `/auth/logout` are the only routes a browser could trigger by itself, because every other route needs the access token in a header. Those two also need a custom header, which another site's form cannot set, and a matching `Origin`. |
| CORS                 | Only the configured web origin is allowed.                                                                                                                                                                                                                  |
| Security headers     | Helmet on the API. `apps/web/vercel.json` sets the web app's Content Security Policy, which allows scripts only from the site itself. The browser tests run the production build with these same headers, and one test fails if any page breaks them.       |
| Cross-site scripting | React escapes everything by default. Markdown is rendered with `rehype-sanitize`. PDF templates escape their data, and Chrome runs them with scripts off. Uploaded files are always sent as downloads, so one can never run as a page on our site.          |

Checked by `test/security.test.ts` and `apps/web/e2e/journeys.spec.ts`.

## Rate limits

Counted in memory, which is enough for one API process. Going over gets a 429.

| What                                                                     | Limit                                                        | Per                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Failed logins                                                            | 5 in 15 minutes                                              | Address and email                                             |
| Refresh and logout                                                       | 1000 in 15 minutes                                           | Address. High, because a whole college can share one address. |
| AI routes                                                                | 120 a minute                                                 | Person                                                        |
| Quiz generation, risk recalculation, rule indexing, timetable generation | 20 a minute                                                  | Person                                                        |
| Assistant messages                                                       | 30 an hour, counted in the database so it survives a restart | Person                                                        |
| Starting or rechecking a payment                                         | 20 a minute                                                  | Person                                                        |
| Payment callbacks                                                        | 300 a minute                                                 | Address                                                       |

Checked by `test/rate-limits.test.ts`.

## Uploads

- **Type by content:** the first bytes of each file must match its extension, so a program renamed to `notes.pdf` is refused. The detected type replaces whatever the browser claimed. CSV imports must be valid text. See `src/lib/fileTypes.ts`.
- **Size:** 10 MB per file and 5 files per request, or 5 MB for a CSV import.
- **Names:** files are stored under a random id. The original name is only ever displayed, after removing paths and control characters.
- **Downloads** go through the API, which applies the same access rules as the record the file belongs to. The S3 bucket stays private.

Checked by `src/lib/fileTypes.test.ts`, `test/security.test.ts` and `test/storage.test.ts`.

## Payments

- **A gateway redirect is never believed.** It only identifies the payment. The API then asks the gateway directly, and credits the invoice only on a confirmed status and an exactly matching amount.
- **Duplicate and simultaneous callbacks** do nothing extra, because only one can change a payment from `INITIATED` to `SUCCESS`.
- **Secrets** are only on the server, and every change to a payment or invoice is in the audit log.

Checked by `test/finance.test.ts`, including forged callbacks, wrong amounts and two callbacks at the same moment.

## AI

The main rule is that **tool permissions never depend on the model's judgment**, so tricking the model gains nothing.

- The tool list is filtered by role, so a student's model never hears of a teacher's tools.
- No tool takes a student id. Each one works out the student from who is logged in, then calls the same service and permission check as the normal API.
- Arguments from the model are validated like any other input, and a tool it was not given is refused.
- After 5 rounds of tools, it must answer with what it has.

**Prompt injection:** text the college wrote can reach the model, such as rules, notices and a teacher's notes. A document could contain "ignore your instructions".

- Tool results are wrapped in `<data>` tags, with angle brackets escaped so the text cannot close the tag. The system prompt says these are data and never instructions.
- A teacher's notes for a quiz are wrapped in `<notes>` tags, in the same way.
- Student submissions are never sent to the model. Short quiz answers are marked by the teacher.
- A generated quiz reaches students only after a teacher approves every question.

The AI service refuses any request without a shared secret, compared in constant time. Every call is logged with its user, tokens and time, but no prompts or replies.

**Gemini's terms:** its free tier may use what is sent to improve Google's products, human reviewers may read it, and personal data is forbidden. So the free tier is for fake demo data only. Real student data needs billing enabled at least. The terms also bar apps likely to be used by under-18s on any tier, so a school with younger students would need another provider. `src/lib/llm.ts` and `apps/ai/app/llm.py` are the only files that would change.

Checked by `test/assistant.test.ts`, `test/ai-features.test.ts` and `test/security.test.ts`.

## Configuration

- **Secrets come only from environment variables.** `.env` files are ignored by git, and `.env.example` documents each one.
- **The API refuses to start in production** if a setting is missing or unsafe: placeholder secrets, the same secret twice, no HTTPS on the site's address, or an AI service still on localhost. It lists every problem at once, without repeating secret values. See `src/config/env.ts` and `src/config/env.test.ts`.
- **Logs** are JSON lines with a request id. They record only a request's path, because query strings hold gateway data and QR tokens, and never its headers. Passwords and tokens are masked if one ever gets logged by mistake.
- **Errors** never reach the user with their details. An unexpected error returns a generic message and a request id to quote.

## Dependencies

Checked on 7 November 2026 with `pnpm audit` and `pip-audit`.

**Python: no known vulnerabilities.**

**Node: 4 advisories remain.** None could be fixed by a normal upgrade, and none can be reached by a visitor.

| Package                  | Severity | Why it is here                                         | Why it is accepted                                                                                                                                                                                                                                                                           |
| ------------------------ | -------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zod` below 4.6.6        | High     | Validates every request                                | The problem is memory use on oversized collections. Request bodies are limited to 1 MB before Zod sees them, and uploads are size-limited, so a large one cannot arrive. Moving to Zod 4 is a major change across every schema, and should be done with care after the project is submitted. |
| `extract-zip`            | High     | Puppeteer uses it to unpack Chrome during installation | No fixed version exists. It only ever unpacks Chrome from Google's own download, and the production image uses Debian's Chrome and skips this step.                                                                                                                                          |
| `deepmerge-ts` below 8   | High     | Prisma's command line tool reads its config with it    | Only merges Prisma's own config file. Never sees outside input.                                                                                                                                                                                                                              |
| `minimatch` below 11.0.1 | Moderate | ESLint's TypeScript support                            | Only used on a developer's computer, on patterns from our own config.                                                                                                                                                                                                                        |

Other findings were fixed by upgrading `nodemailer`, `csv-parse`, `react-router-dom`, `vitest` and `typescript-eslint`, and pinning `basic-ftp`.

## Known limits

- Rate limit counts live in one process's memory, so they reset on restart and would not be shared if the API ran as several processes.
- The Content Security Policy allows inline styles, which the animation library and React's `style` attribute need. Scripts remain strict.
- There is no two-factor login.
- Students' fairness in the at-risk model has not been checked, because the training data is made up. See [algorithms/risk-model.md](algorithms/risk-model.md).
