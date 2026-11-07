/**
 * Demo data for local development: `pnpm db:seed`.
 * Replaces everything in the database, so it refuses to run in production.
 * The random generator has a fixed seed, so every run produces the same data.
 */
import { AttendanceStatus, PrismaClient, type Role, type Student } from '@prisma/client';
import bcrypt from 'bcrypt';
import { retryOnConnectionError } from '../src/lib/prisma.js';
import { chunkText } from '../src/services/chunking.js';
import { findClashes } from '../src/services/clashes.js';
import { recomputeSemesterResults } from '../src/services/grading.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The demo seed replaces all data and must not run in production.');
}

// The seed sends thousands of small writes across the internet, so it retries each of them. It
// can do what the app cannot: if a retried write did already happen, the seed just fails, and
// running it again starts cleanly.
const prisma = new PrismaClient().$extends({
  name: 'retry-everything',
  query: {
    $allModels: {
      $allOperations({ args, query }) {
        return retryOnConnectionError(() => query(args), 5, 1000);
      },
    },
  },
}) as unknown as PrismaClient;

const DEMO_PASSWORD = 'Shikshya@123';
const EMAIL_DOMAIN = 'shikshya.test';

// A small seeded generator (mulberry32), so attendance varies but stays repeatable.
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = createRandom(20260601);

const COLLEGE_RULES = `Attendance rules

Students must attend at least 75 percent of the classes held in each course to sit the final examination. Late arrival counts as present. An excused absence, approved by the department head with a medical certificate or similar evidence, is left out of the calculation. A student below 75 percent must meet the department head before the examination form can be accepted.

Examination rules

Students must bring their college ID card to every examination, and arrive at least 15 minutes before it starts. Nobody may enter the hall more than 30 minutes after the start. Phones and smart watches must be switched off and left at the front of the hall. Copying, or helping another student to copy, leads to the paper being cancelled.

Internal assessment makes up 40 percent of a theory course, and the final examination 60 percent. A student must pass both separately. Rechecking of a paper may be requested within 15 days of the results being published, for a fee of Rs. 500 per paper.

Grading

Grades follow the Tribhuvan University scale, from A at 4.0 down to F at 0.0. A minimum grade of C is needed to pass a course. The semester GPA is the credit-weighted average of course grade points, and the CGPA is the same across all completed semesters.

Fees

Semester fees are due within 25 days of the invoice date. A fine of Rs. 50 a day applies after a 7 day grace period, up to a maximum of Rs. 2,000. Students with unpaid fees may be stopped from sitting the final examination. Fees can be paid online with eSewa or Khalti, or at the accounts office from 10 am to 3 pm on working days.

Library

The library is open from 7 am to 6 pm, Sunday to Friday. Students may borrow up to 3 books for 14 days. A late return costs Rs. 5 a day per book. A lost book must be replaced, or paid for at its current price.

Conduct

Students must wear their college ID card on campus. Ragging, harassment and discrimination of any kind are not tolerated, and lead to suspension. Complaints may be made in confidence to the student welfare office, which responds within 7 working days.

Leave

Leave of up to 3 days is approved by the class teacher, and longer leave by the department head. Leave must be requested in advance except in an emergency, and it does not reduce the 75 percent attendance requirement unless it is recorded as an excused absence.`;

const FIRST_NAMES = [
  'Aarav',
  'Aayush',
  'Abishek',
  'Anil',
  'Anish',
  'Bibek',
  'Bikash',
  'Binod',
  'Deepak',
  'Dipesh',
  'Ganesh',
  'Hari',
  'Kiran',
  'Manish',
  'Nabin',
  'Prabin',
  'Rajan',
  'Roshan',
  'Sagar',
  'Suman',
  'Aasha',
  'Anjali',
  'Anita',
  'Bina',
  'Deepa',
  'Gita',
  'Kritika',
  'Laxmi',
  'Manisha',
  'Nisha',
  'Pooja',
  'Pratima',
  'Puja',
  'Rachana',
  'Rekha',
  'Sabina',
  'Sarita',
  'Shristi',
  'Sita',
  'Sunita',
];
const LAST_NAMES = [
  'Sharma',
  'Adhikari',
  'Shrestha',
  'Thapa',
  'Gurung',
  'Tamang',
  'Rai',
  'Karki',
  'Basnet',
  'Poudel',
];

