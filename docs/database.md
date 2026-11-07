# Database

Generated from `apps/api/prisma/schema.prisma` by `pnpm docs:generate`. Do not edit by hand: `apps/api/test/docs.test.ts` fails if this differs from the schema.

54 tables in PostgreSQL 18, accessed through Prisma. Money is stored as whole paisa, and dates as UTC. A `FK` points to the table named in the lines below it.

`PolicyChunk` also has an `embedding vector(768)` column from pgvector, for searching the college rules by meaning. Prisma cannot describe that type, so it does not appear below, and migrations only add it where the extension is available. See [algorithms/rag.md](algorithms/rag.md).

## How the tables relate

Every table and relationship, without their columns. The sections after it show each area in detail.

```mermaid
erDiagram
  User ||--o{ RefreshToken : "user"
  Department ||--o{ Program : "department"
  Program ||--o{ Semester : "program"
  AcademicYear ||--o{ Semester : "academicYear"
  Semester ||--o{ Section : "semester"
  Program ||--o{ Course : "program"
  Course ||--o{ CourseOffering : "course"
  Section ||--o{ CourseOffering : "section"
  Teacher ||--o{ CourseOffering : "teacher"
  User ||--o| Teacher : "user"
  Department ||--o{ Teacher : "department"
  User ||--o| Student : "user"
  Program ||--o{ Student : "program"
  Section ||--o{ Student : "currentSection"
  User ||--o| Parent : "user"
  Parent ||--o{ ParentStudent : "parent"
  Student ||--o{ ParentStudent : "student"
  Student ||--o{ Enrollment : "student"
  Section ||--o{ Enrollment : "section"
  CourseOffering ||--o{ AttendanceSession : "courseOffering"
  User ||--o{ AttendanceSession : "takenBy"
  AttendanceSession ||--o{ AttendanceRecord : "session"
  Student ||--o{ AttendanceRecord : "student"
  User |o--o{ AuditLog : "actor"
  CourseOffering ||--o{ TimetableEntry : "courseOffering"
  Room ||--o{ TimetableEntry : "room"
  TimeSlot ||--o{ TimetableEntry : "timeSlot"
  Semester ||--o{ TimetableEntry : "semester"
  Semester ||--o{ Exam : "semester"
  Exam ||--o{ ExamSubject : "exam"
  CourseOffering ||--o{ ExamSubject : "courseOffering"
  ExamSubject ||--o{ Mark : "examSubject"
  Student ||--o{ Mark : "student"
  User ||--o{ Mark : "enteredBy"
  Student ||--o{ Result : "student"
  Semester ||--o{ Result : "semester"
  Result ||--o{ ResultCourse : "result"
  Course ||--o{ ResultCourse : "course"
  CourseOffering ||--o{ Assignment : "courseOffering"
  User ||--o{ Assignment : "createdBy"
  Assignment ||--o{ Submission : "assignment"
  Student ||--o{ Submission : "student"
  User |o--o{ Submission : "gradedBy"
  CourseOffering ||--o{ Material : "courseOffering"
  User ||--o{ Material : "createdBy"
  Program |o--o{ Notice : "program"
  Section |o--o{ Notice : "section"
  User ||--o{ Notice : "createdBy"
  Notice ||--o{ NoticeRead : "notice"
  User ||--o{ NoticeRead : "user"
  Program |o--o{ Event : "program"
  Section |o--o{ Event : "section"
  User ||--o{ Event : "createdBy"
  Program ||--o{ FeeStructure : "program"
  AcademicYear ||--o{ FeeStructure : "academicYear"
  FeeStructure ||--o{ FeeStructureItem : "feeStructure"
  FeeHead ||--o{ FeeStructureItem : "feeHead"
  Student ||--o{ Invoice : "student"
  Semester ||--o{ Invoice : "semester"
  FeeStructure |o--o{ Invoice : "feeStructure"
  Invoice ||--o{ InvoiceItem : "invoice"
  FeeHead ||--o{ InvoiceItem : "feeHead"
  Invoice ||--o{ Payment : "invoice"
  User |o--o{ Payment : "recordedBy"
  User ||--o{ Notification : "user"
  User ||--o{ NotificationPreference : "user"
  User ||--o{ ChatConversation : "user"
  ChatConversation ||--o{ ChatMessage : "conversation"
  User ||--o{ PolicyDocument : "uploadedBy"
  PolicyDocument ||--o{ PolicyChunk : "document"
  Student ||--o{ RiskPrediction : "student"
  CourseOffering ||--o{ RiskPrediction : "courseOffering"
  User |o--o{ RiskPrediction : "reviewedBy"
  CourseOffering ||--o{ Quiz : "courseOffering"
  User ||--o{ Quiz : "createdBy"
  Quiz ||--o{ QuizQuestion : "quiz"
  Quiz ||--o{ QuizAttempt : "quiz"
  Student ||--o{ QuizAttempt : "student"
  QuizAttempt ||--o{ QuizAnswer : "attempt"
  QuizQuestion ||--o{ QuizAnswer : "question"
  Teacher ||--o{ TeacherUnavailability : "teacher"
  TimeSlot ||--o{ TeacherUnavailability : "timeSlot"
  User |o--o{ AiCallLog : "user"
```

