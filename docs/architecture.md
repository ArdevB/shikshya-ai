# Architecture

How the parts of Shikshya fit together, and what happens during the three requests that matter most: logging in, paying a fee, and asking the assistant a question.

## The system

```mermaid
flowchart LR
  browser["Browser<br/>React app"]

  subgraph vercel["Vercel"]
    web["Static site<br/>and /api rewrite"]
  end

  subgraph render["Render"]
    api["API<br/>Node.js, Express, Prisma"]
    chrome["Chrome<br/>makes PDFs"]
    jobs["Scheduled jobs<br/>inside the API"]
    ai["AI service<br/>FastAPI, scikit-learn, OR-Tools"]
  end

  subgraph neon["Neon"]
    db[("PostgreSQL 18<br/>with pgvector")]
    files[("Object storage<br/>uploaded files")]
  end

  esewa["eSewa"]
  khalti["Khalti"]
  gemini["Google Gemini"]
  smtp["Email provider"]

  browser -->|"pages and /api"| web
  web -->|"/api, same site"| api
  browser <-->|"live notifications"| api
  api --> db
  api --> files
  api --> chrome
  jobs --> db
  api -->|"X-Internal-Key"| ai
  api -->|"assistant, embeddings"| gemini
  ai -->|"quiz questions"| gemini
  api -->|"verify payment"| esewa
  api -->|"verify payment"| khalti
  browser -.->|"pays on the gateway's page"| esewa
  browser -.->|"pays on the gateway's page"| khalti
  api --> smtp
```

| Part                               | Technology                                           | Its job                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app (`apps/web`)               | React 18, Vite, TypeScript, Tailwind, TanStack Query | Everything people see. It holds no rules of its own: hiding a page is a convenience, and the API enforces access.                                                                        |
| API (`apps/api`)                   | Node.js 20, Express 5, Prisma, Zod                   | All business rules, permissions and data access.                                                                                                                                         |
| AI service (`apps/ai`)             | Python 3.11, FastAPI, scikit-learn, OR-Tools         | The work that suits Python: the at-risk model, the timetable solver, quiz generation and reading PDFs. It never touches the database, and refuses any request without the shared secret. |
| Shared package (`packages/shared`) | TypeScript, Zod                                      | Validation rules, types and calculations used by both web and API, so they cannot disagree.                                                                                              |
| Database                           | PostgreSQL 18 with pgvector, on Neon                 | All records, and the college rules' embeddings.                                                                                                                                          |

### How the code is organised

Each API request goes through the same layers, which keeps controllers thin and makes rules easy to find:

```mermaid
flowchart LR
  route["Route<br/>who may call it"] --> validate["Zod schema<br/>is the input valid?"] --> service["Service<br/>rules and row-level checks"] --> prisma["Prisma<br/>the database"]
```

A role check in the route is not enough on its own: a student may call `/students/:id/results`, but only with their own id. So `services/scope.ts` holds the row-level rules, and services call them. See [permissions.md](permissions.md) for the full table, which a test checks against the real API.

### Why two languages?

The solver and the machine learning libraries are Python's strength, and the rest of the project is TypeScript. Keeping the Python behind one small internal API means each side can be tested and explained alone. If the AI service is down, everything except its own features keeps working, and those features say so plainly.

## Request flow: logging in

Access tokens are short-lived and kept only in memory, so a script injected into a page has little to steal, and a stolen token soon expires. The refresh token lives in a cookie that scripts cannot read.

```mermaid
sequenceDiagram
  actor User
  participant Web as Web app
  participant API
  participant DB as Database

  User->>Web: Email and password
  Web->>API: POST /auth/login
  Note over API: Rate limit: 5 failures per<br/>15 minutes, per address and email
  API->>DB: Find the user
  API->>API: Compare with the bcrypt hash
  alt Wrong password, locked, or no such account
    Note over API,DB: A wrong password counts<br/>towards a lock after 10
    API-->>Web: 401, the same message every time
  else Correct
    API->>DB: Clear failures, store the refresh token's hash
    API-->>Web: Access token (15 minutes) and HttpOnly cookie (7 days)
    Web-->>User: Dashboard for their role
  end

  Note over Web,API: 15 minutes later, a request gets a 401
  Web->>API: POST /auth/refresh with cookie and site header
  API->>DB: Is this token still valid?
  alt A token that was already used
    API->>DB: End all this user's sessions, in case it was stolen
    API-->>Web: 401, back to the login page
  else Valid
    API->>DB: Retire it and issue a new one
    API-->>Web: New access token and cookie
    Web->>API: Repeat the original request
  end
```