const COURSES = [
  { code: 'CSC364', title: 'Software Engineering', credits: 3, practical: true },
  { code: 'CSC365', title: 'Compiler Design and Construction', credits: 3, practical: true },
  { code: 'CSC366', title: 'E-Governance', credits: 3, practical: false },
  { code: 'CSC367', title: 'NET Centric Computing', credits: 3, practical: true },
  { code: 'CSC368', title: 'Technical Writing', credits: 3, practical: false },
  { code: 'CSC369', title: 'Applied Logic', credits: 3, practical: false },
];

const TEACHERS = [
  { first: 'Ramesh', last: 'Koirala', designation: 'Associate Professor' },
  { first: 'Sushila', last: 'Bhandari', designation: 'Assistant Professor' },
  { first: 'Prakash', last: 'Pandey', designation: 'Lecturer' },
  { first: 'Meena', last: 'Joshi', designation: 'Lecturer' },
];

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Today's calendar date in Nepal, as a UTC midnight, which is how dates are stored. */
function todayInKathmandu() {
  const text = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
  return new Date(text);
}

/** Empties every table, so this keeps working as later phases add more of them. */
async function clearDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/**
 * The grading table published by TU's Central Department of CS & IT.
 * It lives in the database, so a college can adjust it without a code change.
 */
const TU_GRADE_SCALE = [
  { grade: 'A', minPercent: 90, maxPercent: 100, gradePoint: 4.0 },
  { grade: 'A-', minPercent: 80, maxPercent: 90, gradePoint: 3.7 },
  { grade: 'B+', minPercent: 70, maxPercent: 80, gradePoint: 3.3 },
  { grade: 'B', minPercent: 60, maxPercent: 70, gradePoint: 3.0 },
  { grade: 'B-', minPercent: 50, maxPercent: 60, gradePoint: 2.7 },
  { grade: 'C', minPercent: 40, maxPercent: 50, gradePoint: 2.3 },
  { grade: 'F', minPercent: 0, maxPercent: 40, gradePoint: 0 },
];

const PERIODS = [
  ['07:00', '07:50'],
  ['07:50', '08:40'],
  ['08:40', '09:30'],
  ['09:50', '10:40'],
  ['10:40', '11:30'],
  ['11:30', '12:20'],
] as const;