## People and access

```mermaid
erDiagram
  User {
    String id PK
    String email UK
    String passwordHash
    Role role
    String firstName
    String lastName
    String phone
    String avatarUrl
    Boolean isActive
    Boolean mustChangePassword
    DateTime lastLoginAt
    Int failedLoginCount
    DateTime lockedUntil
    DateTime createdAt
    DateTime updatedAt
  }
  RefreshToken {
    String id PK
    String userId FK
    String tokenHash UK
    DateTime expiresAt
    DateTime revokedAt
    DateTime createdAt
  }
  Teacher {
    String id PK
    String userId FK
    String employeeCode UK
    String departmentId FK
    String designation
  }
  Student {
    String id PK
    String userId FK
    String rollNumber UK
    String registrationNumber UK
    String programId FK
    String currentSectionId FK
    DateTime admissionDate
    DateTime dateOfBirth
    String address
    String guardianName
    String guardianPhone
  }
  Parent {
    String id PK
    String userId FK
  }
  ParentStudent {
    String parentId FK
    String studentId FK
    String relation
  }
  AuditLog {
    String id PK
    String actorId FK
    String action
    String entity
    String entityId
    Json before
    Json after
    DateTime createdAt
  }
  User ||--o{ RefreshToken : "user"
  User ||--o| Teacher : "user"
  Department ||--o{ Teacher : "department"
  User ||--o| Student : "user"
  Program ||--o{ Student : "program"
  Section ||--o{ Student : "currentSection"
  User ||--o| Parent : "user"
  Parent ||--o{ ParentStudent : "parent"
  Student ||--o{ ParentStudent : "student"
  User |o--o{ AuditLog : "actor"
```

## Academic structure

```mermaid
erDiagram
  Department {
    String id PK
    String name
    String code UK
  }
  Program {
    String id PK
    String departmentId FK
    String name
    String code UK
    Int durationSemesters
    GradingScheme gradingScheme
  }
  AcademicYear {
    String id PK
    String name UK
    DateTime startDate
    DateTime endDate
    Boolean isCurrent
  }
  Semester {
    String id PK
    String programId FK
    String academicYearId FK
    Int number
    DateTime startDate
    DateTime endDate
  }
  Section {
    String id PK
    String semesterId FK
    String name
  }
  Course {
    String id PK
    String programId FK
    String code
    String title
    Int creditHours
    Int semesterNumber
    Boolean hasPractical
  }
  CourseOffering {
    String id PK
    String courseId FK
    String sectionId FK
    String teacherId FK
    Int weeklyTheoryPeriods
    Int weeklyLabPeriods
  }
  Enrollment {
    String id PK
    String studentId FK
    String sectionId FK
    EnrollmentStatus status
  }
  Department ||--o{ Program : "department"
  Program ||--o{ Semester : "program"
  AcademicYear ||--o{ Semester : "academicYear"
  Semester ||--o{ Section : "semester"
  Program ||--o{ Course : "program"
  Course ||--o{ CourseOffering : "course"
  Section ||--o{ CourseOffering : "section"
  Teacher ||--o{ CourseOffering : "teacher"
  Student ||--o{ Enrollment : "student"
  Section ||--o{ Enrollment : "section"
```

## Attendance

```mermaid
erDiagram
  AttendanceSession {
    String id PK
    String courseOfferingId FK
    DateTime date
    Int period
    String takenById FK
    DateTime createdAt
  }
  AttendanceRecord {
    String id PK
    String sessionId FK
    String studentId FK
    AttendanceStatus status
    String remark
  }
  CourseOffering ||--o{ AttendanceSession : "courseOffering"
  User ||--o{ AttendanceSession : "takenBy"
  AttendanceSession ||--o{ AttendanceRecord : "session"
  Student ||--o{ AttendanceRecord : "student"
```

## Timetable

