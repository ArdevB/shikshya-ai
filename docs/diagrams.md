# Report diagrams

Diagrams for the project report, in Mermaid. GitHub draws them directly. To use one in Word, paste it into [mermaid.live](https://mermaid.live) and export it as an image.

The login, payment and assistant sequence diagrams are in [architecture.md](architecture.md), and the entity relationship diagrams are in [database.md](database.md).

## Use case diagram

Mermaid has no use case diagram of its own, so this one is drawn as a flowchart: people on the left, and what they can do in rounded boxes. Super admins can do everything admins can, and also change institution settings.

```mermaid
flowchart LR
  admin["Admin / Super admin"]
  teacher["Teacher"]
  student["Student"]
  parent["Parent"]
  accountant["Accountant"]
  gateway["eSewa / Khalti"]
  gemini["Google Gemini"]

  subgraph system["Shikshya"]
    login(["Log in"])
    assistant(["Ask the assistant"])
    notices(["Read notices and events"])

    structure(["Set up programs, courses and sections"])
    people(["Manage students, teachers and parents"])
    schedule(["Build or generate the timetable"])
    publish(["Create exams and publish results"])
    rules(["Upload college rules"])
    postNotice(["Post notices"])

    attendance(["Take attendance"])
    marks(["Enter marks"])
    coursework(["Set and grade assignments"])
    quiz(["Generate and review quizzes"])
    risk(["Review students needing attention"])

    viewOwn(["See timetable, attendance and results"])
    submit(["Hand in assignments and take quizzes"])
    pay(["Pay fees"])
    marksheet(["Download marksheet and transcript"])
    children(["Follow a child's progress"])

    invoices(["Generate invoices and apply fines"])
    manual(["Record cash and bank payments"])
    reports(["See collection reports"])
  end

  admin --> login & structure & people & schedule & publish & rules & postNotice & risk & assistant
  teacher --> login & attendance & marks & coursework & quiz & risk & postNotice & assistant
  student --> login & viewOwn & submit & pay & marksheet & notices & assistant
  parent --> login & children & pay & notices & assistant
  accountant --> login & invoices & manual & reports & assistant

  pay --> gateway
  assistant --> gemini
  quiz --> gemini
```

## Data flow diagram, level 0

The whole system as one process, with everyone it exchanges information with.

```mermaid
flowchart LR
  admin["Admin"]
  teacher["Teacher"]
  student["Student"]
  parent["Parent"]
  accountant["Accountant"]
  gateway["Payment gateway"]
  llm["Gemini"]
  mail["Email service"]

  system(("0<br/>Shikshya"))

  admin -->|"academic setup, people, exams, notices"| system
  system -->|"reports, dashboards, at-risk summaries"| admin
  teacher -->|"attendance, marks, assignments, notes"| system
  system -->|"class lists, reports, draft quizzes, at-risk lists"| teacher
  student -->|"submissions, quiz answers, questions, payments"| system
  system -->|"timetable, results, invoices, receipts, answers"| student
  parent -->|"payments, questions"| system
  system -->|"child's attendance, results, fees"| parent
  accountant -->|"fee setup, manual payments"| system
  system -->|"invoices, collection reports"| accountant
  system -->|"payment request, status check"| gateway
  gateway -->|"payment status"| system
  system -->|"questions, tool results, notes"| llm
  llm -->|"answers, embeddings, quiz drafts"| system
  system -->|"notifications"| mail
```

## Data flow diagram, level 1

The main processes inside the system, and the data they keep.

```mermaid
flowchart TB
  admin["Admin"]
  teacher["Teacher"]
  student["Student or parent"]
  accountant["Accountant"]
  gateway["Payment gateway"]
  llm["Gemini"]

  p1(("1.0<br/>Log in and<br/>check access"))
  p2(("2.0<br/>Manage academic<br/>structure"))
  p3(("3.0<br/>Record<br/>attendance"))
  p4(("4.0<br/>Exams and<br/>results"))
  p5(("5.0<br/>Assignments<br/>and quizzes"))
  p6(("6.0<br/>Fees and<br/>payments"))
  p7(("7.0<br/>Notices and<br/>notifications"))
  p8(("8.0<br/>AI features"))

  d1[("D1 Users and tokens")]
  d2[("D2 Programs, courses, sections")]
  d3[("D3 Attendance")]
  d4[("D4 Exams, marks, results")]
  d5[("D5 Assignments, quizzes, files")]
  d6[("D6 Invoices and payments")]
  d7[("D7 Notices and notifications")]
  d8[("D8 Conversations, rules, predictions")]

  admin & teacher & student & accountant -->|"email and password"| p1
  p1 <--> d1
  admin -->|"programs, offerings, timetable"| p2
  p2 <--> d2
  teacher -->|"who was present"| p3
  p3 <--> d3
  d2 --> p3
  p3 -->|"attendance figures"| student
  teacher -->|"marks"| p4
  admin -->|"publish"| p4
  p4 <--> d4
  d2 --> p4
  p4 -->|"results, marksheets"| student
  teacher -->|"assignments, notes"| p5
  student -->|"submissions, answers"| p5
  p5 <--> d5
  accountant -->|"fee structures"| p6
  student -->|"pays"| p6
  p6 <--> d6
  p6 <-->|"start, verify"| gateway
  p6 -->|"invoices, receipts"| student
  admin & teacher -->|"notices"| p7
  p7 <--> d7
  p7 -->|"notifications"| student
  student -->|"questions"| p8
  teacher -->|"reviews"| p8
  p8 <--> d8
  d3 & d4 & d5 & d6 -->|"read through permission checks"| p8
  p8 <-->|"prompts and replies"| llm
```

## Data flow diagram, level 2: payments

Process 6.0 in detail.

```mermaid
flowchart TB
  student["Student or parent"]
  accountant["Accountant"]
  gateway["Payment gateway"]

  p61(("6.1<br/>Generate<br/>invoices"))
  p62(("6.2<br/>Apply fines"))
  p63(("6.3<br/>Start a<br/>payment"))
  p64(("6.4<br/>Verify with<br/>the gateway"))
  p65(("6.5<br/>Credit the<br/>invoice"))
  p66(("6.6<br/>Record a manual<br/>payment"))
  p67(("6.7<br/>Make the<br/>receipt"))

  d61[("D6.1 Fee structures")]
  d62[("D6.2 Invoices")]
  d63[("D6.3 Payments")]
  d64[("D6.4 Audit log")]

  accountant -->|"semester to bill"| p61
  d61 --> p61
  p61 --> d62
  d62 -->|"overdue invoices"| p62
  p62 --> d62
  student -->|"invoice, gateway"| p63
  d62 -->|"amount owed"| p63
  p63 -->|"new payment"| d63
  p63 -->|"payment request"| gateway
  gateway -->|"browser comes back"| p64
  p64 <-->|"status check"| gateway
  d63 -->|"expected amount"| p64
  p64 -->|"confirmed amount"| p65
  p65 --> d62
  p65 --> d63
  p65 --> d64
  accountant -->|"cash or bank details"| p66
  p66 --> d63
  p66 --> p65
  p65 --> p67
  p67 -->|"receipt PDF"| student
```

## Data flow diagram, level 2: attendance

Process 3.0 in detail.

```mermaid
flowchart TB
  teacher["Teacher"]
  student["Student or parent"]

  p31(("3.1<br/>Load the<br/>class list"))
  p32(("3.2<br/>Check the<br/>session"))
  p33(("3.3<br/>Save the<br/>records"))
  p34(("3.4<br/>Calculate<br/>percentages"))
  p35(("3.5<br/>Warn about<br/>low attendance"))

  d31[("D3.1 Enrollments")]
  d32[("D3.2 Sessions and records")]
  d33[("D3.3 Audit log")]
  d34[("D3.4 Notifications")]

  teacher -->|"class, date, period"| p31
  d31 --> p31
  p31 -->|"students"| teacher
  teacher -->|"status of each student"| p32
  d32 -->|"any existing session"| p32
  p32 --> p33
  p33 --> d32
  p33 --> d33
  d32 --> p34
  p34 -->|"percentages"| student
  p34 -->|"just fell below 75%"| p35
  p35 --> d34
  d34 -->|"notification"| student
```

## Class diagram

The main classes in the domain, with the most important fields. [database.md](database.md) has every table and column.

```mermaid
classDiagram
  class User {
    +String email
    +Role role
    +Boolean isActive
    +Int failedLoginCount
    +DateTime lockedUntil
  }
  class Student {
    +String rollNumber
    +Date admissionDate
  }
  class Teacher {
    +String employeeCode
    +String designation
  }
  class Parent
  class Program {
    +String code
    +Int durationSemesters
  }
  class Semester {
    +Int number
    +Date startDate
    +Date endDate
  }
  class Section {
    +String name
  }
  class Course {
    +String code
    +Int creditHours
  }
  class CourseOffering {
    +Int weeklyTheoryPeriods
    +Int weeklyLabPeriods
  }
  class AttendanceSession {
    +Date date
    +Int period
  }
  class AttendanceRecord {
    +AttendanceStatus status
  }
  class Exam {
    +ExamType type
    +Boolean isPublished
  }
  class ExamSubject {
    +Decimal fullMarks
    +Decimal passMarks
  }
  class Mark {
    +Decimal marksObtained
    +Boolean isAbsent
  }
  class Result {
    +Decimal gpa
    +ResultStatus status
  }
  class Invoice {
    +String invoiceNumber
    +Int totalPaisa
    +Int paidPaisa
    +InvoiceStatus status
  }
  class Payment {
    +Int amountPaisa
    +PaymentMethod method
    +PaymentStatus status
    +String receiptNumber
  }
  class Assignment {
    +DateTime dueAt
    +Decimal maxMarks
  }
  class Submission {
    +Boolean isLate
    +Decimal marks
  }
  class Quiz {
    +QuizStatus status
    +DateTime closesAt
  }
  class RiskPrediction {
    +Float probability
    +RiskLevel level
  }

  User "1" -- "0..1" Student
  User "1" -- "0..1" Teacher
  User "1" -- "0..1" Parent
  Parent "*" -- "*" Student : linked children
  Program "1" *-- "*" Semester
  Semester "1" *-- "*" Section
  Program "1" *-- "*" Course
  Section "*" -- "*" Student : enrollment
  Course "1" -- "*" CourseOffering
  Section "1" -- "*" CourseOffering
  Teacher "1" -- "*" CourseOffering : teaches
  CourseOffering "1" *-- "*" AttendanceSession
  AttendanceSession "1" *-- "*" AttendanceRecord
  Student "1" -- "*" AttendanceRecord
  Exam "1" *-- "*" ExamSubject
  CourseOffering "1" -- "*" ExamSubject
  ExamSubject "1" *-- "*" Mark
  Student "1" -- "*" Mark
  Student "1" -- "*" Result
  Semester "1" -- "*" Result
  Student "1" -- "*" Invoice
  Invoice "1" *-- "*" Payment
  CourseOffering "1" *-- "*" Assignment
  Assignment "1" *-- "*" Submission
  Student "1" -- "*" Submission
  CourseOffering "1" *-- "*" Quiz
  Student "1" -- "*" RiskPrediction
  CourseOffering "1" -- "*" RiskPrediction
```

### The main services

The API's logic is in service modules, which the routes call. Payment gateways sit behind one interface, so adding a provider does not change the payment code. The same is true of file storage and of the language model.

```mermaid
classDiagram
  class PaymentGateway {
    <<interface>>
    +initiate(input) InitiateOutput
    +identifyCallback(params) String
    +verify(payment) VerifyResult
  }
  class EsewaGateway
  class KhaltiGateway
  PaymentGateway <|.. EsewaGateway
  PaymentGateway <|.. KhaltiGateway

  class StorageService {
    <<interface>>
    +save(file) StoredFile
    +send(file, response)
    +read(file) Buffer
    +remove(file)
  }
  class LocalStorage
  class S3Storage
  StorageService <|.. LocalStorage
  StorageService <|.. S3Storage

  class LlmClient {
    <<interface>>
    +turn(request) LlmTurnResult
    +embed(texts, purpose) Vector
  }
  class GeminiClient
  LlmClient <|.. GeminiClient

  class PaymentService
  class AssignmentService
  class AssistantService
  PaymentService --> PaymentGateway
  AssignmentService --> StorageService
  AssistantService --> LlmClient
```

## Activity diagram: taking attendance

```mermaid
flowchart TD
  start([Teacher opens Take attendance]) --> choose[Choose class, date and period]
  choose --> own{Teaches this class?}
  own -- No --> refused([Refused with a 403])
  own -- Yes --> existing{Session already saved<br/>for this date and period?}
  existing -- Yes --> load[Load the saved statuses]
  existing -- No --> fresh[Everyone starts as Present]
  load --> mark
  fresh --> mark[Mark each student:<br/>Present, Absent, Late or Excused]
  mark --> save[Press Save or Update]
  save --> isNew{New session?}
  isNew -- Yes --> create[Save the session and records]
  isNew -- No --> window{Within 48 hours,<br/>or an admin?}
  window -- No --> tooLate([Refused: too late to edit])
  window -- Yes --> update[Update the records]
  create --> audit[Write the audit log, in the same transaction]
  update --> audit
  audit --> calc[Work out each student's percentage:<br/>present + late, over present + late + absent]
  calc --> below{Just fell below 75%?}
  below -- Yes --> notify[Notify the student and their parents]
  below -- No --> done([Done])
  notify --> done
```

## Gantt chart

From the project's git history. If your report covers a longer period, including planning and writing, change these dates to match.

```mermaid
gantt
  title Shikshya: the five phases
  dateFormat YYYY-MM-DD
  axisFormat %d %b

  section Phase 1
  Monorepo, login, academic structure, attendance :done, p1, 2026-11-06, 1d
  section Phase 2
  Timetable, exams, assignments, notices, dashboards :done, p2, 2026-11-06, 1d
  section Phase 3
  Fees, eSewa and Khalti, PDFs, notifications :done, p3, 2026-11-06, 2d
  section Phase 4
  Assistant, at-risk model, quizzes, timetable solver :done, p4, 2026-11-07, 1d
  section Phase 5
  Testing, security, documentation :done, p5, 2026-11-07, 1d
  Deployment :active, p5b, 2026-11-08, 1d
```
