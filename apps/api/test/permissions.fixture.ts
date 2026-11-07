import type { Role } from '@shikshya/shared';
import { storage } from '../src/lib/storage.js';
import { createFixture, prisma, userData } from './helpers.js';

const pdf = () => ({
  buffer: Buffer.from('%PDF-1.4 test file'),
  originalname: 'file.pdf',
  mimetype: 'application/pdf',
});

/** The ids of one person's records and of the class they belong to. */
export interface Side {
  student: string;
  section: string;
  offering: string;
  session: string;
  examSubject: string;
  assignment: string;
  assignmentFile: string;
  submission: string;
  submissionFile: string;
  material: string;
  materialFile: string;
  notice: string;
  invoice: string;
  payment: string;
  notification: string;
  conversation: string;
  quiz: string;
  question: string;
  answer: string;
  risk: string;
}

/** The accounts that act in the tests, by role. */
export const EMAILS: Record<Role, string> = {
  SUPER_ADMIN: 'super@test.local',
  ADMIN: 'admin@test.local',
  TEACHER: 'teacher-a@test.local',
  STUDENT: 'student-a@test.local',
  PARENT: 'parent@test.local',
  ACCOUNTANT: 'accountant@test.local',
  LIBRARIAN: 'librarian@test.local',
};

/**
 * Two classes with something in every kind of record:
 *
 * - Side A: section A, taught by teacher A. Student A is the logged-in student, and the parent is
 *   student A's. So everything here belongs to the people acting in the tests.
 * - Side B: student B, in the same class as student A. For checking that classmates are kept apart.
 * - Side C: section C, taught by teacher B, with student C. Nothing here belongs to any of them.
 */