## Request flow: paying a fee

The most important rule is that a redirect from a gateway is never believed. Anyone could type that address into a browser. Only the gateway's own answer to the API's question counts, and the amount must match exactly.

```mermaid
sequenceDiagram
  actor Student
  participant Web as Web app
  participant API
  participant DB as Database
  participant Gateway as eSewa or Khalti

  Student->>Web: Pay now
  Web->>API: POST /payments/initiate
  API->>DB: Is this their invoice, and what is owed?
  API->>DB: Save the payment as INITIATED
  API->>Gateway: Start payment (Khalti) or sign the form (eSewa)
  API-->>Web: Where to send the browser
  Web->>Gateway: Browser goes to the gateway's page
  Student->>Gateway: Pays
  Gateway-->>API: Browser returns to the callback address
  Note over API: Only used to find which payment this is
  API->>Gateway: What is the real status of this payment?
  Gateway-->>API: Status and amount
  alt Completed and the amount matches
    API->>DB: One transaction: mark paid, credit the invoice,<br/>number the receipt, write the audit log
    API-->>Web: Redirect to the success page
    Web->>API: GET /pdf/receipt/:id
    API-->>Student: Receipt PDF
  else Failed, or the amount differs
    API->>DB: Mark failed and write the audit log
    API-->>Web: Redirect to the failure page
  else Pending
    API-->>Web: Redirect to the pending page
    Note over API: A job asks again every 15 minutes,<br/>in case the customer never came back
  end
```

Two callbacks arriving at once are safe: marking the payment as paid only succeeds for whichever gets there first, so the invoice is credited once.

## Request flow: asking the assistant

The model never chooses whose data it sees. It can only ask for tools from a list filtered by role, no tool takes a student id, and each tool works out the student from who is logged in, then calls the same service and permission check as the normal API. So a clever prompt has nothing to exploit.

```mermaid
sequenceDiagram
  actor Student
  participant Web as Web app
  participant API
  participant Gemini
  participant DB as Database

  Student->>Web: What is my attendance like?
  Web->>API: POST /assistant/messages
  Note over API: Limit: 30 messages an hour.<br/>Tools filtered by role.
  API->>Gemini: Question, system prompt and allowed tools
  Gemini-->>API: Please call get_my_attendance
  Note over API: Check the tool is allowed and<br/>its arguments are valid
  API->>DB: Attendance for the logged-in student
  API->>Gemini: The result, marked as data
  Gemini-->>API: Reply, a piece at a time
  API-->>Web: Server-sent events: tool used, text, done
  Web-->>Student: The answer appears as it is written
  API->>DB: Save the conversation, and log tokens and time
```

After 5 rounds of tools, the model must answer with what it has, so a confused model cannot loop forever. See [security.md](security.md) for how text in tool results is kept from acting as instructions.

## Background jobs

These run inside the API process with `node-cron`, in Nepal time.

| When             | Job                                           |
| ---------------- | --------------------------------------------- |
| Every 5 minutes  | Send notices scheduled for now                |
| Every 15 minutes | Ask gateways about payments still unconfirmed |
| Every hour       | Remind students about assignments due soon    |
| 00:10 daily      | Mark overdue invoices and recalculate fines   |
| 01:30 daily      | Recalculate students needing attention        |

On a host that sleeps when idle, such as Render's free plan, these only run while the API is awake. Each job works out what is due from the data rather than counting on having run recently, so a late run catches up.

## Where to read more

- [database.md](database.md): every table, with diagrams
- [api.md](api.md): every route
- [permissions.md](permissions.md): who may call what
- [security.md](security.md): what protects the system
- [performance.md](performance.md): measurements and load tests
- [deployment.md](deployment.md): putting it online
- [algorithms/](algorithms): GPA, the risk model, the timetable solver and college-rules search