async function main() {
  await clearDatabase();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const account = (email: string, role: Role, firstName: string, lastName: string) => ({
    email: `${email}@${EMAIL_DOMAIN}`,
    passwordHash,
    role,
    firstName,
    lastName,
  });

  await prisma.user.create({ data: account('superadmin', 'SUPER_ADMIN', 'Super', 'Admin') });
  const adminUser = await prisma.user.create({
    data: account('admin', 'ADMIN', 'Shanta', 'Regmi'),
  });
  await prisma.gradeScale.createMany({ data: TU_GRADE_SCALE });
  await prisma.user.create({ data: account('accountant', 'ACCOUNTANT', 'Bimala', 'Khadka') });
  await prisma.institutionSettings.create({
    data: {
      id: 'default',
      name: 'Shikshya Demo College',
      address: 'Baneshwor, Kathmandu, Nepal',
      phone: '+977 1 4000000',
      email: 'info@shikshya.test',
      principalName: 'Dr. Shanta Regmi',
    },
  });

  const department = await prisma.department.create({
    data: { name: 'Computer Science', code: 'CS' },
  });
  const csit = await prisma.program.create({
    data: {
      departmentId: department.id,
      name: 'BSc. CSIT',
      code: 'CSIT',
      durationSemesters: 8,
    },
  });
  await prisma.program.create({
    data: {
      departmentId: department.id,
      name: 'Bachelor of Information Technology',
      code: 'BIT',
      durationSemesters: 8,
    },
  });

  const today = todayInKathmandu();
  const thisYear = today.getUTCFullYear();
  const year = await prisma.academicYear.create({
    data: {
      name: `${thisYear}/${String(thisYear + 1).slice(2)}`,
      startDate: new Date(Date.UTC(thisYear, 0, 1)),
      endDate: new Date(Date.UTC(thisYear, 11, 31)),
      isCurrent: true,
    },
  });

  // Semesters 1-8 for CSIT. Odd and even run in alternating halves of the year.
  const semesters = await Promise.all(
    Array.from({ length: 8 }, (_, i) => i + 1).map((number) => {
      const firstHalf = number % 2 === 1;
      return prisma.semester.create({
        data: {
          programId: csit.id,
          academicYearId: year.id,
          number,
          startDate: new Date(Date.UTC(thisYear, firstHalf ? 0 : 6, 1)),
          endDate: new Date(Date.UTC(thisYear, firstHalf ? 5 : 11, 30)),
        },
      });
    }),
  );
  // Semester 6 is the one in progress, whatever date the seed happens to run on.
  const semester6 = await prisma.semester.update({
    where: { id: semesters.find((s) => s.number === 6)!.id },
    data: { startDate: addDays(today, -90), endDate: addDays(today, 90) },
  });

  const sectionA = await prisma.section.create({ data: { semesterId: semester6.id, name: 'A' } });
  const sectionB = await prisma.section.create({ data: { semesterId: semester6.id, name: 'B' } });

  const courses = await Promise.all(
    COURSES.map((c) =>
      prisma.course.create({
        data: {
          programId: csit.id,
          code: c.code,
          title: c.title,
          creditHours: c.credits,
          semesterNumber: 6,
          hasPractical: c.practical,
        },
      }),
    ),
  );

  const teachers = await Promise.all(
    TEACHERS.map((t, i) =>
      prisma.teacher.create({
        data: {
          employeeCode: `T-${String(i + 1).padStart(3, '0')}`,
          designation: t.designation,
          department: { connect: { id: department.id } },
          user: {
            create: account(`teacher${i + 1}`, 'TEACHER', t.first, t.last),
          },
        },
      }),
    ),
  );

  // Every course runs in both sections, shared out between the four teachers in turn.
  const offerings = [];
  let nextTeacher = 0;
  for (const section of [sectionA, sectionB]) {
    for (const course of courses) {
      const teacher = teachers[nextTeacher % teachers.length]!;
      nextTeacher += 1;
      offerings.push(
        await prisma.courseOffering.create({
          data: { courseId: course.id, sectionId: section.id, teacherId: teacher.id },
        }),
      );
    }
  }

  // 40 students, 20 in each section.
  const students: Student[] = [];
  for (let i = 0; i < 40; i += 1) {
    const number = String(i + 1).padStart(2, '0');
    const section = i < 20 ? sectionA : sectionB;
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last = LAST_NAMES[i % LAST_NAMES.length]!;
    students.push(
      await prisma.student.create({
        data: {
          rollNumber: `CSIT-078-${number}`,
          registrationNumber: `5-2-37-${100 + i}-2021`,
          admissionDate: new Date(Date.UTC(thisYear - 3, 10, 15)),
          dateOfBirth: new Date(Date.UTC(2002, i % 12, (i % 27) + 1)),
          address: 'Kathmandu, Nepal',
          guardianName: `${FIRST_NAMES[(i + 7) % FIRST_NAMES.length]} ${last}`,
          guardianPhone: `98000${String(10000 + i)}`,
          program: { connect: { id: csit.id } },
          currentSection: { connect: { id: section.id } },
          enrollments: { create: { sectionId: section.id } },
          user: { create: account(`student${number}`, 'STUDENT', first, last) },
        },
      }),
    );
  }

  // 5 parents. The first has two children, so the child switcher can be demonstrated.
  for (let i = 0; i < 5; i += 1) {
    const childOne = students[i * 2]!;
    const childTwo = i === 0 ? students[1]! : null;
    const childUser = await prisma.user.findUniqueOrThrow({ where: { id: childOne.userId } });
    await prisma.parent.create({
      data: {
        user: {
          create: account(
            `parent${i + 1}`,
            'PARENT',
            FIRST_NAMES[(i * 2 + 7) % FIRST_NAMES.length]!,
            childUser.lastName,
          ),
        },
        children: {
          create: [
            { studentId: childOne.id, relation: i % 2 === 0 ? 'Father' : 'Mother' },
            ...(childTwo ? [{ studentId: childTwo.id, relation: 'Father' }] : []),
          ],
        },
      },
    });
  }

  // ---------- Rooms, time slots and a clash-free timetable ----------

  const rooms = await Promise.all(
    [
      { name: 'Room 301', capacity: 48, type: 'CLASSROOM' as const },
      { name: 'Room 302', capacity: 48, type: 'CLASSROOM' as const },
      { name: 'Room 303', capacity: 48, type: 'CLASSROOM' as const },
      { name: 'Computer Lab 1', capacity: 30, type: 'LAB' as const },
      { name: 'Seminar Hall', capacity: 120, type: 'HALL' as const },
    ].map((data) => prisma.room.create({ data })),
  );
  const classrooms = rooms.filter((room) => room.type === 'CLASSROOM');

  // Sunday to Friday, 6 periods. Saturday is the weekend in Nepal.
  const slots = [];
  for (const dayOfWeek of [0, 1, 2, 3, 4, 5]) {
    for (const [index, [startTime, endTime]] of PERIODS.entries()) {
      slots.push(
        await prisma.timeSlot.create({
          data: { dayOfWeek, startTime, endTime, label: `Period ${index + 1}` },
        }),
      );
    }
  }
  const periodOf = (slot: { startTime: string }) =>
    PERIODS.findIndex(([startTime]) => startTime === slot.startTime) + 1;

  // Each offering meets on 3 different days. A slot is taken greedily when the teacher,
  // the section and a classroom are all free. Every course in this seed fits this way.
  const placed: {
    id: string;
    timeSlotId: string;
    roomId: string;
    teacherId: string;
    sectionId: string;
  }[] = [];
  const timetable = new Map<string, typeof slots>();
  for (const [index, offering] of offerings.entries()) {
    const chosen: typeof slots = [];
    const startDay = index % 6;
    for (let step = 0; step < 6 && chosen.length < 3; step += 2) {
      const day = (startDay + step) % 6;
      for (const slot of slots.filter((candidate) => candidate.dayOfWeek === day)) {
        const here = placed.filter((entry) => entry.timeSlotId === slot.id);
        const busy =
          here.some((entry) => entry.teacherId === offering.teacherId) ||
          here.some((entry) => entry.sectionId === offering.sectionId);
        const room = classrooms.find((r) => !here.some((entry) => entry.roomId === r.id));
        if (busy || !room) continue;

        const entry = await prisma.timetableEntry.create({
          data: {
            courseOfferingId: offering.id,
            roomId: room.id,
            timeSlotId: slot.id,
            semesterId: semester6.id,
          },
        });
        placed.push({
          id: entry.id,
          timeSlotId: slot.id,
          roomId: room.id,
          teacherId: offering.teacherId,
          sectionId: offering.sectionId,
        });
        chosen.push(slot);
        break;
      }
    }
    timetable.set(offering.id, chosen);
  }
  const clashes = findClashes(placed);
  if (clashes.length > 0) throw new Error(`The seed timetable has clashes: ${clashes.length}`);

  // ---------- Three weeks of attendance, on the days each class actually meets ----------

  const rosterOf = (sectionId: string) => students.filter((s) => s.currentSectionId === sectionId);

  // Each student has a typical attendance rate. About one in six sits below 75%.
  const attendanceRate = new Map(
    students.map((student, i) => [
      student.id,
      i % 6 === 2 ? 0.45 + random() * 0.22 : 0.82 + random() * 0.17,
    ]),
  );

  const pickStatus = (rate: number): AttendanceStatus => {
    const roll = random();
    if (roll < rate) return random() < 0.08 ? 'LATE' : 'PRESENT';
    return random() < 0.1 ? 'EXCUSED' : 'ABSENT';
  };

  let sessionCount = 0;
  for (const [index, offering] of offerings.entries()) {
    const teacher = teachers.find((t) => t.id === offering.teacherId)!;
    for (const slot of timetable.get(offering.id) ?? []) {
      for (let back = 21; back >= 1; back -= 1) {
        const day = addDays(today, -back);
        if (day.getUTCDay() !== slot.dayOfWeek) continue;
        // The most recent class of the first offering is left out, so "pending attendance"
        // has something to show.
        if (index === 0 && back <= 6) continue;
        await prisma.attendanceSession.create({
          data: {
            courseOfferingId: offering.id,
            date: new Date(iso(day)),
            period: periodOf(slot),
            takenById: teacher.userId,
            records: {
              create: rosterOf(offering.sectionId).map((student) => ({
                studentId: student.id,
                status: pickStatus(attendanceRate.get(student.id)!),
              })),
            },
          },
        });
        sessionCount += 1;
      }
    }
  }

  // ---------- Exams: one published with results, one still open for marks ----------

  const internal = await prisma.exam.create({
    data: {
      semesterId: semester6.id,
      name: 'First Term',
      type: 'INTERNAL',
      startDate: addDays(today, -30),
      endDate: addDays(today, -24),
    },
  });
  const upcoming = await prisma.exam.create({
    data: {
      semesterId: semester6.id,
      name: 'Pre-board',
      type: 'INTERNAL',
      startDate: addDays(today, 5),
      endDate: addDays(today, 11),
    },
  });

  // Each student has a typical ability, so one student's marks are consistent across courses.
  const ability = new Map(students.map((s, i) => [s.id, i % 7 === 3 ? 30 : 55 + random() * 40]));

  for (const [index, offering] of offerings.entries()) {
    const teacher = teachers.find((t) => t.id === offering.teacherId)!;
    const subject = await prisma.examSubject.create({
      data: {
        examId: internal.id,
        courseOfferingId: offering.id,
        fullMarks: 100,
        passMarks: 40,
        date: new Date(iso(addDays(today, -30 + (index % 6)))),
      },
    });
    await prisma.mark.createMany({
      data: rosterOf(offering.sectionId).map((student, position) => {
        // One student in each section misses one paper, to show how absence is graded.
        const isAbsent = position === 5 && index % 6 === 2;
        const score = ability.get(student.id)! + (random() - 0.5) * 16;
        return {
          examSubjectId: subject.id,
          studentId: student.id,
          isAbsent,
          marksObtained: isAbsent ? null : Math.round(Math.min(100, Math.max(0, score))),
          enteredById: teacher.userId,
        };
      }),
    });
    await prisma.examSubject.create({
      data: {
        examId: upcoming.id,
        courseOfferingId: offering.id,
        fullMarks: 100,
        passMarks: 40,
        date: new Date(iso(addDays(today, 5 + (index % 6)))),
      },
    });
  }
  await prisma.exam.update({ where: { id: internal.id }, data: { isPublished: true } });
  await prisma.$transaction((tx) => recomputeSemesterResults(tx, semester6.id), {
    timeout: 60_000,
  });

  // ---------- Assignments, from long past to next week, with mixed submissions ----------

  const ASSIGNMENTS = [
    { title: 'Requirements document for a library system', due: -14, late: false, handedIn: 1 },
    { title: 'Lexical analyser in C', due: -7, late: true, handedIn: 0.8 },
    { title: 'E-governance case study: Nagarik app', due: -2, late: false, handedIn: 0.7 },
    { title: 'REST API with ASP.NET Core', due: 3, late: true, handedIn: 0.4 },
    { title: 'Technical report outline', due: 6, late: false, handedIn: 0.2 },
    { title: 'Propositional logic problem set', due: 10, late: false, handedIn: 0 },
  ];
  for (const [index, spec] of ASSIGNMENTS.entries()) {
    const offering = offerings[index]!;
    const teacher = teachers.find((t) => t.id === offering.teacherId)!;
    const dueAt = addDays(new Date(), spec.due);
    const assignment = await prisma.assignment.create({
      data: {
        courseOfferingId: offering.id,
        title: spec.title,
        description: `Complete **${spec.title}** and submit it here.\n\n- Cite your sources\n- Keep it concise`,
        dueAt,
        maxMarks: 20,
        allowLate: spec.late,
        createdById: teacher.userId,
      },
    });
    for (const student of rosterOf(offering.sectionId)) {
      if (random() > spec.handedIn) continue;
      const isLate = spec.late && spec.due < 0 && random() < 0.25;
      const graded = spec.due <= -7;
      await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: student.id,
          submittedAt: addDays(dueAt, isLate ? 1 : -1),
          text: 'My submission for this assignment.',
          isLate,
          marks: graded ? 10 + Math.floor(random() * 11) : null,
          feedback: graded ? 'Well structured. Check your references.' : null,
          gradedById: graded ? teacher.userId : null,
          gradedAt: graded ? addDays(dueAt, 3) : null,
        },
      });
    }
  }

  // ---------- Notices and events ----------

  const NOTICES = [
    {
      title: 'Welcome to the new semester',
      body: 'Classes for this semester are now **in session**. Check your timetable for rooms.',
      audience: 'ALL' as const,
      isPinned: true,
    },
    {
      title: 'Pre-board examination routine published',
      body: 'The Pre-board examinations begin next week. See your dashboard for dates.',
      audience: 'STUDENTS' as const,
      isPinned: true,
    },
    {
      title: 'Marks submission deadline',
      body: 'Please enter all First Term marks before the department meeting.',
      audience: 'TEACHERS' as const,
    },
    {
      title: 'Parent-teacher meeting',
      body: 'Parents are invited to meet teachers this Friday from 10:00 to 13:00.',
      audience: 'PARENTS' as const,
    },
    {
      title: 'BSc. CSIT project proposal defence',
      body: 'Semester 6 students should prepare their project proposals for defence.',
      audience: 'PROGRAM' as const,
      programId: csit.id,
    },
    {
      title: 'Section A: lab rescheduled',
      body: 'The Sunday lab moves to **Computer Lab 1** for this week only.',
      audience: 'SECTION' as const,
      sectionId: sectionA.id,
    },
    {
      title: 'Section B: guest lecture',
      body: 'A guest lecture on cloud computing will take place on Thursday.',
      audience: 'SECTION' as const,
      sectionId: sectionB.id,
    },
    {
      title: 'Library hours extended',
      body: 'The library now stays open until 18:00 on weekdays.',
      audience: 'ALL' as const,
    },
  ];
  for (const [index, notice] of NOTICES.entries()) {
    await prisma.notice.create({
      data: { ...notice, publishAt: addDays(new Date(), -index), createdById: adminUser.id },
    });
  }

  const EVENTS = [
    {
      title: 'Sports week',
      days: 7,
      length: 3,
      location: 'College ground',
      audience: 'ALL' as const,
    },
    {
      title: 'Department meeting',
      days: 2,
      length: 0,
      location: 'Seminar Hall',
      audience: 'TEACHERS' as const,
    },
    {
      title: 'Project proposal defence',
      days: 14,
      length: 1,
      location: 'Seminar Hall',
      audience: 'STUDENTS' as const,
    },
    {
      title: 'Parent-teacher meeting',
      days: 4,
      length: 0,
      location: 'Room 301',
      audience: 'PARENTS' as const,
    },
  ];
  for (const { days, length, ...event } of EVENTS) {
    const startAt = addDays(new Date(`${iso(today)}T04:15:00.000Z`), days);
    await prisma.event.create({
      data: {
        ...event,
        startAt,
        endAt: new Date(addDays(startAt, length).getTime() + 3 * 3_600_000),
        createdById: adminUser.id,
      },
    });
  }

  // ---------- Fees: invoices for everyone, some paid, some part paid, some overdue ----------

  const feeHeads = await Promise.all(
    [
      { name: 'Tuition', code: 'TUITION', paisa: 4500000 },
      { name: 'Exam', code: 'EXAM', paisa: 300000 },
      { name: 'Library', code: 'LIBRARY', paisa: 100000 },
      { name: 'Lab', code: 'LAB', paisa: 250000 },
    ].map(async ({ paisa, ...data }) => ({ head: await prisma.feeHead.create({ data }), paisa })),
  );
  const structure = await prisma.feeStructure.create({
    data: {
      programId: csit.id,
      academicYearId: year.id,
      semesterNumber: 6,
      items: {
        create: feeHeads.map(({ head, paisa }) => ({ feeHeadId: head.id, amountPaisa: paisa })),
      },
    },
  });
  const totalPaisa = feeHeads.reduce((sum, { paisa }) => sum + paisa, 0);
  await prisma.fineRule.create({
    data: { name: 'Late fee', type: 'PER_DAY', amountPaisa: 5000, graceDays: 7, maxPaisa: 200000 },
  });

  const accountantUser = await prisma.user.findUniqueOrThrow({
    where: { email: `accountant@${EMAIL_DOMAIN}` },
  });
  const year4 = today.getUTCFullYear();
  const invoiceNumber = (n: number) => `SHK-${year4}-${String(n).padStart(6, '0')}`;
  const receiptNumber = (n: number) => `RCP-${year4}-${String(n).padStart(6, '0')}`;
  let receipts = 0;

  for (const [index, student] of students.entries()) {
    // Half paid in full, a few part paid, the rest unpaid. Every 8th is well past its due date.
    const overdue = index % 8 === 7;
    const paidPaisa = index % 2 === 0 ? totalPaisa : index % 5 === 0 ? 2000000 : 0;
    const dueDate = addDays(today, overdue ? -20 : 25);
    const fine = overdue && paidPaisa < totalPaisa ? 5000 * 13 : 0;
    const status =
      paidPaisa >= totalPaisa ? 'PAID' : overdue ? 'OVERDUE' : paidPaisa > 0 ? 'PARTIAL' : 'UNPAID';

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: invoiceNumber(index + 1),
        studentId: student.id,
        semesterId: semester6.id,
        feeStructureId: structure.id,
        issueDate: addDays(today, -35),
        dueDate,
        status,
        totalPaisa,
        paidPaisa,
        finePaisa: fine,
        items: {
          create: feeHeads.map(({ head, paisa }) => ({
            feeHeadId: head.id,
            description: head.name,
            amountPaisa: paisa,
          })),
        },
      },
    });
    if (paidPaisa > 0) {
      receipts += 1;
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amountPaisa: paidPaisa,
          method: (['ESEWA', 'KHALTI', 'CASH', 'BANK'] as const)[index % 4]!,
          status: 'SUCCESS',
          receiptNumber: receiptNumber(receipts),
          // Spread over the last few weeks, for the collections chart.
          paidAt: addDays(new Date(), -(index % 24)),
          recordedById: index % 4 >= 2 ? accountantUser.id : null,
        },
      });
    }
  }
  // Khalti's test mode only accepts small amounts (about Rs. 10 to 200), so this is the invoice
  // to use when trying Khalti in its sandbox.
  await prisma.invoice.create({
    data: {
      invoiceNumber: invoiceNumber(students.length + 1),
      studentId: students[1]!.id,
      semesterId: semester6.id,
      issueDate: addDays(today, -2),
      dueDate: addDays(today, 25),
      status: 'UNPAID',
      totalPaisa: 15000,
      items: {
        create: {
          feeHeadId: feeHeads.find(({ head }) => head.code === 'LIBRARY')!.head.id,
          description: 'Library fine',
          amountPaisa: 15000,
        },
      },
    },
  });

  await prisma.counter.createMany({
    data: [
      { name: `SHK-${year4}`, value: students.length + 1 },
      { name: `RCP-${year4}`, value: receipts },
    ],
  });

  // A couple of notifications, so the bell has something to show.
  const firstStudent = students[0]!;
  await prisma.notification.createMany({
    data: [
      {
        userId: firstStudent.userId,
        type: 'RESULT_PUBLISHED',
        title: 'Results published',
        body: 'Results for First Term are now available.',
        link: '/student/results',
      },
      {
        userId: firstStudent.userId,
        type: 'ASSIGNMENT_CREATED',
        title: 'New assignment',
        body: 'CSC364: "Requirements document for a library system".',
        link: '/student/assignments',
      },
    ],
  });


  // ---------- Phase 4 ----------

  // College rules, so the assistant has something to quote. They have no embeddings yet, so search
  // uses keywords until a Gemini key is set and an admin presses "Prepare search".
  await prisma.policyDocument.create({
    data: {
      title: 'College rules and regulations',
      file: {
        id: 'demo-college-rules.txt',
        name: 'college-rules.txt',
        size: COLLEGE_RULES.length,
        mimeType: 'text/plain',
      },
      uploadedById: adminUser.id,
      chunks: {
        create: chunkText(COLLEGE_RULES).map((content, position) => ({ content, position })),
      },
    },
  });

  // Quizzes for teacher 1, written by hand here so they can be shown without a Gemini key.
  const quizOffering = await prisma.courseOffering.findFirstOrThrow({
    where: { teacherId: teachers[0]!.id, section: { name: 'A' } },
    include: { teacher: { select: { userId: true } }, course: { select: { title: true } } },
  });
  const notes =
    'Software engineering applies engineering discipline to building software. The waterfall model runs through its phases in order, while agile methods deliver small working increments and adapt to change. Requirements describe what a system must do. Testing checks that it does so.';
  const publishedQuiz = await prisma.quiz.create({
    data: {
      courseOfferingId: quizOffering.id,
      title: `${quizOffering.course.title}: first chapters`,
      status: 'PUBLISHED',
      sourceText: notes,
      opensAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      closesAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      publishedAt: new Date(),
      createdById: quizOffering.teacher.userId,
      questions: {
        create: [
          {
            position: 0,
            type: 'MCQ',
            question: 'Which approach delivers small working increments and adapts to change?',
            options: ['Waterfall', 'Agile', 'Big bang', 'Code and fix'],
            correctAnswer: 'Agile',
            explanation: 'Agile methods deliver in small increments and welcome change.',
            difficulty: 'EASY',
            sourceSnippet: 'agile methods deliver small working increments',
            approved: true,
          },
          {
            position: 1,
            type: 'TRUE_FALSE',
            question: 'The waterfall model runs through its phases in order.',
            options: ['True', 'False'],
            correctAnswer: 'True',
            explanation: 'Each waterfall phase finishes before the next begins.',
            difficulty: 'EASY',
            sourceSnippet: 'The waterfall model runs through its phases in order',
            approved: true,
          },
          {
            position: 2,
            type: 'SHORT_ANSWER',
            question: 'In one sentence, what is the difference between requirements and testing?',
            correctAnswer:
              'Requirements say what a system must do, and testing checks that it does so.',
            explanation: 'One defines the goal, and the other checks that it was met.',
            difficulty: 'MEDIUM',
            sourceSnippet: 'Requirements describe what a system must do. Testing checks',
            approved: true,
          },
        ],
      },
    },
    include: { questions: { orderBy: { position: 'asc' } } },
  });
  // One student has already answered, so the marking screen has something to show.
  await prisma.quizAttempt.create({
    data: {
      quizId: publishedQuiz.id,
      studentId: students[1]!.id,
      submittedAt: new Date(),
      answers: {
        create: [
          { questionId: publishedQuiz.questions[0]!.id, answer: 'Agile', isCorrect: true },
          { questionId: publishedQuiz.questions[1]!.id, answer: 'False', isCorrect: false },
          {
            questionId: publishedQuiz.questions[2]!.id,
            answer: 'Requirements are what to build, and testing makes sure it works.',
            isCorrect: null,
          },
        ],
      },
    },
  });
  await prisma.quiz.create({
    data: {
      courseOfferingId: quizOffering.id,
      title: `${quizOffering.course.title}: draft to review`,
      sourceText: notes,
      createdById: quizOffering.teacher.userId,
      questions: {
        create: [
          {
            position: 0,
            type: 'MCQ',
            question: 'What do requirements describe?',
            options: [
              'What a system must do',
              'How fast a disk spins',
              'The office layout',
              'The tea break schedule',
            ],
            correctAnswer: 'What a system must do',
            explanation: 'The notes define requirements this way.',
            difficulty: 'EASY',
            sourceSnippet: 'Requirements describe what a system must do',
          },
          {
            position: 1,
            type: 'TRUE_FALSE',
            question: 'Testing checks that a system does what its requirements say.',
            options: ['True', 'False'],
            correctAnswer: 'True',
            explanation: 'That is the purpose of testing.',
            difficulty: 'EASY',
            sourceSnippet: 'Testing checks that it does so',
          },
        ],
      },
    },
  });

  // At-risk predictions come from the Python service, so this needs it running. If it is not, an
  // admin can press "Recalculate now" later, and otherwise the nightly job fills them in.
  try {
    const { computeRiskPredictions } = await import('../src/services/risk.service.js');
    const risk = await computeRiskPredictions();
    console.log(`\nAt-risk predictions: ${risk.computed} worked out, ${risk.flagged} flagged.`);
  } catch {
    console.log('\nSkipped at-risk predictions: the AI service is not running.');
  }

  console.log('\nSeed complete.');
  console.log(
    `  ${students.length} students, ${teachers.length} teachers, ${offerings.length} offerings, ${placed.length} timetable entries, ${sessionCount} attendance sessions\n`,
  );
  console.log(`Every account uses the password: ${DEMO_PASSWORD}\n`);
  console.table([
    { role: 'Super admin', email: `superadmin@${EMAIL_DOMAIN}` },
    { role: 'Admin', email: `admin@${EMAIL_DOMAIN}` },
    { role: 'Accountant', email: `accountant@${EMAIL_DOMAIN}` },
    { role: 'Teacher (1 to 4)', email: `teacher1@${EMAIL_DOMAIN}` },
    { role: 'Student (01 to 40)', email: `student01@${EMAIL_DOMAIN}` },
    { role: 'Student below 75%', email: `student03@${EMAIL_DOMAIN}` },
    { role: 'Parent of two (1 to 5)', email: `parent1@${EMAIL_DOMAIN}` },
  ]);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