```mermaid
erDiagram
  Room {
    String id PK
    String name UK
    Int capacity
    RoomType type
  }
  TimeSlot {
    String id PK
    Int dayOfWeek
    String startTime
    String endTime
    String label
  }
  TimetableEntry {
    String id PK
    String courseOfferingId FK
    String roomId FK
    String timeSlotId FK
    String semesterId FK
  }
  TeacherUnavailability {
    String teacherId FK
    String timeSlotId FK
  }
  CourseOffering ||--o{ TimetableEntry : "courseOffering"
  Room ||--o{ TimetableEntry : "room"
  TimeSlot ||--o{ TimetableEntry : "timeSlot"
  Semester ||--o{ TimetableEntry : "semester"
  Teacher ||--o{ TeacherUnavailability : "teacher"
  TimeSlot ||--o{ TeacherUnavailability : "timeSlot"
```

## Exams and results

```mermaid
erDiagram
  Exam {
    String id PK
    String semesterId FK
    String name
    ExamType type
    DateTime startDate
    DateTime endDate
    Boolean isPublished
  }
  ExamSubject {
    String id PK
    String examId FK
    String courseOfferingId FK
    Decimal fullMarks
    Decimal passMarks
    DateTime date
  }
  Mark {
    String id PK
    String examSubjectId FK
    String studentId FK
    Decimal marksObtained
    Boolean isAbsent
    String enteredById FK
    DateTime updatedAt
  }
  GradeScale {
    String id PK
    GradingScheme scheme
    Decimal minPercent
    Decimal maxPercent
    String grade
    Decimal gradePoint
  }
  Result {
    String id PK
    String studentId FK
    String semesterId FK
    Decimal gpa
    Int totalCredits
    ResultStatus status
    DateTime publishedAt
  }
  ResultCourse {
    String id PK
    String resultId FK
    String courseId FK
    Decimal percent
    String grade
    Decimal gradePoint
    Int creditHours
  }
  Semester ||--o{ Exam : "semester"
  Exam ||--o{ ExamSubject : "exam"
  CourseOffering ||--o{ ExamSubject : "courseOffering"
  ExamSubject ||--o{ Mark : "examSubject"
  Student ||--o{ Mark : "student"
  User ||--o{ Mark : "enteredBy"
  Student ||--o{ Result : "student"
  Semester ||--o{ Result : "semester"
  Result ||--o{ ResultCourse : "result"
  Course ||--o{ ResultCourse : "course"
```

## Assignments and materials

```mermaid
erDiagram
  Assignment {
    String id PK
    String courseOfferingId FK
    String title
    String description
    DateTime dueAt
    Decimal maxMarks
    Boolean allowLate
    Json attachments
    String createdById FK
    DateTime createdAt
    DateTime dueReminderSentAt
  }
  Submission {
    String id PK
    String assignmentId FK
    String studentId FK
    DateTime submittedAt
    Json files
    String text
    Boolean isLate
    Decimal marks
    String feedback
    String gradedById FK
    DateTime gradedAt
  }
  Material {
    String id PK
    String courseOfferingId FK
    String title
    String description
    Json files
    String createdById FK
    DateTime createdAt
  }
  CourseOffering ||--o{ Assignment : "courseOffering"
  User ||--o{ Assignment : "createdBy"
  Assignment ||--o{ Submission : "assignment"
  Student ||--o{ Submission : "student"
  User |o--o{ Submission : "gradedBy"
  CourseOffering ||--o{ Material : "courseOffering"
  User ||--o{ Material : "createdBy"
```

## Notices and notifications

```mermaid
erDiagram
  Notice {
    String id PK
    String title
    String body
    Audience audience
    String programId FK
    String sectionId FK
    Boolean isPinned
    DateTime publishAt
    DateTime expiresAt
    String createdById FK
    DateTime createdAt
    DateTime notifiedAt
  }
  NoticeRead {
    String noticeId FK
    String userId FK
    DateTime readAt
  }
  Event {
    String id PK
    String title
    String description
    DateTime startAt
    DateTime endAt
    String location
    Audience audience
    String programId FK
    String sectionId FK
    String createdById FK
  }
  Notification {
    String id PK
    String userId FK
    String type
    String title
    String body
    String link
    DateTime readAt
    DateTime createdAt
  }
  NotificationPreference {
    String userId FK
    NotificationChannel channel
    String type
    Boolean enabled
  }
  Program |o--o{ Notice : "program"
  Section |o--o{ Notice : "section"
  User ||--o{ Notice : "createdBy"
  Notice ||--o{ NoticeRead : "notice"
  User ||--o{ NoticeRead : "user"
  Program |o--o{ Event : "program"
  Section |o--o{ Event : "section"
  User ||--o{ Event : "createdBy"
  User ||--o{ Notification : "user"
  User ||--o{ NotificationPreference : "user"
```

## Fees and payments