export async function createPermissionFixture() {
  const fx = await createFixture();
  await prisma.user.createMany({
    data: [
      userData(EMAILS.SUPER_ADMIN, 'SUPER_ADMIN'),
      userData(EMAILS.ACCOUNTANT, 'ACCOUNTANT'),
      userData(EMAILS.LIBRARIAN, 'LIBRARIAN'),
    ],
  });

  const sectionC = await prisma.section.create({
    data: { semesterId: fx.semester.id, name: 'C' },
  });
  const courseC = await prisma.course.create({
    data: {
      programId: fx.program.id,
      code: 'CSC999',
      title: 'Another Course',
      creditHours: 3,
      semesterNumber: 6,
    },
  });
  const offeringC = await prisma.courseOffering.create({
    data: { courseId: courseC.id, sectionId: sectionC.id, teacherId: fx.teacherB.id },
  });
  const studentC = await prisma.student.create({
    data: {
      rollNumber: 'student-c',
      program: { connect: { id: fx.program.id } },
      currentSection: { connect: { id: sectionC.id } },
      admissionDate: new Date('2023-01-01'),
      enrollments: { create: { sectionId: sectionC.id } },
      user: { create: userData('student-c@test.local', 'STUDENT') },
    },
  });

  const exam = await prisma.exam.create({
    data: {
      semesterId: fx.semester.id,
      name: 'Final',
      type: 'FINAL',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-10'),
      isPublished: true,
    },
  });
  const now = Date.now();

  const classRecords = async (offeringId: string, teacherUserId: string, label: string) => {
    const assignmentFile = await storage.save(pdf());
    const materialFile = await storage.save(pdf());
    const session = await prisma.attendanceSession.create({
      data: {
        courseOfferingId: offeringId,
        date: new Date('2026-04-01'),
        takenById: teacherUserId,
      },
    });
    const examSubject = await prisma.examSubject.create({
      data: { examId: exam.id, courseOfferingId: offeringId, fullMarks: 100, passMarks: 40 },
    });
    const assignment = await prisma.assignment.create({
      data: {
        courseOfferingId: offeringId,
        title: `Assignment ${label}`,
        description: 'Do the work',
        dueAt: new Date(now + 86_400_000),
        maxMarks: 10,
        attachments: [{ ...assignmentFile }],
        createdById: teacherUserId,
      },
    });
    const material = await prisma.material.create({
      data: {
        courseOfferingId: offeringId,
        title: `Material ${label}`,
        files: [{ ...materialFile }],
        createdById: teacherUserId,
      },
    });
    const quiz = await prisma.quiz.create({
      data: {
        courseOfferingId: offeringId,
        title: `Quiz ${label}`,
        status: 'PUBLISHED',
        sourceText: 'Notes',
        opensAt: new Date(now - 86_400_000),
        closesAt: new Date(now + 86_400_000),
        publishedAt: new Date(now - 86_400_000),
        createdById: teacherUserId,
        questions: {
          create: {
            position: 1,
            type: 'SHORT_ANSWER',
            question: 'What is software engineering?',
            correctAnswer: 'A discipline',
            explanation: 'Because it is',
            difficulty: 'EASY',
            sourceSnippet: 'It is a discipline',
            approved: true,
          },
        },
      },
      include: { questions: true },
    });
    return {
      session: session.id,
      examSubject: examSubject.id,
      assignment: assignment.id,
      assignmentFile: assignmentFile.id,
      material: material.id,
      materialFile: materialFile.id,
      quiz: quiz.id,
      question: quiz.questions[0]?.id ?? '',
    };
  };

  const personalRecords = async (
    student: { id: string; userId: string },
    records: Awaited<ReturnType<typeof classRecords>>,
    offeringId: string,
    teacherUserId: string,
    label: string,
  ) => {
    const submissionFile = await storage.save(pdf());
    const submission = await prisma.submission.create({
      data: {
        assignmentId: records.assignment,
        studentId: student.id,
        files: [{ ...submissionFile }],
      },
    });
    await prisma.mark.create({
      data: {
        examSubjectId: records.examSubject,
        studentId: student.id,
        marksObtained: 70,
        enteredById: teacherUserId,
      },
    });
    await prisma.result.create({
      data: {
        studentId: student.id,
        semesterId: fx.semester.id,
        gpa: 3.5,
        totalCredits: 3,
        status: 'PASS',
        publishedAt: new Date(now),
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${label}`,
        studentId: student.id,
        semesterId: fx.semester.id,
        issueDate: new Date('2026-01-01'),
        dueDate: new Date('2026-02-01'),
        totalPaisa: 100_000,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amountPaisa: 50_000,
        method: 'CASH',
        status: 'SUCCESS',
        receiptNumber: `RCP-${label}`,
        paidAt: new Date(now),
      },
    });
    const notification = await prisma.notification.create({
      data: { userId: student.userId, type: 'TEST', title: 'Hello', body: 'Hello there' },
    });
    const conversation = await prisma.chatConversation.create({
      data: {
        userId: student.userId,
        title: 'A chat',
        messages: { create: { role: 'USER', content: { text: 'Hello' } } },
      },
    });
    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId: records.quiz,
        studentId: student.id,
        submittedAt: new Date(now),
        answers: { create: { questionId: records.question, answer: 'An answer' } },
      },
      include: { answers: true },
    });
    const risk = await prisma.riskPrediction.create({
      data: {
        studentId: student.id,
        courseOfferingId: offeringId,
        probability: 0.8,
        level: 'HIGH',
        factors: [],
        computedAt: new Date(now),
      },
    });
    return {
      student: student.id,
      submission: submission.id,
      submissionFile: submissionFile.id,
      invoice: invoice.id,
      payment: payment.id,
      notification: notification.id,
      conversation: conversation.id,
      answer: attempt.answers[0]?.id ?? '',
      risk: risk.id,
    };
  };

  const teacherAUser = fx.teacherA.userId;
  const classA = await classRecords(fx.offering.id, teacherAUser, 'A');
  const classC = await classRecords(offeringC.id, fx.teacherB.userId, 'C');

  // Everyone can read teacher A's notice, and only teacher A may change it. Teacher B's is only
  // for section C, so it is out of reach for everyone acting in these tests.
  const noticeForAll = await prisma.notice.create({
    data: { title: 'For everyone', body: 'Hello', audience: 'ALL', createdById: teacherAUser },
  });
  const noticeForC = await prisma.notice.create({
    data: {
      title: 'For section C',
      body: 'Hello',
      audience: 'SECTION',
      sectionId: sectionC.id,
      createdById: fx.teacherB.userId,
    },
  });

  const sideOf = (
    section: string,
    offering: string,
    notice: string,
    records: Awaited<ReturnType<typeof classRecords>>,
    personal: Awaited<ReturnType<typeof personalRecords>>,
  ): Side => ({ section, offering, notice, ...records, ...personal });

  const a = sideOf(
    fx.section.id,
    fx.offering.id,
    noticeForAll.id,
    classA,
    await personalRecords(fx.studentA, classA, fx.offering.id, teacherAUser, 'A'),
  );
  const b = sideOf(
    fx.section.id,
    fx.offering.id,
    noticeForAll.id,
    classA,
    await personalRecords(fx.studentB, classA, fx.offering.id, teacherAUser, 'B'),
  );
  const c = sideOf(
    sectionC.id,
    offeringC.id,
    noticeForC.id,
    classC,
    await personalRecords(studentC, classC, offeringC.id, fx.teacherB.userId, 'C'),
  );

  // Everyone can chat with the assistant, so everyone needs a conversation of their own.
  const conversations = new Map<Role, string>();
  for (const [role, email] of Object.entries(EMAILS) as [Role, string][]) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const conversation = await prisma.chatConversation.create({
      data: {
        userId: user.id,
        title: 'My chat',
        messages: { create: { role: 'USER', content: { text: 'Hello' } } },
      },
    });
    conversations.set(role, conversation.id);
  }

  return { a, b, c, semesterId: fx.semester.id, conversations };
}

export type PermissionFixture = Awaited<ReturnType<typeof createPermissionFixture>>;