```mermaid
erDiagram
  FeeHead {
    String id PK
    String name
    String code UK
  }
  FeeStructure {
    String id PK
    String programId FK
    Int semesterNumber
    String academicYearId FK
  }
  FeeStructureItem {
    String id PK
    String feeStructureId FK
    String feeHeadId FK
    Int amountPaisa
  }
  Invoice {
    String id PK
    String invoiceNumber UK
    String studentId FK
    String semesterId FK
    String feeStructureId FK
    DateTime issueDate
    DateTime dueDate
    InvoiceStatus status
    Int totalPaisa
    Int paidPaisa
    Int finePaisa
    Int discountPaisa
    DateTime createdAt
  }
  InvoiceItem {
    String id PK
    String invoiceId FK
    String feeHeadId FK
    String description
    Int amountPaisa
  }
  FineRule {
    String id PK
    String name
    FineType type
    Int amountPaisa
    Int graceDays
    Int maxPaisa
  }
  Payment {
    String id PK
    String invoiceId FK
    Int amountPaisa
    PaymentMethod method
    PaymentStatus status
    String gatewayRef
    Json gatewayPayload
    String receiptNumber UK
    DateTime paidAt
    String recordedById FK
    DateTime createdAt
  }
  Counter {
    String name PK
    Int value
  }
  InstitutionSettings {
    String id PK
    String name
    String address
    String phone
    String email
    String principalName
    String logoDataUrl
  }
  Program ||--o{ FeeStructure : "program"
  AcademicYear ||--o{ FeeStructure : "academicYear"
  FeeStructure ||--o{ FeeStructureItem : "feeStructure"
  FeeHead ||--o{ FeeStructureItem : "feeHead"
  Student ||--o{ Invoice : "student"
  Semester ||--o{ Invoice : "semester"
  FeeStructure |o--o{ Invoice : "feeStructure"
  Invoice ||--o{ InvoiceItem : "invoice"
  FeeHead ||--o{ InvoiceItem : "feeHead"
  Invoice ||--o{ Payment : "invoice"
  User |o--o{ Payment : "recordedBy"
```

## AI features

```mermaid
erDiagram
  ChatConversation {
    String id PK
    String userId FK
    String title
    String providerStateId
    DateTime createdAt
    DateTime updatedAt
  }
  ChatMessage {
    String id PK
    String conversationId FK
    ChatRole role
    Json content
    Int tokensIn
    Int tokensOut
    DateTime createdAt
  }
  PolicyDocument {
    String id PK
    String title
    Json file
    String uploadedById FK
    DateTime createdAt
  }
  PolicyChunk {
    String id PK
    String documentId FK
    Int position
    String content
  }
  RiskPrediction {
    String id PK
    String studentId FK
    String courseOfferingId FK
    Float probability
    RiskLevel level
    Json factors
    DateTime computedAt
    DateTime reviewedAt
    String reviewedById FK
    String reviewNote
    DateTime nudgedAt
  }
  Quiz {
    String id PK
    String courseOfferingId FK
    String title
    QuizStatus status
    String sourceText
    DateTime opensAt
    DateTime closesAt
    DateTime publishedAt
    String createdById FK
    DateTime createdAt
  }
  QuizQuestion {
    String id PK
    String quizId FK
    Int position
    QuizQuestionType type
    String question
    Json options
    String correctAnswer
    String explanation
    QuizDifficulty difficulty
    String sourceSnippet
    Boolean approved
  }
  QuizAttempt {
    String id PK
    String quizId FK
    String studentId FK
    DateTime startedAt
    DateTime submittedAt
  }
  QuizAnswer {
    String id PK
    String attemptId FK
    String questionId FK
    String answer
    Boolean isCorrect
    String gradedById
    DateTime gradedAt
  }
  AiCallLog {
    String id PK
    String userId FK
    String feature
    String model
    Int tokensIn
    Int tokensOut
    Int latencyMs
    Boolean succeeded
    String errorCode
    DateTime createdAt
  }
  User ||--o{ ChatConversation : "user"
  ChatConversation ||--o{ ChatMessage : "conversation"
  User ||--o{ PolicyDocument : "uploadedBy"
  PolicyDocument ||--o{ PolicyChunk : "document"
  Student ||--o{ RiskPrediction : "student"
  CourseOffering ||--o{ RiskPrediction : "courseOffering"
  User |o--o{ RiskPrediction : "reviewedBy"
  CourseOffering ||--o{ Quiz : "courseOffering"
  User ||--o{ Quiz : "createdBy"
  Quiz ||--o{ QuizQuestion : "quiz"
  Quiz ||--o{ QuizAttempt : "quiz"
  Student ||--o{ QuizAttempt : "student"
  QuizAttempt ||--o{ QuizAnswer : "attempt"
  QuizQuestion ||--o{ QuizAnswer : "question"
  User |o--o{ AiCallLog : "user"
```
